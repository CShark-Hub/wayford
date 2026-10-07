/**
 * `runActor` on the served target app, against the loop boxes of `tasks/s2-03-actor-loop.md`
 * (`docs/specs/2026-10-01-s2-03-actor-loop.md`, "Acceptance mapping") and of
 * `tasks/s2-10-memory-dice-budget.md` (its spec's "Acceptance mapping"). The app is built and
 * served once, one Chromium serves every run, and each test writes its runs into a fresh
 * temporary directory.
 *
 * No test reaches a model or a network: the Actor is `llmActor` on the fake adapter, and `fetch`
 * throws from the moment the app is up. The fake answers by element name, read from the turn it
 * is sent, since refs depend on what each persona was shown. A missing ref is `e99` or `e98`,
 * which no page of the app reaches. Every answer bills a fixed `COST`, so costs can be counted.
 */
import { mkdirSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import {
  type ActorResponse,
  type Bbox,
  type CompleteRunStep,
  type Cost,
  type Profile,
  type RunEvent,
  RunResult,
  type RunSweep,
  rng,
  runResultFromEvents,
  type Task,
  toActorObservation,
  WayfordError,
} from "@wayford/core";
import {
  measurementFixture,
  profileFixture,
  profileFixtures,
  targetAppJargon,
  taskFixture,
} from "@wayford/core/fixtures";
import { perceive } from "@wayford/filter";
import { TARGET_APP_DEFAULT_QUERY } from "@wayford/filter/serve-target-app";
import pino, { type Logger } from "pino";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { actorTurn, providerSeedFor } from "./actor-backend.js";
import { runActor } from "./actor-loop.js";
import { type FakeLlm, fakeLlm } from "./fake-llm.js";
import { LlmError } from "./llm.js";
import { actorMessages, llmActor } from "./llm-actor.js";
import { SETTLE_TIMEOUT_MS } from "./settle.js";
import { startUrlFor, TARGET_APP_DEFAULTS } from "./start-url.js";
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
  pageLine,
  quiet,
  type Request,
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

/** What `n` answers cost. */
function costOf(n: number): Cost {
  return { tokensIn: n * COST.tokensIn, tokensOut: n * COST.tokensOut, usd: n * COST.usd };
}

// ---------------------------------------------------------------------------
// Scripted answers
// ---------------------------------------------------------------------------

const SCROLL_DOWN: ActorResponse = {
  narration: "Maybe it is further down.",
  action: { type: "scroll", direction: "down" },
};

// No narration, so its step gets no narration event.
const BACK: ActorResponse = { narration: "", action: { type: "back" } };

/** An answer naming a ref that no page of the target app gives out. */
function missing(ref: "e99" | "e98"): ActorResponse {
  return { narration: `The ${ref} one.`, action: { type: "click", ref } };
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

interface Walked {
  result: RunResult;
  /** Every event `onEvent` received, in order. */
  events: RunEvent[];
  /** Every request the fake received, in order. */
  calls: Request[];
  runDir: string;
}

/**
 * One run on the served app at its defaults, the run seed 7, a cap of 3 and the wall clock unless
 * told otherwise, the Actor answering from `answers` in order. `elsewhere` hands the run neither
 * the app's parameters nor its jargon list, as a run on another site gets (ADR 0003, D2).
 */
async function walk(scripted: {
  profile: Profile;
  task: Task;
  answers: readonly unknown[];
  seed?: number;
  maxSteps?: number;
  now?: () => number;
  sweep?: RunSweep;
  elsewhere?: boolean;
  logger?: Logger;
}): Promise<Walked> {
  const fake = fakeLlm({ actor: [...scripted.answers] });
  const events: RunEvent[] = [];
  const result = await runActor({
    browser,
    profile: scripted.profile,
    task: scripted.task,
    seed: scripted.seed ?? RUN_SEED,
    ...(scripted.elsewhere === true
      ? {}
      : { params: TARGET_APP_DEFAULTS, jargon: targetAppJargon }),
    runsDir,
    backend: llmActor({ settings, llm: () => billed(fake) }),
    logger: scripted.logger ?? quiet,
    onEvent: (event) => {
      events.push(event);
    },
    maxSteps: scripted.maxSteps ?? 3,
    ...(scripted.now === undefined ? {} : { now: scripted.now }),
    ...(scripted.sweep === undefined ? {} : { sweep: scripted.sweep }),
  });
  // Whatever a test proves, every run returns the fold of the events it streamed.
  expect(result).toStrictEqual(runResultFromEvents(events));
  // Every call, a retry's included, was sent the run seed's provider seed, and the record keeps
  // it with the actor's temperature (A20). That seeds 1 and 2 differ is `actor-backend.test.ts`'s.
  const providerSeed = providerSeedFor(scripted.seed ?? RUN_SEED);
  for (const call of fake.calls) expect(call.seed).toBe(providerSeed);
  expect(result.actorSampling).toStrictEqual({
    temperature: settings.roles.actor.temperature,
    providerSeed,
  });
  // And the model was shown the filter's projection of each step and nothing else: each step's
  // first request, the one with no retry in it, is the one rebuilt from the stored evidence and
  // the steps before it, as many of them as the persona remembers (M1). The rebuild takes no
  // profile, so text that depends on the persona fails here, for every persona with its own
  // thresholds.
  const firsts = fake.calls.filter((call) => call.messages.length === 2);
  expect(firsts.map((call) => call.messages)).toStrictEqual(
    result.steps
      .slice(0, firsts.length)
      .map((step, i) =>
        actorMessages(
          actorTurn(
            scripted.task.goal,
            toActorObservation(step.fullObservation),
            historyOf(result.steps.slice(0, i)),
            scripted.profile.behaviour.memorySteps,
          ),
        ),
      ),
  );
  return { result, events, calls: fake.calls, runDir: join(runsDir, result.id) };
}

/** Step `i` of a run, failing the test unless its action landed. */
function completeAt(result: RunResult, i: number): CompleteRunStep {
  const step = stepAt(result, i);
  if ("wasted" in step || "incomplete" in step) {
    throw new Error(`step ${i} of run ${result.id} did not land an action`);
  }
  return step;
}

/** Every perception decision of every step, with its element, its rule and its roll. */
function perceptionRolls(result: RunResult) {
  return result.steps.flatMap((step) =>
    step.fullObservation.elements.flatMap((element) =>
      element.decisions.flatMap((decision) =>
        decision.stage === "perception"
          ? [
              {
                step: step.stepIndex,
                key: element.key,
                rule: decision.rule,
                rolled: decision.rolled,
              },
            ]
          : [],
      ),
    ),
  );
}

/** The darkest colour channel of a PNG within a box of it, read by drawing it in a page. */
async function darkest(path: string, box: Bbox): Promise<number> {
  const png = (await readFile(path)).toString("base64");
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async ({ png, box }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        [canvas.width, canvas.height] = [image.width, image.height];
        const context = canvas.getContext("2d");
        context?.drawImage(image, 0, 0);
        const pixels = context?.getImageData(box.x, box.y, box.width, box.height).data ?? [];
        // Every channel but alpha.
        return Math.min(...[...pixels].filter((_, i) => i % 4 !== 3));
      },
      { png, box },
    );
  } finally {
    await page.close();
  }
}

/** The text of `message` between two of its lines. */
function between(message: string, start: string, end: string): string {
  const from = message.indexOf(start);
  const to = message.indexOf(end, from);
  if (from === -1 || to === -1) throw new Error(`the message has no ${start} … ${end}`);
  return message.slice(from + start.length, to);
}

// ---------------------------------------------------------------------------
// The boxes
// ---------------------------------------------------------------------------

