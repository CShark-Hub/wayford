/**
 * `runActor` with the Jev backend on the served target app, against the run boxes of
 * `tasks/s2-06-jev-actor-backend.md` (`docs/specs/2026-10-04-s2-06-jev-actor-backend.md`,
 * "Acceptance mapping"). The app is built and served once, one Chromium serves every run, and each
 * test writes its runs into a fresh temporary directory.
 *
 * No test reaches a model or a network: the Actor is `jevActor` on the fake adapter's `decide`, and
 * `fetch` throws from the moment the app is up. The fake puts Jev's probabilities on an option by
 * its element's name, read from the options it is sent, since refs depend on what each persona was
 * shown. Every answer bills a fixed `COST`, so a step's bill is seen to be its own call's.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type CompleteRunStep,
  type DecisionRecord,
  drawOption,
  type IncompleteRunStep,
  type Profile,
  type RunEvent,
  type RunResult,
  runResultFromEvents,
  type Task,
  toActorObservation,
} from "@wayford/core";
import { profileFixture, profileFixtures, targetAppJargon } from "@wayford/core/fixtures";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { actorTurn, decisionDrawFor } from "./actor-backend.js";
import { runActor } from "./actor-loop.js";
import { fakeLlm } from "./fake-llm.js";
import { elementName } from "./history.js";
import { jevActor, jevOptions, jevRequest } from "./jev-actor.js";
import type { DecideRequest, Decision } from "./llm.js";
import { llmActor } from "./llm-actor.js";
import { TARGET_APP_DEFAULTS } from "./start-url.js";
import {
  app,
  billed,
  browser,
  COST,
  click,
  diceOf,
  GIVE_UP,
  historyOf,
  kinds,
  quiet,
  RUN_SEED,
  runsDir,
  settings,
  stepAt,
  taskOf,
  texts,
  urlAfter,
  useServedApp,
} from "./test-support.js";

useServedApp();

// ---------------------------------------------------------------------------
// Scripted Jev answers
// ---------------------------------------------------------------------------

/** Jev's answer as the fake checks it: its pick, its confidence, one probability per key. */
interface JevAnswer {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

/** A ref, as a click option's key is one. The four fixed keys never match it. */
const REF = /^e[1-9][0-9]*$/;

/** Probability 1 on `key` and 0 on every other key offered. */
function certain(keys: readonly string[], key: string): JevAnswer {
  return {
    choice: key,
    confidence: 1,
    probabilities: Object.fromEntries(keys.map((offered) => [offered, offered === key ? 1 : 0])),
  };
}

/**
 * Probability 1 on the first option that clicks `<role> "<name>"`, found in the words of the
 * request it is sent, since its ref depends on what the persona was shown. Throws when no option
 * names such an element.
 */
function jevOn(role: string, name: string): (request: DecideRequest) => JevAnswer {
  const words = `the ${elementName({ role, name })}`;
  return (request) => {
    const { options } = request.question;
    const keys = Object.keys(options);
    const key = keys.find((offered) => options[offered]?.includes(words));
    if (key === undefined) {
      throw new Error(`Jev was offered no ${role} named ${JSON.stringify(name)}`);
    }
    return certain(keys, key);
  };
}

/** Probability 1 on giving up. */
function jevGiveUp(request: DecideRequest): JevAnswer {
  return certain(Object.keys(request.question.options), "give_up");
}

/**
 * The page's clicks share the probability evenly, and the four fixed moves get 0, so the rolled
 * value, not the answer, picks which element is clicked.
 */
function jevSplit(request: DecideRequest): JevAnswer {
  const keys = Object.keys(request.question.options);
  const clicks = keys.filter((key) => REF.test(key));
  const [first] = clicks;
  if (first === undefined) throw new Error("Jev was offered no click");
  return {
    choice: first,
    confidence: 0.5,
    probabilities: Object.fromEntries(
      keys.map((key) => [key, clicks.includes(key) ? 1 / clicks.length : 0]),
    ),
  };
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

interface Walked {
  result: RunResult;
  /** Every event `onEvent` received, in order. */
  events: RunEvent[];
  /** Every `decide` request the fake received, in order. */
  decideCalls: DecideRequest[];
}

/** A step that planned an action, complete or cut off after its plan. */
type PlannedStep = CompleteRunStep | IncompleteRunStep;

/**
 * One Jev run on the served app at its defaults, the run seed 7 and a cap of 3 unless told
 * otherwise, Jev answering from `answers` in order. Whatever a test proves, every run is held here
 * to what the backend may and may not do, and every step it planned to the record of its draw.
 */
async function walkJev(scripted: {
  profile: Profile;
  task: Task;
  answers: readonly unknown[];
  seed?: number;
  maxSteps?: number;
}): Promise<Walked> {
  const seed = scripted.seed ?? RUN_SEED;
  const fake = fakeLlm({ actor: [...scripted.answers] });
  const answered: Decision[] = [];
  const events: RunEvent[] = [];
  const result = await runActor({
    browser,
    profile: scripted.profile,
    task: scripted.task,
    seed,
    params: TARGET_APP_DEFAULTS,
    jargon: targetAppJargon,
    runsDir,
    backend: jevActor({ settings, llm: () => billed(fake, answered) }),
    logger: quiet,
    onEvent: (event) => {
      events.push(event);
    },
    maxSteps: scripted.maxSteps ?? 3,
  });

  // Every run returns the fold of the events it streamed.
  expect(result).toStrictEqual(runResultFromEvents(events));
  // One backend per run: Jev never calls `complete`, so it writes no narration, and it is sent no
  // temperature and no seed, so the record has no sampling to keep.
  expect(fake.calls).toStrictEqual([]);
  expect(events.filter((event) => event.type === "narration")).toStrictEqual([]);
  expect("actorSampling" in (events[0] ?? {})).toBe(false);
  expect("actorSampling" in result).toBe(false);
  expect(result.modelIds.actor).toBe("fake-jev");

  // Jev was shown the filter's projection of each step and nothing else: each request is the one
  // rebuilt from the stored evidence and the steps before it, as many as the persona remembers
  // (M1). The rebuild takes no profile, so a request that depends on the persona fails here, for
  // every persona with its own thresholds. This is the reviewer's "diff the requests".
  expect(fake.decideCalls).toStrictEqual(
    result.steps.slice(0, fake.decideCalls.length).map((step, i) => {
      const shown = toActorObservation(step.fullObservation);
      const turn = actorTurn(
        scripted.task.goal,
        shown,
        historyOf(result.steps.slice(0, i)),
        scripted.profile.behaviour.memorySteps,
      );
      return jevRequest(turn, jevOptions(shown));
    }),
  );

  // Every planned step carries the record of its draw: the options its page offered, what Jev
  // sent for each, one value of the run's decision stream, and the option that value lands on,
  // which is the action proposed. Jev never retries, so each call planned one step.
  const planned = plannedOf(result);
  expect(fake.decideCalls).toHaveLength(planned.length);
  planned.forEach((step, i) => {
    const record = decisionOf(step);
    const options = jevOptions(toActorObservation(step.fullObservation));
    expect(record.options).toStrictEqual(
      options.map(({ action, description }) => ({ action, description })),
    );
    const sent = answered[i];
    expect(record.probabilities).toStrictEqual(
      options.map((option) => sent?.probabilities[option.key]),
    );
    expect(record.confidence).toBe(sent?.confidence);
    expect(step.proposedAction).toStrictEqual(
      record.options[drawOption(record.probabilities, record.rolled)]?.action,
    );
    expect(step.cost).toStrictEqual(COST);
  });
  // The run's own stream, one value per step, in step order.
  const stream = decisionDrawFor(seed);
  expect(planned.map((step) => decisionOf(step).rolled)).toStrictEqual(planned.map(() => stream()));

  return { result, events, decideCalls: fake.decideCalls };
}

/** The steps that planned an action, in order. */
function plannedOf(result: RunResult): PlannedStep[] {
  return result.steps.filter(
    (step): step is PlannedStep => !("wasted" in step) && step.proposedAction !== undefined,
  );
}

/** A planned step's decision record, failing the test when it has none. */
function decisionOf(step: PlannedStep): DecisionRecord {
  if (step.decision === undefined) {
    throw new Error(`step ${step.stepIndex} planned an action with no decision record`);
  }
  return step.decision;
}

/** Every step's proposed action: `undefined` for a step that planned none. */
function proposedOf(result: RunResult) {
  return result.steps.map((step) => ("wasted" in step ? undefined : step.proposedAction));
}

// ---------------------------------------------------------------------------
// The boxes
// ---------------------------------------------------------------------------

test("Ada reaches the easy goal in two Jev draws, and each request is rebuilt from the stored evidence", async () => {
  // On home, the first "Your account" is the nav link. Both go to /account.
  const { result, events } = await walkJev({
    profile: profileFixture("prof_ada"),
    task: taskOf("task_next-parcel"),
    answers: [jevOn("link", "Your account"), jevOn("link", "Delivery address")],
  });

  expect(result.outcome).toBe("success");
  expect(kinds(result)).toStrictEqual(["complete", "complete"]);
  expect(result.steps.map(urlAfter)).toStrictEqual([
    `${app.origin}/account`,
    `${app.origin}/account/address`,
  ]);
  // A Jev step is observed, planned and performed, with no narration between.
  expect(events.map((event) => `${event.type}@${event.stepIndex}`)).toStrictEqual([
    "runStarted@0",
    "stepObserved@0",
    "actionPlanned@0",
    "actionPerformed@0",
    "stepObserved@1",
    "actionPlanned@1",
    "actionPerformed@1",
    "runFinished@1",
  ]);
  // `walkJev` has checked one request per step, each the projection rebuilt from the stored
  // evidence, each step's record against its draw, no narration, no `actorSampling` and Jev's
  // model id.
});

test("Vera on one seed and one fake twice: the same text, actions, rolled values and B1 rolls (F5 AC1)", async () => {
  const vera = profileFixture("prof_vera");
  const task = taskOf("task_past-order");
  // Even over the clicks, so the decision stream, not a fixed answer, picks the path.
  const answers = [jevSplit, jevSplit, jevSplit];
  // At once: runs on one browser share nothing but the browser.
  const [a, b] = await Promise.all([
    walkJev({ profile: vera, task, answers, seed: RUN_SEED, maxSteps: 3 }),
    walkJev({ profile: vera, task, answers, seed: RUN_SEED, maxSteps: 3 }),
  ]);

  /** What F5 AC1 holds equal, per step. */
  const replay = ({ result }: Walked) =>
    plannedOf(result).map((step) => ({
      text: step.actorObservationText,
      proposed: step.proposedAction,
      performed: step.performedAction,
      rolled: decisionOf(step).rolled,
      dice: step.dice,
    }));
  expect(b.result.outcome).toBe(a.result.outcome);
  expect(kinds(b.result)).toStrictEqual(kinds(a.result));
  expect(texts(b.result)).toStrictEqual(texts(a.result));
  expect(replay(b)).toStrictEqual(replay(a));

  // Not vacuous: every option drawn is a click, so B1 rolled on it, and the draw went past the
  // first option at least once, so the rolled value, not the offer order, chose.
  const steps = plannedOf(a.result);
  expect(steps.length).toBeGreaterThan(0);
  const b1 = diceOf(a.result)
    .flat()
    .filter((roll) => roll?.rule === "B1");
  expect(b1.length).toBeGreaterThan(0);
  const drawn = steps.map((step) => {
    const { probabilities, rolled } = decisionOf(step);
    return drawOption(probabilities, rolled);
  });
  expect(drawn.some((index) => index > 0)).toBe(true);
});

test("a Jev run and an LLM run of Vera on the same seed and clicks roll the same B1 dice", async () => {
  const vera = profileFixture("prof_vera");
  const task = taskOf("task_past-order");
  const fake = fakeLlm({ actor: [click("link", "Deliveries"), click("link", "Home"), GIVE_UP] });

  const [llm, jev] = await Promise.all([
    runActor({
      browser,
      profile: vera,
      task,
      seed: RUN_SEED,
      params: TARGET_APP_DEFAULTS,
      jargon: targetAppJargon,
      runsDir,
      backend: llmActor({ settings, llm: () => billed(fake) }),
      logger: quiet,
      maxSteps: 3,
    }),
    walkJev({
      profile: vera,
      task,
      answers: [jevOn("link", "Deliveries"), jevOn("link", "Home"), jevGiveUp],
    }),
  ]);

  // Each gives up back home, by way of /deliveries.
  for (const result of [llm, jev.result]) {
    expect(result.outcome).toBe("gave_up");
    expect(kinds(result)).toStrictEqual(["complete", "complete", "complete"]);
  }
  expect(texts(jev.result)).toStrictEqual(texts(llm));
  expect(proposedOf(jev.result)).toStrictEqual(proposedOf(llm));
  // The decision draw has a stream of its own, so the behaviour stream rolls the same whichever
  // backend chose the clicks. Not vacuous: Vera's doubleClick is 0.8, and B1 rolled on both.
  const dice = diceOf(llm);
  expect(dice.flat().filter((roll) => roll?.rule === "B1")).toHaveLength(2);
  expect(diceOf(jev.result)).toStrictEqual(dice);
});

test("every persona fixture sends Jev the same first request on the same page (F5 AC6)", async () => {
  const requests = await Promise.all(
    profileFixtures.map(async (persona) => {
      // No threshold, no attention cap, every pattern known and a desktop, so every persona's page
      // is measured and perceived the same, s1-03's attention and knowledge stages included, and
      // only the rest of the profile differs: its name, seed, behaviour and emulation.
      const { maxElements: _cap, maxOptions: _options, ...behaviour } = persona.behaviour;
      const bare: Profile = {
        ...persona,
        device: "desktop",
        perception: { emulation: persona.perception.emulation },
        behaviour,
        knowledge: { ...persona.knowledge, unknownPatterns: [] },
      };
      const { events, decideCalls } = await walkJev({
        profile: bare,
        task: taskOf("task_next-parcel"),
        maxSteps: 1,
        answers: [jevGiveUp],
      });
      // On the terminal event, not the outcome, so a run that failed prints its `runFailed` error.
      expect(events.at(-1)).toMatchObject({ type: "runFinished", outcome: "gave_up" });
      // The whole request: its role, its state and its question, options and all.
      return decideCalls[0];
    }),
  );

  expect(requests).toHaveLength(profileFixtures.length);
  expect(requests[0]).toBeDefined();
  for (const request of requests) expect(request).toStrictEqual(requests[0]);

  // On word boundaries, since a name can sit inside an innocent word: "several" holds "vera".
  const sent = JSON.stringify(requests[0]);
  const names = new RegExp(`\\b(${profileFixtures.map(({ label }) => label).join("|")})\\b`, "i");
  expect(sent).not.toMatch(names);
  for (const word of ["impaired", "disabled", "blind", "vision", "contrast"]) {
    expect(sent.toLowerCase()).not.toContain(word);
  }
});

// ---------------------------------------------------------------------------
// A page the target app has no reason to hold
// ---------------------------------------------------------------------------

/**
 * More options than Jev takes, which no page of the target app comes near. A plain `node:http`
 * server on 127.0.0.1 serves one page for it. The run starts there, with the app's parameters on
 * the URL, which the page ignores.
 */
describe("on a page served for the purpose", () => {
  const LINKS = 300;
  // 30 columns of 36 × 20 px links, ten rows, inside the 1280 × 720 viewport, in black on white
  // at 14 px: Ada, with no threshold and no cap, is shown every one. They lead to a 404, and none
  // to where the task's success lies.
  const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Many links</title><style>body { margin: 0; font: 14px sans-serif; background: #ffffff; color: #000000; } .grid { display: grid; grid-template-columns: repeat(30, 36px); grid-auto-rows: 20px; gap: 4px; margin: 16px; } .grid a { font-size: 14px; line-height: 20px; color: #000000; text-decoration: none; overflow: hidden; white-space: nowrap; }</style></head><body><div class="grid">${Array.from(
    { length: LINKS },
    (_, i) => `<a href="/elsewhere">L${i + 1}</a>`,
  ).join("")}</div></body></html>`;

  let server: Server;
  let origin: string;

  beforeAll(async () => {
    server = createServer((request, response) => {
      const path = new URL(request.url ?? "/", "http://pages.test").pathname;
      if (path !== "/many-links") {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server?.close(resolve));
  });

  test("a page with more than 255 options ends runFailed naming the count", async () => {
    const task: Task = {
      id: "task_served-page",
      goal: "you want to look around",
      startUrl: `${origin}/many-links`,
      success: { type: "urlMatches", pattern: "**/never-reached" },
    };

    // Nothing is scripted, so a call would fail on the fake too.
    const { result, events, decideCalls } = await walkJev({
      profile: profileFixture("prof_ada"),
      task,
      answers: [],
    });

    // One click per element shown, and the four fixed moves.
    const offered = toActorObservation(stepAt(result, 0).fullObservation).elements.length + 4;
    expect(offered).toBeGreaterThan(255);
    expect(result.outcome).toBe("error");
    expect(events.at(-1)).toMatchObject({
      type: "runFailed",
      stepIndex: 0,
      error: expect.stringMatching(new RegExp(`^jev_too_many_options: .*\\b${offered} options\\b`)),
    });
    // Failed before any call, so nothing was asked and nothing billed.
    expect(decideCalls).toStrictEqual([]);
    expect(result.cost).toStrictEqual({ tokensIn: 0, tokensOut: 0, usd: 0 });
    // Observed, never planned.
    expect(kinds(result)).toStrictEqual(["incomplete"]);
    expect(stepAt(result, 0)).not.toHaveProperty("proposedAction");
  });
});
