import {
  type Cost,
  DecisionRecord,
  drawOption,
  Observation,
  toActorObservation,
  WayfordError,
} from "@wayford/core";
import {
  BANNED_ACTOR_WORDS,
  decisionRecordFixture,
  observationFixture,
  taskFixture,
} from "@wayford/core/fixtures";
import pino, { type Logger } from "pino";
import { describe, expect, test } from "vitest";
import { actorTurn, decisionDrawFor } from "./actor-backend.js";
import { fakeLlm } from "./fake-llm.js";
import { JEV_MAX_OPTIONS, jevActor, jevOptions, jevRequest } from "./jev-actor.js";
import { type DecideRequest, type Llm, LlmError } from "./llm.js";
import { parseLlmSettings } from "./llm-settings.js";
import { turnText } from "./prompts.js";

// Neither model has a price in models.yaml, so no test here can build the real adapter by mistake.
const settings = parseLlmSettings({
  LLM_API_KEY: "test-key",
  LLM_ACTOR_MODEL: "fake",
  LLM_JEV_MODEL: "fake-jev",
});

/** The fixture's `/deliveries` page as the Actor was shown it: e1 to e6, the archive link masked. */
const deliveries = toActorObservation(observationFixture);

const GOAL = taskFixture("task_past-order").goal;

/** The first step's turn on the fixture page. */
const turn = actorTurn(GOAL, deliveries, []);

/** A run's logger that writes nothing. */
function quiet(): Logger {
  return pino({ level: "silent" });
}

/** What `runActor` hands the factory for one run, its decision stream made from `seed`. */
function run(seed: number, logger: Logger = quiet()) {
  return { logger, providerSeed: 0, decisionDraw: decisionDrawFor(seed) };
}

/**
 * A fake Jev answer, as a function entry: `weights` on their keys, 0 on every other key offered,
 * and `choice` as Jev's own pick. Built from the request, so it fits any page's options.
 */
function answering(weights: Readonly<Record<string, number>>, choice: string) {
  return (request: DecideRequest) => ({
    choice,
    confidence: 0.5,
    probabilities: Object.fromEntries(
      Object.keys(request.question.options).map((key) => [key, weights[key] ?? 0]),
    ),
  });
}

/** An Actor-facing page of `count` visible links, e1 to e<count>, and nothing else. */
function linksPage(count: number): Observation {
  return Observation.parse({
    ...deliveries,
    elements: Array.from({ length: count }, (_, index) => ({
      ref: `e${index + 1}`,
      role: "link",
      name: `Link ${index + 1}`,
      bbox: { x: 24, y: 16 + 40 * index, width: 120, height: 36 },
      state: "visible",
    })),
  });
}

describe("jevOptions", () => {
  test("the options on the observation fixture are the decision record fixture's", () => {
    const options = jevOptions(deliveries);

    expect(options.map(({ action, description }) => ({ action, description }))).toStrictEqual(
      decisionRecordFixture.options,
    );
    expect(options.map(({ key }) => key)).toStrictEqual([
      "e1",
      "e2",
      "e3",
      "e4",
      "e5",
      "e6",
      "scroll_down",
      "scroll_up",
      "back",
      "give_up",
    ]);
  });
});

describe("jevRequest", () => {
  test("Jev's own words hold no banned word (F5 AC6)", () => {
    // The state is the LLM's user message, which `llm-actor.test.ts` greps. Jev's own words are the
    // instruction file and the options' words, grepped here with every page string blanked, since
    // the page is not ours and a real one may well say "Hidden fees".
    const blank: Observation = {
      ...deliveries,
      title: "",
      url: "",
      elements: deliveries.elements.map((element) => ({ ...element, role: "", name: "" })),
    };
    const { instructions, options } = jevRequest(
      actorTurn("", blank, []),
      jevOptions(blank),
    ).question;

    // No placeholder is left for Jev to read: the file has none.
    expect(instructions).not.toMatch(/\{\{|\}\}/);
    for (const text of [instructions, ...Object.keys(options), ...Object.values(options)]) {
      const lower = text.toLowerCase();
      for (const word of BANNED_ACTOR_WORDS) expect(lower).not.toContain(word);
    }
  });
});