test("Ada reaches the easy goal in two actions, each request the projection and nothing else, and result.json is the fold of the stream", async () => {
  const task = taskOf("task_next-parcel");
  // On home, the first "Your account" is the nav link. Both go to /account.
  const { result, events, calls, runDir } = await walk({
    profile: profileFixture("prof_ada"),
    task,
    answers: [click("link", "Your account"), click("link", "Delivery address")],
  });

  expect(result.outcome).toBe("success");
  expect(kinds(result)).toStrictEqual(["complete", "complete"]);
  expect(result.steps.map(urlAfter)).toStrictEqual([
    `${app.origin}/account`,
    `${app.origin}/account/address`,
  ]);
  // In order, step by step, the narration before its plan, the terminal event on the last step.
  expect(events.map((event) => `${event.type}@${event.stepIndex}`)).toStrictEqual([
    "runStarted@0",
    "stepObserved@0",
    "narration@0",
    "actionPlanned@0",
    "actionPerformed@0",
    "stepObserved@1",
    "narration@1",
    "actionPlanned@1",
    "actionPerformed@1",
    "runFinished@1",
  ]);

  // One request per step, no retry: `walk` has checked each is the projection rebuilt from the
  // stored evidence, and nothing else from the page.
  expect(calls).toHaveLength(2);

  // result.json is the returned result, as two-space JSON, and both are the fold of the stream.
  const text = await readFile(join(runDir, "result.json"), "utf8");
  expect(text).toBe(`${JSON.stringify(result, null, 2)}\n`);
  const stored = RunResult.parse(JSON.parse(text));
  expect(stored).toStrictEqual(runResultFromEvents(events));
  expect(stored).toStrictEqual(result);

  // The duration is the persona's time, from runStarted to the terminal event, not the teardown.
  const [start, end] = [events[0], events.at(-1)];
  expect(Date.parse(end?.timestamp ?? "") - Date.parse(start?.timestamp ?? "")).toBe(
    result.durationMs,
  );

  // The recording and each step's screenshot, stored relative to the run's own directory.
  expect(result.videoPath).toMatch(/\.webm$/);
  expect(result.tracePath).toMatch(/\.trace\.zip$/);
  const files = [result.videoPath, result.tracePath, ...result.steps.map((s) => s.screenshotPath)];
  for (const file of files) {
    expect(file).toBeDefined();
    const path = file ?? "";
    expect(path.startsWith("/"), path).toBe(false);
    expect(path).not.toContain(runsDir);
    expect((await stat(join(runDir, path))).size, path).toBeGreaterThan(0);
  }
});

test("Vera reads the same text on one run seed, and a changed profile seed changes no text and no roll (F5 AC1, A20)", async () => {
  const vera = profileFixture("prof_vera");
  const task = taskOf("task_past-order");
  // Two clicks, so the second roll is the stream's second draw in every run.
  const answers = [click("link", "Deliveries"), click("link", "Home"), GIVE_UP];
  // At once: runs on one browser share nothing but the browser.
  const [a, b, c] = await Promise.all([
    walk({ profile: vera, task, answers }),
    walk({ profile: vera, task, answers }),
    walk({ profile: { ...vera, seed: vera.seed + 1 }, task, answers }),
  ]);

  // The giveUp box too: each run gives up back home, by way of /deliveries.
  for (const { result } of [a, b, c]) {
    expect(result.outcome).toBe("gave_up");
    expect(kinds(result)).toStrictEqual(["complete", "complete", "complete"]);
    expect(result.steps.map((step) => step.urlBefore)).toStrictEqual([
      `${app.origin}/`,
      `${app.origin}/deliveries`,
      `${app.origin}/`,
    ]);
  }
  expect(texts(b.result)).toStrictEqual(texts(a.result));
  expect(texts(c.result)).toStrictEqual(texts(a.result));
  // Not vacuous: the faint archive link falls in Vera's band, so at least one decision rolled.
  const rolls = perceptionRolls(a.result);
  expect(rolls.filter(({ rolled }) => rolled !== undefined).length).toBeGreaterThan(0);
  expect(perceptionRolls(c.result)).toStrictEqual(rolls);

  // The behaviour dice draw the run seed's stream, never the profile seed's: B1 rolled on both
  // clicks, the same in all three runs.
  const dice = diceOf(a.result);
  expect(dice.flat().filter((roll) => roll?.rule === "B1")).toHaveLength(2);
  expect(diceOf(b.result)).toStrictEqual(dice);
  expect(diceOf(c.result)).toStrictEqual(dice);
  // And every call is sent the run seed's provider seed, the profile seed changed or not.
  const seeds = a.calls.map((call) => call.seed);
  expect(seeds).toStrictEqual(a.calls.map(() => providerSeedFor(RUN_SEED)));
  expect(c.calls.map((call) => call.seed)).toStrictEqual(seeds);
});

test("B1 draws the behaviour stream in order, and a wasted step draws nothing", async () => {
  // The run seed's first two draws, and a knob between them, so one click fires and one does not.
  const draw = rng(RUN_SEED);
  const [r1, r2] = [draw(), draw()];
  const p = (r1 + r2) / 2;
  expect(r1 < p).not.toBe(r2 < p);
  const ada = profileFixture("prof_ada");
  const clumsy: Profile = { ...ada, behaviour: { ...ada.behaviour, doubleClick: p } };

  const { result } = await walk({
    profile: clumsy,
    task: taskOf("task_next-parcel"),
    maxSteps: 5,
    // A wasted step, then a click, a scroll and a click, none of them reaching the address.
    answers: [
      missing("e99"),
      missing("e98"),
      click("link", "Deliveries"),
      SCROLL_DOWN,
      click("link", "Order archive"),
      GIVE_UP,
    ],
  });

  expect(result.outcome).toBe("gave_up");
  expect(kinds(result)).toStrictEqual(["wasted", "complete", "complete", "complete", "complete"]);
  // The wasted step and the scroll draw nothing, so the two clicks take the first two draws.
  expect(diceOf(result)).toStrictEqual([
    undefined,
    [{ rule: "B1", p, rolled: r1, fired: r1 < p }],
    [],
    [{ rule: "B1", p, rolled: r2, fired: r2 < p }],
    [],
  ]);
  // A fired roll double-clicks what the Actor proposed to click; one that did not fire clicks it.
  for (const [i, rolled] of [
    [1, r1],
    [3, r2],
  ] as const) {
    const { proposedAction, performedAction } = completeAt(result, i);
    expect(proposedAction.type).toBe("click");
    expect(performedAction).toStrictEqual(
      rolled < p ? { ...proposedAction, type: "doubleClick" } : proposedAction,
    );
  }
  // Double-clicked or not, the link went where it goes.
  expect(urlAfter(result.steps[1])).toBe(`${app.origin}/deliveries`);
  expect(urlAfter(result.steps[3])).toBe(`${app.origin}/deliveries/archive`);
});

describe("B2: scroll when stuck", () => {
  const SCROLL_UP: ActorResponse = { narration: "", action: { type: "scroll", direction: "up" } };
  const SCROLLED_DOWN = { type: "scroll", direction: "down" };
  /** Ada, who sets no B1 knob, with `scrollWhenStuck` p: only B2 rolls. */
  const stuckAda = (p: number): Profile => {
    const ada = profileFixture("prof_ada");
    return { ...ada, behaviour: { ...ada.behaviour, scrollWhenStuck: p } };
  };
  // A click, a back, then a giveUp on step 2, and another after it.
  const GIVES_UP_ON_STEP_2 = [click("link", "Deliveries"), BACK, GIVE_UP, GIVE_UP];

  test("at p 1, a giveUp on step 2 is performed as a scroll down, its roll fired, and the run goes on to step 3", async () => {
    const { result } = await walk({
      profile: stuckAda(1),
      task: taskOf("task_next-parcel"),
      maxSteps: 4,
      answers: GIVES_UP_ON_STEP_2,
    });
    const step2 = completeAt(result, 2);
    expect(step2.proposedAction).toStrictEqual({ type: "giveUp" });
    expect(step2.performedAction).toStrictEqual(SCROLLED_DOWN);
    expect(step2.dice).toStrictEqual([
      { rule: "B2", p: 1, rolled: step2.dice[0]?.rolled, fired: true },
    ]);
    // Not a give-up: the Actor decides again on step 3, and only the cap ends the run.
    expect(result.steps.map((step) => step.stepIndex)).toStrictEqual([0, 1, 2, 3]);
    expect(result.outcome).toBe("budget_exceeded");
  });

  test("at p 0, the same answers end gave_up on step 2, its roll stored as not fired", async () => {
    const { result } = await walk({
      profile: stuckAda(0),
      task: taskOf("task_next-parcel"),
      maxSteps: 4,
      answers: GIVES_UP_ON_STEP_2,
    });
    expect(result.outcome).toBe("gave_up");
    expect(result.steps).toHaveLength(3);
    const step2 = completeAt(result, 2);
    expect(step2.performedAction).toStrictEqual({ type: "giveUp" });
    expect(step2.dice).toStrictEqual([
      { rule: "B2", p: 0, rolled: step2.dice[0]?.rolled, fired: false },
    ]);
    // Steps 0 and 1 were neither a giveUp nor a repeat: nothing rolled.
    expect(diceOf(result).slice(0, 2)).toStrictEqual([[], []]);
  });

  test("a repeated proposal rolls B2, and a fired roll performs a scroll down", async () => {
    const { result } = await walk({
      profile: stuckAda(1),
      task: taskOf("task_next-parcel"),
      maxSteps: 2,
      answers: [SCROLL_UP, SCROLL_UP],
    });
    // The first scroll up is the run's first proposal; the second repeats it.
    expect(diceOf(result)[0]).toStrictEqual([]);
    const step1 = completeAt(result, 1);
    expect(step1.proposedAction).toStrictEqual(SCROLL_UP.action);
    expect(step1.performedAction).toStrictEqual(SCROLLED_DOWN);
    expect(step1.dice.map(({ rule, fired }) => ({ rule, fired }))).toStrictEqual([
      { rule: "B2", fired: true },
    ]);
  });

  test("two clicks with one ref on two pages are no repeat: nothing rolls", async () => {
    // Ada is given one ref for "Go to deliveries" on / and for the checkbox on /deliveries.
    const { result } = await walk({
      profile: stuckAda(1),
      task: taskOf("task_next-parcel"),
      maxSteps: 2,
      answers: [
        click("link", "Go to deliveries"),
        click("checkbox", "Text me on the day of delivery"),
      ],
    });
    const [first, second] = [completeAt(result, 0), completeAt(result, 1)];
    expect(second.proposedAction).toStrictEqual(first.proposedAction);
    expect(second.performedAction).toStrictEqual(second.proposedAction);
    expect(diceOf(result)).toStrictEqual([[], []]);
  });

  test("the same seed and answers twice give equal B1 and B2 rolls, the stream's draws in order", async () => {
    // Both knobs at once, as Zoya sets them, on Ada, who sees every link the answers click: B1
    // rolls on the click, B2 on each giveUp.
    const both = { ...stuckAda(0.5), behaviour: { ...stuckAda(0.5).behaviour, doubleClick: 0.5 } };
    const answers = [click("link", "Deliveries"), GIVE_UP, GIVE_UP, GIVE_UP];
    const task = taskOf("task_next-parcel");
    const [a, b] = await Promise.all([
      walk({ profile: both, task, maxSteps: 4, answers }),
      walk({ profile: both, task, maxSteps: 4, answers }),
    ]);
    // Both ended as the answers lead, so neither stored a step core's roll audit refused.
    expect([a.result.outcome, b.result.outcome]).toStrictEqual(["gave_up", "gave_up"]);
    const dice = diceOf(a.result);
    expect(diceOf(b.result)).toStrictEqual(dice);
    const rolls = dice.flatMap((step) => step ?? []);
    expect(rolls.some(({ rule }) => rule === "B1")).toBe(true);
    expect(rolls.some(({ rule }) => rule === "B2")).toBe(true);
    // One stream across both rules: the rolls are the run seed's draws, in the order rolled.
    const draw = rng(RUN_SEED);
    expect(rolls.map(({ rolled }) => rolled)).toStrictEqual(rolls.map(() => draw()));
  });

  test("at p 1, an Actor that only gives up is kept going until the step cap ends it budget_exceeded", async () => {
    const { result } = await walk({
      profile: stuckAda(1),
      task: taskOf("task_next-parcel"),
      maxSteps: 3,
      answers: [GIVE_UP, GIVE_UP, GIVE_UP],
    });
    expect(result.outcome).toBe("budget_exceeded");
    expect(result.steps).toHaveLength(3);
    for (const i of [0, 1, 2]) {
      expect(completeAt(result, i).performedAction).toStrictEqual(SCROLLED_DOWN);
    }
  });
});

/**
 * The first run seed from 1 to 200 at which `profile` sees "Order archive" degraded on the
 * measurement fixture, which is the app's /deliveries at its defaults, and the name it reads then.
 */
function degradedArchive(profile: Profile): { seed: number; maskedName: string } {
  for (let seed = 1; seed <= 200; seed++) {
    const archive = perceive(measurementFixture, profile, seed).elements.find(
      (element) => element.name === "Order archive",
    );
    if (archive?.state === "degraded" && archive.maskedName !== undefined) {
      return { seed, maskedName: archive.maskedName };
    }
  }
  throw new Error("no run seed from 1 to 200 leaves Order archive degraded");
}

test("a clicked degraded link is remembered masked in the next step's history", async () => {
  const vera = profileFixture("prof_vera");
  const { seed, maskedName } = degradedArchive(vera);
  // No click can end it: its success never holds.
  const neverDone: Task = {
    id: "task_never-done",
    goal: taskFixture("task_past-order").goal,
    startUrl: `${app.origin}/`,
    success: { type: "selectorPresent", selector: "#wayford-never-present" },
  };
  const clickMasked = (request: Request): ActorResponse => {
    const { ref, line } = pageLine(request, "link", maskedName);
    if (!line.endsWith(", partly legible")) throw new Error(`${line} is not partly legible`);
    return { narration: "That faint one, perhaps.", action: { type: "click", ref } };
  };

  const { result, calls } = await walk({
    profile: vera,
    task: neverDone,
    seed,
    answers: [click("link", "Deliveries"), clickMasked, GIVE_UP],
  });

  expect(result.outcome).toBe("gave_up");
  expect(kinds(result)).toStrictEqual(["complete", "complete", "complete"]);
  expect(urlAfter(result.steps[1])).toBe(`${app.origin}/deliveries/archive`);
  // Only the history: the archive page prints its own name in its title and heading.
  const history = between(
    calls[2]?.messages[1]?.content ?? "",
    "What you have done so far:",
    "The page you are on now:",
  );
  expect(history).toContain(`link ${JSON.stringify(maskedName)}`);
  expect(history).not.toContain("Order archive");
});