describe("jevActor", () => {
  test("on the observation fixture the request offers Ar▒▒ive and names no hidden element", async () => {
    const fake = fakeLlm({ actor: [answering({ e3: 1 }, "e3")] });

    await jevActor({ settings, llm: () => fake })(run(1)).answer(turn);

    const request = fake.decideCalls[0];
    expect(Object.values(request?.question.options ?? {}).some((d) => d.includes("Ar▒▒ive"))).toBe(
      true,
    );
    const hidden = observationFixture.elements
      .filter((element) => element.ref === undefined)
      .map((element) => element.name);
    expect(hidden.length).toBeGreaterThan(0);
    const sent = JSON.stringify(request);
    for (const name of hidden) expect(sent).not.toContain(name);
    // The degraded element's real name, which only its mask may stand for.
    expect(sent).not.toContain("Archive");
  });

  test("a 0.5 and 0.5 split draws each option at least once over seeds 1 to 20", async () => {
    const drawn = new Set<string>();

    for (let seed = 1; seed <= 20; seed++) {
      const fake = fakeLlm({ actor: [answering({ e1: 0.5, e2: 0.5 }, "e1")] });
      const answer = await jevActor({ settings, llm: () => fake })(run(seed)).answer(turn);

      const { options, probabilities, rolled } = DecisionRecord.parse(answer.decision);
      // The run's decision stream, and its first value: one draw per answer.
      expect(rolled, `seed ${seed}`).toBe(decisionDrawFor(seed)());
      expect(answer.response.action, `seed ${seed}`).toStrictEqual(
        options[drawOption(probabilities, rolled)]?.action,
      );
      const { action } = answer.response;
      if (action.type === "click") drawn.add(action.ref);
    }

    expect([...drawn].sort()).toStrictEqual(["e1", "e2"]);
  });

  test("Jev's own pick is logged and never used", async () => {
    const lines: Record<string, unknown>[] = [];
    // No pid or hostname, so a line holds only what the backend put in it.
    const logger = pino({ base: null }, { write: (line: string) => lines.push(JSON.parse(line)) });
    const fake = fakeLlm({ actor: [answering({ e1: 1 }, "e2")] });

    const answer = await jevActor({ settings, llm: () => fake })(run(1, logger)).answer(turn);

    expect(answer.response.action).toStrictEqual({ type: "click", ref: "e1" });
    const logged = lines.filter((line) => line.msg === "jev decision");
    expect(logged).toStrictEqual([
      {
        level: 30,
        time: expect.any(Number),
        msg: "jev decision",
        jevChoice: "e2",
        drawn: "e1",
        rolled: answer.decision?.rolled,
        confidence: 0.5,
      },
    ]);
  });

  test("255 options are asked, 256 fail before any call", async () => {
    expect(JEV_MAX_OPTIONS).toBe(255);
    // 251 links and the four fixed moves: 255 options.
    const fits = fakeLlm({ actor: [answering({ e1: 1 }, "e1")] });
    await jevActor({ settings, llm: () => fits })(run(1)).answer(
      actorTurn(GOAL, linksPage(251), []),
    );
    expect(fits.decideCalls).toHaveLength(1);
    expect(Object.keys(fits.decideCalls[0]?.question.options ?? {})).toHaveLength(255);

    // One link more: 256. Nothing is scripted, so a call would fail on the fake too.
    const over = fakeLlm({});
    const error = await jevActor({ settings, llm: () => over })(run(1))
      .answer(actorTurn(GOAL, linksPage(252), []))
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(WayfordError);
    expect(error).toMatchObject({ code: "jev_too_many_options" });
    expect((error as Error).message).toContain("256");
    expect(over.decideCalls).toStrictEqual([]);
  });

  test("the backend answers from decide alone", async () => {
    // Not zero, so an answer's cost is seen to be the call's own and not one made up on the way.
    const COST: Cost = { tokensIn: 476, tokensOut: 0, usd: 0.00002 };
    const fake = fakeLlm({ actor: [answering({ e3: 0.84, back: 0.16 }, "e3")] });
    // The fake bills nothing, so this one bills COST on top of it.
    const billed: Llm = {
      ...fake,
      decide: async (request) => ({ ...(await fake.decide(request)), cost: COST }),
    };
    const built: Logger[] = [];
    const logger = quiet();

    const backend = jevActor({
      settings,
      llm: (runLogger) => {
        built.push(runLogger);
        return billed;
      },
    })(run(1, logger));

    expect(backend.modelId).toBe("fake-jev");
    expect(backend.sampling).toBeUndefined();
    expect(built).toStrictEqual([logger]);

    const answer = await backend.answer(turn);

    expect(fake.calls).toStrictEqual([]);
    expect(answer.response.narration).toBe("");
    expect(answer.cost).toStrictEqual(COST);
    // The request rebuilds from the turn, and its state is the LLM's user message, byte for byte.
    expect(fake.decideCalls).toStrictEqual([jevRequest(turn, jevOptions(deliveries))]);
    expect(fake.decideCalls[0]?.state).toBe(turnText(turn));
    // The record parses and replays to the action.
    const record = DecisionRecord.parse(answer.decision);
    expect(record.options[drawOption(record.probabilities, record.rolled)]?.action).toStrictEqual(
      answer.response.action,
    );
  });

  test("a retry turn throws: no option can be refused", async () => {
    const fake = fakeLlm({});
    const backend = jevActor({ settings, llm: () => fake })(run(1));

    const error = await backend
      .answer({
        ...turn,
        retry: { refused: { narration: "", action: { type: "click", ref: "e9" } }, ref: "e9" },
      })
      .catch((reason: unknown) => reason);

    // A plain Error: only a bug reaches it.
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(WayfordError);
    expect(fake.decideCalls).toStrictEqual([]);
  });

  test("an LlmError from decide propagates as it is, with the cost it billed", async () => {
    const failure = new LlmError("llm_request_failed", "The actor call failed", {
      tokensIn: 476,
      tokensOut: 0,
      usd: 0.00002,
    });
    const fake = fakeLlm({ actor: [failure] });

    await expect(jevActor({ settings, llm: () => fake })(run(1)).answer(turn)).rejects.toBe(
      failure,
    );
  });
});