test("Kai's prompt at step 4 holds steps 2 and 3 after a count line, Ada's every step", async () => {
  const task = taskOf("task_past-order");
  // The two steps Kai forgets are on / and /account, and the two he keeps neither revisit
  // /account nor name its link.
  const answers = [
    click("link", "Your account"),
    click("link", "Deliveries"),
    click("link", "Home"),
    SCROLL_DOWN,
    GIVE_UP,
  ];
  const run = (id: string) => walk({ profile: profileFixture(id), task, maxSteps: 5, answers });
  const [kai, ada] = await Promise.all([run("prof_kai"), run("prof_ada")]);
  /** The history lines of the run's fifth request, step 4's. */
  const historyAtStep4 = ({ calls }: Walked) =>
    between(
      calls[4]?.messages[1]?.content ?? "",
      "What you have done so far:",
      "The page you are on now:",
    )
      .trim()
      .split("\n");

  for (const { result, calls } of [kai, ada]) {
    expect(result.outcome).toBe("gave_up");
    expect(kinds(result)).toHaveLength(5);
    expect(calls).toHaveLength(5);
  }
  // Kai's memorySteps is 2: one line counts what he forgot, and names none of it.
  const kept = historyAtStep4(kai);
  expect(kept).toStrictEqual([
    "- 2 earlier steps not shown.",
    `- On ${app.origin}/deliveries: you clicked link "Home".`,
    `- On ${app.origin}/: you scrolled down.`,
  ]);
  expect(kept.join("\n")).not.toContain("Your account");
  expect(kept.join("\n")).not.toContain("/account");
  // Ada sets no memorySteps, so she keeps every step, with no count line.
  expect(historyAtStep4(ada)).toStrictEqual([
    `- On ${app.origin}/: you clicked link "Your account".`,
    `- On ${app.origin}/account: you clicked link "Deliveries".`,
    `- On ${app.origin}/deliveries: you clicked link "Home".`,
    `- On ${app.origin}/: you scrolled down.`,
  ]);
});

test("a hard 3.0 contrast cut never shows Order archive", async () => {
  const ada = profileFixture("prof_ada");
  const hardCut: Profile = {
    ...ada,
    perception: {
      ...ada.perception,
      contrast: { threshold: 3, softness: 0, provenance: "wcag22" },
    },
  };

  const { result } = await walk({
    profile: hardCut,
    task: taskOf("task_past-order"),
    answers: [click("link", "Deliveries"), SCROLL_DOWN, GIVE_UP],
  });

  expect(result.outcome).toBe("gave_up");
  for (const step of result.steps) expect(step.actorObservationText).not.toContain("Order archive");
  // Not vacuous: a step stood on /deliveries, where the link was measured and cut by P1, with no
  // roll, so by the hard cut and not by a band.
  const onDeliveries = result.steps.find((step) => step.urlBefore.endsWith("/deliveries"));
  const archive = onDeliveries?.fullObservation.elements.find(
    (element) => element.name === "Order archive",
  );
  expect(archive?.state).toBe("invisible");
  const p1 = archive?.decisions.find((d) => d.stage === "perception" && d.rule === "P1");
  expect(p1).toBeDefined();
  expect(p1).not.toHaveProperty("rolled");
});

test.each([
  ["an Error", new Error("the model is down"), "Error: the model is down", costOf(0)],
  [
    "an LlmError (its cost joins the run's)",
    new LlmError("llm_request_failed", "HTTP 503: overloaded\nRetry later.", COST),
    "llm_request_failed: HTTP 503: overloaded Retry later.",
    COST,
  ],
] as const)(
  "a fake that throws %s ends runFailed with the partial step stored",
  async (_name, thrown, error, cost) => {
    const { result, events } = await walk({
      profile: profileFixture("prof_ada"),
      task: taskOf("task_next-parcel"),
      answers: [thrown],
    });

    expect(result.outcome).toBe("error");
    // Its code or name, then the whole message on one line.
    expect(events.at(-1)).toMatchObject({ type: "runFailed", stepIndex: 0, error });
    expect(result.cost).toStrictEqual(cost);
    // Observed, never planned.
    expect(kinds(result)).toStrictEqual(["incomplete"]);
    expect(result.steps[0]?.urlBefore).toBe(`${app.origin}/`);
    expect(result.steps[0]).not.toHaveProperty("proposedAction");
    expect(result.steps[0]).not.toHaveProperty("urlAfter");
    expect(RunResult.safeParse(result).success).toBe(true);
  },
);

describe("the step cap (F5 AC5)", () => {
  test("ends a wandering run after exactly maxSteps complete steps, the same way twice", async () => {
    const home = click("link", "Home");
    const wander = () =>
      walk({
        profile: profileFixture("prof_ada"),
        task: taskOf("task_next-parcel"),
        maxSteps: 3,
        answers: [home, home, home],
      });
    const [first, second] = await Promise.all([wander(), wander()]);

    for (const { result, calls } of [first, second]) {
      expect(result.outcome).toBe("budget_exceeded");
      expect(kinds(result)).toStrictEqual(["complete", "complete", "complete"]);
      expect(calls).toHaveLength(3);
    }
    expect(texts(second.result)).toStrictEqual(texts(first.result));
  });

  test("the goal reached on the cap-th step ends success", async () => {
    const { result } = await walk({
      profile: profileFixture("prof_ada"),
      task: taskOf("task_next-parcel"),
      maxSteps: 2,
      answers: [click("link", "Your account"), click("link", "Delivery address")],
    });

    expect(result.outcome).toBe("success");
    expect(kinds(result)).toStrictEqual(["complete", "complete"]);
  });

  test("only missing refs end on the cap with every step wasted", async () => {
    const { result, calls } = await walk({
      profile: profileFixture("prof_ada"),
      task: taskOf("task_next-parcel"),
      maxSteps: 3,
      answers: [
        missing("e99"),
        missing("e98"),
        missing("e99"),
        missing("e98"),
        missing("e99"),
        missing("e98"),
      ],
    });

    expect(result.outcome).toBe("budget_exceeded");
    expect(kinds(result)).toStrictEqual(["wasted", "wasted", "wasted"]);
    // One retry per step, and no more.
    expect(calls).toHaveLength(6);
  });
});

describe("the budget ends a run on its clock (B3)", () => {
  // Ada's budget is 120 s. The clock is a fake one that only an answer moves, 40 s each, so the
  // third answer lands on the budget exactly, the fourth passes it, and the test waits for none
  // of it.
  const START = Date.parse("2026-10-03T12:00:00.000Z");

  /** A fake clock at START, and answers that each move it 40 s on before they are given. */
  function fakeClock() {
    let ms = START;
    const slow =
      (answer: ActorResponse | ((request: Request) => ActorResponse)) =>
      (request: Request): ActorResponse => {
        ms += 40_000;
        return typeof answer === "function" ? answer(request) : answer;
      };
    return { now: () => ms, slow };
  }

  test("an answer that comes past the budget is planned and never performed", async () => {
    const { now, slow } = fakeClock();
    const { result, events, calls } = await walk({
      profile: profileFixture("prof_ada"),
      task: taskOf("task_next-parcel"),
      maxSteps: 20,
      now,
      answers: Array.from({ length: 20 }, () => slow(click("link", "Home"))),
    });

    expect(result.outcome).toBe("budget_exceeded");
    expect(calls).toHaveLength(4);
    // Answered at 40 s, 80 s and exactly 120 s, still within it, so performed; answered at 160 s,
    // past it, so planned and no more.
    expect(kinds(result)).toStrictEqual(["complete", "complete", "complete", "incomplete"]);
    expect(stepAt(result, 3)).toMatchObject({ proposedAction: { type: "click" } });
    expect(stepAt(result, 3)).not.toHaveProperty("urlAfter");
    expect(result.durationMs).toBe(160_000);
    const planned = events.findIndex(
      (event) => event.type === "actionPlanned" && event.stepIndex === 3,
    );
    expect(events.slice(planned + 1).map((event) => event.type)).toStrictEqual(["runFinished"]);
  });

  test("a run of wasted steps ends at the end of the step that passes it", async () => {
    const { now, slow } = fakeClock();
    const { result, calls } = await walk({
      profile: profileFixture("prof_ada"),
      task: taskOf("task_next-parcel"),
      maxSteps: 20,
      now,
      answers: Array.from({ length: 40 }, (_, i) => slow(missing(i % 2 === 0 ? "e99" : "e98"))),
    });

    // Two answers a step, 80 s: step 0 ends at 80 s, step 1 at 160 s, past the budget.
    expect(result.outcome).toBe("budget_exceeded");
    expect(kinds(result)).toStrictEqual(["wasted", "wasted"]);
    expect(calls).toHaveLength(4);
    expect(result.durationMs).toBe(160_000);
  });
});

describe("a missing ref", () => {
  test("gets one retry; a second miss wastes the step with both answers, and the run goes on", async () => {
    const task = taskOf("task_next-parcel");
    const { result, calls } = await walk({
      profile: profileFixture("prof_ada"),
      task,
      answers: [missing("e99"), missing("e98"), GIVE_UP],
    });

    expect(result.outcome).toBe("gave_up");
    expect(kinds(result)).toStrictEqual(["wasted", "complete"]);
    expect(result.steps[0]).toMatchObject({
      rejected: [missing("e99"), missing("e98")],
      cost: costOf(2),
    });
    expect(result.cost).toStrictEqual(costOf(3));
    expect(RunResult.safeParse(result).success).toBe(true);
    // The retry carries the refused answer and its ref; the next step remembers the miss.
    const shown = toActorObservation(stepAt(result, 0).fullObservation);
    expect(calls[1]?.messages).toStrictEqual(
      actorMessages({
        ...actorTurn(task.goal, shown, []),
        retry: { refused: missing("e99"), ref: "e99" },
      }),
    );
    expect(calls[2]?.messages[1]?.content).toContain(
      "you pointed at something that was not on that page",
    );
  });

  test("an accepted retry is acted on, and the step costs both calls", async () => {
    const { result } = await walk({
      profile: profileFixture("prof_ada"),
      task: taskOf("task_past-order"),
      answers: [missing("e99"), click("link", "Deliveries"), GIVE_UP],
    });

    expect(result.outcome).toBe("gave_up");
    expect(kinds(result)).toStrictEqual(["complete", "complete"]);
    const step = stepAt(result, 0);
    const deliveries = toActorObservation(step.fullObservation).elements.find(
      (element) => element.role === "link" && element.name === "Deliveries",
    );
    expect(step).toMatchObject({
      proposedAction: { type: "click", ref: deliveries?.ref },
      // The refused answer's narration stays off the record.
      narration: "Deliveries looks right.",
      cost: costOf(2),
    });
    expect(urlAfter(step)).toBe(`${app.origin}/deliveries`);
    expect(result.cost).toStrictEqual(costOf(3));
  });
});

test("every persona fixture sends the same first request on the same page (F5 AC6)", async () => {
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
      const { result, calls } = await walk({
        profile: bare,
        task: taskOf("task_next-parcel"),
        maxSteps: 1,
        answers: [GIVE_UP],
      });
      // Ended, not failed: a persona with `scrollWhenStuck` may scroll instead (B2) and meet the cap.
      expect(["gave_up", "budget_exceeded"]).toContain(result.outcome);
      // The whole request: its messages, its role, its schema and any seed.
      return calls[0];
    }),
  );

  expect(requests).toHaveLength(profileFixtures.length);
  expect(requests[0]).toBeDefined();
  for (const request of requests) expect(request).toStrictEqual(requests[0]);
});

test("a Kai run on /settings/data records K2 on the ledger", async () => {
  // Not vacuous: the run gets the target app's list, and neither of its words is Kai's.
  expect(targetAppJargon).toStrictEqual(["Fulfilment ledger"]);
  const kai = profileFixture("prof_kai");
  expect(kai.knowledge.domainVocabulary).toBeDefined();
  for (const word of ["fulfilment", "ledger"]) {
    expect(kai.knowledge.domainVocabulary).not.toContain(word);
  }

  const { result, calls } = await walk({
    profile: kai,
    task: { ...taskOf("task_past-order"), startUrl: `${app.origin}/settings/data` },
    maxSteps: 1,
    answers: [GIVE_UP],
  });

  expect(result.outcome).toBe("gave_up");
  const step = stepAt(result, 0);
  expect(step.urlBefore).toBe(`${app.origin}/settings/data`);
  const ledger = step.fullObservation.elements.find(
    (element) => element.key === "main//link:Fulfilment ledger",
  );
  expect(ledger?.decisions).toStrictEqual([
    { stage: "knowledge", rule: "K2", terms: ["Fulfilment ledger"] },
  ]);
  expect(ledger?.renamedName).toBe("[unfamiliar term]");
  // What the Actor was shown, stored and sent: the marker in the ledger's place, not the term.
  const { line } = pageLine(calls[0] as Request, "link", "[unfamiliar term]");
  expect(step.actorObservationText.split("\n")).toContain(line);
  expect(step.actorObservationText).not.toContain("Fulfilment ledger");
  expect(calls[0]?.messages[1]?.content).not.toContain("Fulfilment ledger");
});

test("a run handed params records the start URL with the three parameters, on a free port", async () => {
  const task = taskOf("task_next-parcel");
  const { result, events } = await walk({
    profile: profileFixture("prof_ada"),
    task,
    maxSteps: 1,
    answers: [GIVE_UP],
  });

  const startUrl = `${app.origin}/${TARGET_APP_DEFAULT_QUERY}`;
  expect(startUrlFor(task, TARGET_APP_DEFAULTS)).toBe(startUrl);
  expect(result.startUrl).toBe(startUrl);
  expect(events[0]).toMatchObject({ type: "runStarted", startUrl });
});

test("a back at the start page goes nowhere", async () => {
  const { result, events } = await walk({
    profile: profileFixture("prof_ada"),
    task: taskOf("task_next-parcel"),
    answers: [BACK, GIVE_UP],
  });

  expect(result.outcome).toBe("gave_up");
  expect(kinds(result)).toStrictEqual(["complete", "complete"]);
  expect(urlAfter(result.steps[0])).toBe(`${app.origin}/`);
  expect(result.steps[1]?.urlBefore).toBe(`${app.origin}/`);
  // The back had no narration, so only the giveUp's step has a narration event.
  const narrated = events.filter((event) => event.type === "narration");
  expect(narrated.map((event) => event.stepIndex)).toStrictEqual([1]);
});

test("a start that answers 404 ends runFailed with no step, and result.json is still written", async () => {
  // The target app answers a trailing slash with an empty 404.
  const task = { ...taskOf("task_past-order"), startUrl: `${app.origin}/deliveries/` };

  const { result, events, runDir } = await walk({
    profile: profileFixture("prof_vera"),
    task,
    answers: [],
  });

  expect(events.map((event) => event.type)).toStrictEqual(["runStarted", "runFailed"]);
  expect(events[1]).toMatchObject({ error: expect.stringMatching(/^run_start_failed: .*404/) });
  expect(result.outcome).toBe("error");
  expect(result.steps).toStrictEqual([]);
  expect(result).not.toHaveProperty("videoPath");
  expect(result).not.toHaveProperty("tracePath");
  const stored = RunResult.parse(JSON.parse(await readFile(join(runDir, "result.json"), "utf8")));
  expect(stored).toStrictEqual(result);
});

test("a sweep run carries its sweep on runStarted and into the record; any other run has none (issue #64)", async () => {
  const sweep: RunSweep = { sweepId: "swp_ada-attention", axis: "maxElements", value: 12 };
  const ada = profileFixture("prof_ada");
  const swept = { ...ada, behaviour: { ...ada.behaviour, maxElements: 12 } };

  const { result, events } = await walk({
    profile: swept,
    task: taskOf("task_next-parcel"),
    answers: [GIVE_UP],
    sweep,
  });

  expect(events[0]).toMatchObject({ type: "runStarted", sweep });
  expect(result.sweep).toStrictEqual(sweep);
  const plain = await walk({ profile: ada, task: taskOf("task_next-parcel"), answers: [GIVE_UP] });
  expect(plain.events[0]).not.toHaveProperty("sweep");
  expect(plain.result).not.toHaveProperty("sweep");
});

test("a pattern that can never match ends the run before a context is opened", async () => {
  // Relative: a run's contexts have no base URL to resolve it against.
  const task: Task = {
    ...taskOf("task_next-parcel"),
    success: { type: "urlMatches", pattern: "/account/address" },
  };

  const { result, events, runDir } = await walk({
    profile: profileFixture("prof_ada"),
    task,
    answers: [],
  });

  expect(events.map((event) => event.type)).toStrictEqual(["runStarted", "runFailed"]);
  expect(events[1]).toMatchObject({ error: expect.stringMatching(/^invalid_success_condition: /) });
  expect(result.steps).toStrictEqual([]);
  // No context, so no video and no trace, not even unfinished ones: result.json alone.
  expect(await readdir(runDir)).toStrictEqual(["result.json"]);
});

test.each([
  ["a maxSteps of 0", { maxSteps: 0 }],
  ["an empty runsDir", { runsDir: "" }],
  // Checked before the provider seed is drawn from it.
  ["a seed of -1", { seed: -1 }],
  // Vera's contrast threshold is 3.0, so the id is the only fault.
  [
    "a sweep whose id is not a sweep's",
    {
      profile: profileFixture("prof_vera"),
      sweep: { sweepId: "run_one", axis: "contrast", value: 3 },
    },
  ],
  // The record must name the value the profile applies: Vera's contrast is 3.0, her cap 20.
  [
    "a contrast sweep at a value the profile does not set",
    {
      profile: profileFixture("prof_vera"),
      sweep: { sweepId: "swp_one", axis: "contrast", value: 4.5 },
    },
  ],
  [
    "a maxElements sweep at a value the profile does not set",
    {
      profile: profileFixture("prof_vera"),
      sweep: { sweepId: "swp_one", axis: "maxElements", value: 12 },
    },
  ],
  // Ada sets no contrast threshold at all.
  [
    "a contrast sweep on a profile with no contrast threshold",
    { sweep: { sweepId: "swp_one", axis: "contrast", value: 3 } },
  ],
] as const)("%s rejects with invalid_run_input before any event", async (_name, override) => {
  const onEvent = vi.fn();

  const error = await runActor({
    browser,
    profile: profileFixture("prof_ada"),
    task: taskOf("task_next-parcel"),
    seed: RUN_SEED,
    params: TARGET_APP_DEFAULTS,
    jargon: targetAppJargon,
    runsDir,
    backend: llmActor({ settings, llm: () => fakeLlm({}) }),
    logger: quiet,
    onEvent,
    ...override,
  }).catch((reason: unknown) => reason);

  expect(error).toBeInstanceOf(WayfordError);
  expect((error as WayfordError).code).toBe("invalid_run_input");
  expect(onEvent).not.toHaveBeenCalled();
  expect(await readdir(runsDir)).toStrictEqual([]);
});

test("a run handed the target app's params without its jargon list rejects with invalid_run_input before any event", async () => {
  // Kai's K2 would be off without a sound: the list is optional only for another site.
  const onEvent = vi.fn();

  const error = await runActor({
    browser,
    profile: profileFixture("prof_kai"),
    task: taskOf("task_next-parcel"),
    seed: RUN_SEED,
    params: TARGET_APP_DEFAULTS,
    runsDir,
    backend: llmActor({ settings, llm: () => fakeLlm({}) }),
    logger: quiet,
    onEvent,
  }).catch((reason: unknown) => reason);

  expect(error).toBeInstanceOf(WayfordError);
  expect((error as WayfordError).code).toBe("invalid_run_input");
  expect((error as WayfordError).message).toContain("jargon");
  expect(onEvent).not.toHaveBeenCalled();
  expect(await readdir(runsDir)).toStrictEqual([]);
});

/** Ada on the easy goal, giving up at once, every event handed to `onEvent`. */
function adaGivingUp(onEvent: (event: RunEvent) => void, fake: FakeLlm): Promise<RunResult> {
  return runActor({
    browser,
    profile: profileFixture("prof_ada"),
    task: taskOf("task_next-parcel"),
    seed: RUN_SEED,
    params: TARGET_APP_DEFAULTS,
    jargon: targetAppJargon,
    runsDir,
    backend: llmActor({ settings, llm: () => billed(fake) }),
    logger: quiet,
    maxSteps: 3,
    onEvent,
  });
}

test("the terminal event is delivered even when result.json cannot be written", async () => {
  const delivered: RunEvent[] = [];

  const error = await adaGivingUp(
    (event) => {
      delivered.push(event);
      // A directory where result.json goes, so writing it fails.
      if (event.type === "runStarted") {
        mkdirSync(join(runsDir, event.runId, "result.json"), { recursive: true });
      }
    },
    fakeLlm({ actor: [GIVE_UP] }),
  ).catch((reason: unknown) => reason);

  // The write's own error, and the run still ended in its one terminal event.
  expect((error as NodeJS.ErrnoException).code).toBe("EISDIR");
  expect(delivered.at(-1)).toMatchObject({ type: "runFinished", outcome: "gave_up" });
});

describe("a listener that throws", () => {
  /** A listener that keeps every event in `delivered` and throws on the first of type `type`. */
  const throwingOn =
    (type: RunEvent["type"], delivered: RunEvent[]) =>
    (event: RunEvent): void => {
      delivered.push(event);
      if (event.type === type) throw new Error("the listener broke");
    };

  test("on stepObserved ends the run there, before the model is asked, with its error", async () => {
    const delivered: RunEvent[] = [];
    const fake = fakeLlm({ actor: [GIVE_UP] });

    const result = await adaGivingUp(throwingOn("stepObserved", delivered), fake);

    expect(result.outcome).toBe("error");
    expect(fake.calls).toHaveLength(0);
    // It still gets the terminal event, which names its error.
    expect(delivered.map((event) => event.type)).toStrictEqual([
      "runStarted",
      "stepObserved",
      "runFailed",
    ]);
    expect(delivered.at(-1)).toMatchObject({ error: "Error: the listener broke" });
    const stored = RunResult.parse(
      JSON.parse(await readFile(join(runsDir, result.id, "result.json"), "utf8")),
    );
    expect(stored).toStrictEqual(result);
  });

  test("on the terminal event makes runActor reject with its error, the record on disk", async () => {
    const delivered: RunEvent[] = [];

    const error = await adaGivingUp(
      throwingOn("runFinished", delivered),
      fakeLlm({ actor: [GIVE_UP] }),
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("the listener broke");
    const runId = delivered[0]?.runId ?? "";
    const stored = RunResult.parse(
      JSON.parse(await readFile(join(runsDir, runId, "result.json"), "utf8")),
    );
    expect(stored.outcome).toBe("gave_up");
    expect(stored).toStrictEqual(runResultFromEvents(delivered));
  });
});

// ---------------------------------------------------------------------------
// Pages the target app has no reason to hold
// ---------------------------------------------------------------------------

/**
 * Three behaviours of the loop that the target app cannot show: it moves nothing, links nowhere
 * dead and has no hover state worth measuring. A plain `node:http` server on 127.0.0.1 serves one
 * small page for each. The runs start there, with the app's parameters on the URL, which these
 * pages ignore, unless a test runs `elsewhere`, as a run on another site (ADR 0003): no
 * parameters, no jargon list, and the lenient `settle`.
 */
describe("on pages served for the purpose", () => {
  const HTML = (title: string, style: string, body: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>body { margin: 0; font: 18px sans-serif; background: #ffffff; color: #000000; } ${style}</style></head><body>${body}</body></html>`;
  // One place on the screen for both links of the hover pages, so the pointer that pressed the
  // first rests on the second after the navigation.
  const SPOT =
    "a { position: absolute; left: 40px; top: 40px; width: 240px; height: 48px; line-height: 48px; color: #000000; text-decoration: none; }";
  const SPINNER =
    "@keyframes spin { to { transform: rotate(360deg); } } .spinner { width: 24px; height: 24px; border: 2px solid #000000; animation: spin 1s linear infinite; }";
  // The spinner, and a face the server answers 404 for, used by every paragraph.
  const BUSY = `${SPINNER} @font-face { font-family: "Gone Sans"; src: url("/gone.woff2") format("woff2"); } p { font-family: "Gone Sans", sans-serif; }`;
  const PAGES: Record<string, string> = {
    // Faint for most of a second, then black: measured mid-way, it would read as low contrast.
    "/fading": HTML(
      "Fading",
      "@keyframes fade { from { color: #f4f4f4; } to { color: #000000; } } a { animation: fade 600ms ease-out both; }",
      '<p><a href="/elsewhere">Fading link</a></p>',
    ),
    // Nothing listens on port 9, so the browser lands on its own error page.
    "/dead-end": HTML("Dead end", "", '<p><a href="http://127.0.0.1:9/">Old shop</a></p>'),
    // Its link answers 204: the browser starts a navigation, its request fails, and nothing commits.
    "/no-content": HTML("No content", "", '<p><a href="/empty">Nothing new</a></p>'),
    "/hover-from": HTML("Hover from", SPOT, '<a href="/hover-to">Go on</a>'),
    // Grey while the pointer is on it: 1.9:1 against the white page.
    "/hover-to": HTML(
      "Hover to",
      `${SPOT} a:hover { color: #bbbbbb; }`,
      '<a href="/hover-from">Back again</a>',
    ),
    // A field whose input becomes the page's title, alone in a form that Enter would submit, a
    // link a scroll's length down, and room to scroll: what typing, scrolling and going back did
    // can be read off the next observation.
    "/form": HTML(
      "Form",
      "h1 { margin: 16px; } label { display: block; margin: 16px; } .gap { height: 860px; } .rest { height: 2000px; }",
      '<h1>Marker</h1><form action="/form-sent"><label>Search <input type="text" name="q" oninput="document.title = \'Typed: \' + this.value"></label></form><div class="gap"></div><p><a href="/form-next">Next page</a></p><div class="rest"></div>',
    ),
    "/form-next": HTML("Form next", "", "<p>Somewhere else</p>"),
    // A link into a page whose spinner never stops, so the page after the click never settles.
    "/spin-from": HTML("Spin from", "", '<p><a href="/spin">Spinning page</a></p>'),
    "/spin": HTML("Spin", SPINNER, '<div class="spinner"></div><p>Loading</p>'),
    // Another site's home page, for a start URL with no path.
    "/": HTML("Home", "", "<p>Somewhere else entirely</p>"),
    // A term from the target app's jargon list, on a site that has none.
    "/ledger": HTML("Ledger", "", '<p><a href="/ledger-open">Fulfilment ledger</a></p>'),
    // Real pages as many are: a spinner that never stops and a font that 404s, on every page.
    "/busy-1": HTML(
      "Busy one",
      BUSY,
      '<div class="spinner"></div><p><a href="/busy-2">Next</a></p>',
    ),
    "/busy-2": HTML(
      "Busy two",
      BUSY,
      '<div class="spinner"></div><p><a href="/busy-done">Next</a></p>',
    ),
    "/busy-done": HTML("Busy done", BUSY, '<div class="spinner"></div><p>Done</p>'),
  };

  let server: Server;
  let origin: string;

  beforeAll(async () => {
    server = createServer((request, response) => {
      const path = new URL(request.url ?? "/", "http://pages.test").pathname;
      if (path === "/empty") {
        response.writeHead(204).end();
        return;
      }
      const page = PAGES[path];
      if (page === undefined) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server?.close(resolve));
  });

  /** A task that starts on one of these pages and whose success no step reaches. */
  function servedTask(path: string): Task {
    return {
      id: "task_served-page",
      goal: "you want to look around",
      startUrl: `${origin}${path}`,
      success: { type: "urlMatches", pattern: "**/never-reached" },
    };
  }

  /** The element of step `i` named `name`, as the filter measured it. */
  function measured(result: RunResult, i: number, name: string) {
    const element = stepAt(result, i).fullObservation.elements.find((e) => e.name === name);
    if (element === undefined) throw new Error(`step ${i} has no element named ${name}`);
    return element;
  }

  test("the page is measured once its animation has ended, not mid-way", async () => {
    const { result } = await walk({
      profile: profileFixture("prof_ada"),
      task: servedTask("/fading"),
      maxSteps: 1,
      answers: [GIVE_UP],
    });

    // Black on white once settled; mid-fade it would read near 1:1.
    expect(measured(result, 0, "Fading link").metrics.contrast).toBeGreaterThan(20);
  });

  test("a click that lands off http(s) is recorded where it landed, then ends the run off_http_page", async () => {
    const { result, events } = await walk({
      profile: profileFixture("prof_ada"),
      task: servedTask("/dead-end"),
      answers: [click("link", "Old shop")],
    });

    expect(result.outcome).toBe("error");
    expect(kinds(result)).toStrictEqual(["complete"]);
    expect(urlAfter(result.steps[0])).toMatch(/^chrome-error:/);
    expect(events.at(-1)).toMatchObject({
      type: "runFailed",
      stepIndex: 0,
      error: expect.stringMatching(/^off_http_page: step 1 cannot observe chrome-error:/),
    });
  });

  test("a link whose navigation never commits lands back on its page at once, not after 30 s", async () => {
    const { result } = await walk({
      profile: profileFixture("prof_ada"),
      task: servedTask("/no-content"),
      answers: [click("link", "Nothing new"), GIVE_UP],
    });

    expect(result.outcome).toBe("gave_up");
    // The page stays where it was: nothing committed.
    expect(urlAfter(result.steps[0])).toBe(stepAt(result, 0).urlBefore);
    // The failed request ends the wait for a commit; the 30 s commit timeout would have run out.
    expect(result.durationMs).toBeLessThan(10_000);
  });

  test("type, scroll and back each do what they say", async () => {
    const { result } = await walk({
      profile: profileFixture("prof_ada"),
      task: servedTask("/form"),
      maxSteps: 5,
      answers: [
        (request: Request): ActorResponse => ({
          narration: "Let me search.",
          action: {
            type: "type",
            ref: pageLine(request, "textbox", "Search").ref,
            text: "parcel\nnow",
          },
        }),
        SCROLL_DOWN,
        click("link", "Next page"),
        BACK,
        GIVE_UP,
      ],
    });

    expect(result.outcome).toBe("gave_up");
    expect(kinds(result)).toStrictEqual([
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
    ]);
    // Typed on one line, as the history tells it: the line break became a space, not an Enter that
    // submits the form, and the field's input became the page's title.
    expect(urlAfter(result.steps[0])).toBe(stepAt(result, 0).urlBefore);
    expect(stepAt(result, 1).fullObservation.title).toBe("Typed: parcel now");
    // Scrolled down by 0.8 of the 720 px viewport, at once.
    const markerAt = (i: number) => measured(result, i, "Marker").bbox.y;
    expect(markerAt(1) - markerAt(2)).toBe(Math.round(0.8 * 720));
    // Went back to the page the link left.
    expect(stepAt(result, 3).urlBefore).toBe(`${origin}/form-next`);
    expect(urlAfter(result.steps[3])).toBe(stepAt(result, 0).urlBefore);
  });

  test("a page that never settles after a click still records where it landed, then ends the run", async () => {
    const { result, events } = await walk({
      profile: profileFixture("prof_ada"),
      task: servedTask("/spin-from"),
      answers: [click("link", "Spinning page")],
    });

    expect(result.outcome).toBe("error");
    // The click landed, so the step is complete, with no screenshot of a page that never stood still.
    expect(kinds(result)).toStrictEqual(["complete"]);
    expect(urlAfter(result.steps[0])).toBe(`${origin}/spin`);
    expect(result.steps[0]).not.toHaveProperty("screenshotPath");
    expect(events.at(-1)).toMatchObject({
      type: "runFailed",
      error: expect.stringMatching(/^page_not_settled: .*still running: animation "spin"/),
    });
  });

  test("a listener that throws on a failed step's actionPerformed ends the run with its error, and the step's goes to the log", async () => {
    const delivered: RunEvent[] = [];
    const lines: string[] = [];
    const logger = pino({ level: "error" }, { write: (line: string) => void lines.push(line) });

    await runActor({
      browser,
      profile: profileFixture("prof_ada"),
      task: servedTask("/spin-from"),
      seed: RUN_SEED,
      params: TARGET_APP_DEFAULTS,
      jargon: targetAppJargon,
      runsDir,
      backend: llmActor({
        settings,
        llm: () => billed(fakeLlm({ actor: [click("link", "Spinning page")] })),
      }),
      logger,
      onEvent: (event) => {
        delivered.push(event);
        if (event.type === "actionPerformed") throw new Error("the listener broke");
      },
    });

    expect(delivered.at(-1)).toMatchObject({
      type: "runFailed",
      error: "Error: the listener broke",
    });
    // The settle that stopped the step is not lost.
    expect(lines.some((line) => line.includes('still running: animation \\"spin\\"'))).toBe(true);
  });

  test("the pointer rests where it pressed, so the step's screenshot and the next page's measurement show its hover state", async () => {
    const { result, runDir } = await walk({
      profile: profileFixture("prof_ada"),
      task: servedTask("/hover-from"),
      answers: [click("link", "Go on"), GIVE_UP],
    });

    expect(result.steps[1]?.urlBefore).toBe(`${origin}/hover-to`);
    // Under the pointer, so hovered: grey, not the black it is without a pointer on it.
    expect(measured(result, 1, "Back again").metrics.contrast).toBeLessThan(3);
    // The screenshot after the click shows it so too: its text, left of the cursor drawn at the
    // link's centre, is #bbbbbb at its darkest, where an unhovered link would be black.
    const screenshot = join(runDir, stepAt(result, 0).screenshotPath ?? "");
    expect(await darkest(screenshot, { x: 40, y: 40, width: 80, height: 48 })).toBeGreaterThan(150);
  });

  describe("as another site, handed no params", () => {
    test("a run opens its start URL as given and records it unchanged", async () => {
      // No path before the query: `new URL` would add a `/`, and a parameter appended would show.
      const task = { ...servedTask("/"), startUrl: `${origin}?q=1#h` };
      const { result, events } = await walk({
        profile: profileFixture("prof_ada"),
        task,
        maxSteps: 1,
        answers: [GIVE_UP],
        elsewhere: true,
      });

      expect(result.outcome).toBe("gave_up");
      expect(result.startUrl).toBe(task.startUrl);
      expect(events[0]).toMatchObject({ type: "runStarted", startUrl: task.startUrl });
      // The browser's own spelling of the same page: no parameter was added on the way.
      expect(stepAt(result, 0).urlBefore).toBe(`${origin}/?q=1#h`);
    });

    test("K2 never fires with no jargon list, even on a term from the target app's list", async () => {
      // Not vacuous: the term is the list's, Kai has a vocabulary and lacks both its words, and
      // the run on the target app above records K2 on it.
      const kai = profileFixture("prof_kai");
      expect(targetAppJargon).toContain("Fulfilment ledger");
      expect(kai.knowledge.domainVocabulary).toBeDefined();

      const { result, calls } = await walk({
        profile: kai,
        task: servedTask("/ledger"),
        maxSteps: 1,
        answers: [GIVE_UP],
        elsewhere: true,
      });

      const ledger = measured(result, 0, "Fulfilment ledger");
      expect(ledger.decisions.filter((decision) => decision.rule === "K2")).toStrictEqual([]);
      expect(ledger.renamedName).toBeUndefined();
      expect(calls[0]?.messages[1]?.content).toContain("Fulfilment ledger");
    });

    test("an endless spinner and a font that 404s cost each step milliseconds, not the deadline", async () => {
      const lines: Record<string, unknown>[] = [];
      const logger = pino(
        { level: "info" },
        { write: (line: string) => void lines.push(JSON.parse(line)) },
      );
      const { result, events } = await walk({
        profile: profileFixture("prof_ada"),
        task: {
          ...servedTask("/busy-1"),
          success: { type: "urlMatches", pattern: "**/busy-done" },
        },
        answers: [click("link", "Next"), click("link", "Next")],
        elsewhere: true,
        logger,
      });

      expect(result.outcome).toBe("success");
      expect(kinds(result)).toStrictEqual(["complete", "complete"]);
      // Each gap holds one `settle`: from the plan to the landing (the settle after the action),
      // and from the landing to the next observation (the settle before the measurement).
      const at = (type: RunEvent["type"], step: number): number => {
        const event = events.find((e) => e.type === type && e.stepIndex === step);
        if (event === undefined) throw new Error(`no ${type} at step ${step}`);
        return Date.parse(event.timestamp);
      };
      const gaps = [
        at("actionPerformed", 0) - at("actionPlanned", 0),
        at("stepObserved", 1) - at("actionPerformed", 0),
        at("actionPerformed", 1) - at("actionPlanned", 1),
      ];
      for (const gap of gaps) expect(gap).toBeLessThan(SETTLE_TIMEOUT_MS);
      // What was skipped is logged, and the record has no field for it.
      const skipped = lines.filter((line) => line.msg === "settle skipped what never ends");
      expect(skipped.length).toBeGreaterThan(0);
      expect(skipped[0]).toMatchObject({
        failedFonts: ['"Gone Sans"'],
        endlessAnimations: ['animation "spin" on <div>'],
      });
    });
  });
});

test("a recording that cannot be saved ends runFailed run_close_failed, and result.json is still written", async () => {
  const fake = fakeLlm({ actor: [GIVE_UP] });
  const events: RunEvent[] = [];

  const result = await runActor({
    browser,
    profile: profileFixture("prof_ada"),
    task: taskOf("task_next-parcel"),
    seed: RUN_SEED,
    params: TARGET_APP_DEFAULTS,
    jargon: targetAppJargon,
    runsDir,
    backend: llmActor({ settings, llm: () => billed(fake) }),
    logger: quiet,
    onEvent: (event) => {
      events.push(event);
      // A directory where closing the run saves its trace (`run-context.ts` names the files), so
      // the save fails, on every platform. A mode that refuses writes does not: Windows ignores
      // it on a directory.
      if (event.type === "runStarted") {
        const stem = `ada-seed${RUN_SEED}-${event.runId}`;
        mkdirSync(join(runsDir, event.runId, `${stem}.trace.zip`), { recursive: true });
      }
    },
  });

  expect(result.outcome).toBe("error");
  // The outcome the run reached stays in the message.
  expect(events.at(-1)).toMatchObject({
    type: "runFailed",
    error: expect.stringMatching(
      /^run_close_failed: the run ended gave_up, then saving its recording failed: /,
    ),
  });
  expect(kinds(result)).toStrictEqual(["complete"]);
  expect(result).not.toHaveProperty("videoPath");
  expect(result).not.toHaveProperty("tracePath");
  const stored = RunResult.parse(
    JSON.parse(await readFile(join(runsDir, result.id, "result.json"), "utf8")),
  );
  expect(stored).toStrictEqual(result);
});

test("a run on a phone measures the page as a phone's", async () => {
  const { result } = await walk({
    profile: profileFixture("prof_milo"),
    task: taskOf("task_next-parcel"),
    maxSteps: 1,
    answers: [GIVE_UP],
  });

  // Milo's device is a phone. The page cannot tell, so the loop passes the context's flag to the
  // collector, and the observation records it.
  expect(stepAt(result, 0).fullObservation.viewport.isMobile).toBe(true);
});
