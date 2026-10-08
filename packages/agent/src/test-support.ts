/**
 * Test support for agent's browser tests that run `runActor` on the served target app, never
 * exported from the barrel: the app and Chromium for the file, a fresh runs folder per test, the
 * fake's fixed bill, and readers of what a run stored. `actor-loop.browser.test.ts` and
 * `jev-actor.browser.test.ts` share it, as filter's tests share its `test-support.ts`. It also
 * holds the hand-built pages B4's unit tests measure through the real filter, which
 * `behaviour.test.ts` and `misclick.test.ts` share.
 *
 * `app`, `browser` and `runsDir` are live bindings that `useServedApp`'s hooks set. vitest loads
 * this module once per test file, so no two files share them.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ActorResponse,
  type Bbox,
  type Cost,
  type ElementRef,
  elementKey,
  FullObservation,
  type MeasuredElement,
  PageMeasurement,
  type Profile,
  type RunResult,
  type RunStep,
  smallerSide,
  type Task,
  toActorObservation,
} from "@wayford/core";
import { measurementFixture, profileFixture, taskFixture } from "@wayford/core/fixtures";
import { perceive } from "@wayford/filter";
import { serveTargetApp, type TargetApp } from "@wayford/filter/serve-target-app";
import pino from "pino";
import type { Browser } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import type { z } from "zod";
import { launchChromium } from "./cli.js";
import type { FakeLlm } from "./fake-llm.js";
import type { HistoryStep } from "./history.js";
import type { CompleteRequest, Decision, Llm } from "./llm.js";
import { parseLlmSettings } from "./llm-settings.js";

export const RUN_SEED = 7;

// Not zero, so a step's cost is seen to be its own calls'. The dollars are a power of two, so
// sums of them are exact.
export const COST: Cost = { tokensIn: 1000, tokensOut: 100, usd: 0.125 };

// Neither model has a price in models.yaml, so no run here can build the real adapter by mistake.
export const settings = parseLlmSettings({
  LLM_API_KEY: "test-key",
  LLM_ACTOR_MODEL: "fake",
  LLM_JEV_MODEL: "fake-jev",
});

export const quiet = pino({ level: "silent" });

export let app: TargetApp;
export let browser: Browser;
export let runsDir: string;

/**
 * The file's hooks: the app built and served once, one Chromium for every run, and each test's
 * runs in a fresh temporary directory. From the moment the app is up, `fetch` throws, so a run
 * that reached for a network would fail.
 */
export function useServedApp(): void {
  // Building the app and launching Chromium take longer than vitest's 5 s hook default, and a run
  // records, encodes and saves a video.
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

  beforeAll(async () => {
    browser = await launchChromium();
    app = await serveTargetApp();
    vi.stubGlobal("fetch", () => {
      throw new Error("a test reached for the network");
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await browser?.close();
    await app?.close();
  });

  beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), "wayford-runs-"));
  });

  afterEach(async () => {
    // A test that failed half way can leave a context open, and its video would hold the directory.
    await Promise.all(browser.contexts().map((context) => context.close()));
    await rm(runsDir, { recursive: true, force: true, maxRetries: 3 });
  });
}

/** A task fixture, started on the served app's home page. */
export function taskOf(id: string): Task {
  return { ...taskFixture(id), startUrl: `${app.origin}/` };
}

/**
 * The fake, billing COST for each answer it gives, and keeping each `decide` answer in `answered`,
 * so a step's record can be held to what Jev sent. A thrown entry bills nothing, like a call that
 * fails before it is answered.
 */
export function billed(fake: FakeLlm, answered: Decision[] = []): Llm {
  return {
    ...fake,
    complete: async (request) => ({ ...(await fake.complete(request)), cost: COST }),
    decide: async (request) => {
      const decision = await fake.decide(request);
      answered.push(decision);
      return { ...decision, cost: COST };
    },
  };
}

// ---------------------------------------------------------------------------
// Scripted LLM answers
// ---------------------------------------------------------------------------

export type Request = CompleteRequest<z.ZodObject>;

export const GIVE_UP: ActorResponse = {
  narration: "I cannot find it here.",
  action: { type: "giveUp" },
};

/** A page line of the observation text, such as `[e3] link "Deliveries" at 410,25`. */
const PAGE_LINE = /^\[(e[1-9][0-9]*)\] (.*)$/;

/**
 * The first page line that names `<role> "<name>"`, and its ref, read from the turn message the
 * request carries (`messages[1]`, there on a retry too). History lines start with "- On", so only
 * the page is searched. Throws when the persona was not shown such an element.
 */
export function pageLine(
  request: Request,
  role: string,
  name: string,
): { ref: string; line: string } {
  const turn = request.messages[1]?.content ?? "";
  const named = `${role} ${JSON.stringify(name)} at `;
  for (const line of turn.split("\n")) {
    const match = PAGE_LINE.exec(line);
    if (match?.[1] !== undefined && match[2]?.startsWith(named)) return { ref: match[1], line };
  }
  throw new Error(`the persona was not shown a ${role} named ${JSON.stringify(name)}`);
}

/** An answer that clicks the first `<role> "<name>"` of the page it is shown. */
export function click(role: string, name: string): (request: Request) => ActorResponse {
  return (request) => ({
    narration: `${name} looks right.`,
    action: { type: "click", ref: pageLine(request, role, name).ref },
  });
}

// ---------------------------------------------------------------------------
// What a run stored
// ---------------------------------------------------------------------------

/** How each step was stored. */
export function kinds(result: RunResult): string[] {
  return result.steps.map((step) =>
    "wasted" in step ? "wasted" : "incomplete" in step ? "incomplete" : "complete",
  );
}

/** Step `i` of a run, failing the test when the run has none. */
export function stepAt(result: RunResult, i: number): RunStep {
  const step = result.steps[i];
  if (step === undefined) throw new Error(`run ${result.id} has no step ${i}`);
  return step;
}

export function urlAfter(step: RunStep | undefined): string | undefined {
  return step !== undefined && "urlAfter" in step ? step.urlAfter : undefined;
}

/** What the Actor was shown at each step. */
export function texts(result: RunResult): string[] {
  return result.steps.map((step) => step.actorObservationText);
}

/** Every step's behaviour rolls, in order: `undefined` for a step that planned no action. */
export function diceOf(result: RunResult) {
  return result.steps.map((step) => ("dice" in step ? step.dice : undefined));
}

/** The history each step's turn renders, rebuilt from the stored steps before it. */
export function historyOf(steps: readonly RunStep[]): HistoryStep[] {
  return steps.map((step) => {
    const observation = toActorObservation(step.fullObservation);
    if ("wasted" in step) return { observation, wasted: true };
    if (step.proposedAction === undefined) {
      throw new Error(`step ${step.stepIndex} planned no action`);
    }
    return { observation, proposed: step.proposedAction };
  });
}

// ---------------------------------------------------------------------------
// Hand-built pages for B4's unit tests
// ---------------------------------------------------------------------------

/** Ada has no threshold, so `perceive` shows every element, numbered e1..eN in this order. */
export const ADA = profileFixture("prof_ada");

/** A link in `main`. Its target size is its box's smaller side unless a label widens it. */
export function link(name: string, bbox: Bbox, targetPx = smallerSide(bbox)): MeasuredElement {
  return {
    key: elementKey({ role: "link", name, path: [{ role: "main" }] }),
    kind: "control",
    role: "link",
    name,
    bbox,
    metrics: { targetPx },
  };
}

/** A paragraph in `main`: a text block, which carries no target size. */
export function paragraph(name: string, bbox: Bbox): MeasuredElement {
  return {
    key: elementKey({ role: "paragraph", name, path: [{ role: "main" }] }),
    kind: "text",
    role: "paragraph",
    name,
    bbox,
    metrics: { fontPx: 16 },
  };
}

/**
 * The step's evidence for a page of `elements`, as `perceive` gives it for `profile`: the
 * measurement fixture's page, 1280 × 720 on the desktop and not scrolled, holding these elements.
 */
export function observe(elements: MeasuredElement[], profile: Profile = ADA): FullObservation {
  const measurement = PageMeasurement.parse({ ...measurementFixture, elements });
  return FullObservation.parse(perceive(measurement, profile, 7));
}

/** The ref the observation gave the element named `name`. */
export function refOf(page: FullObservation, name: string): ElementRef {
  const ref = page.elements.find((element) => element.name === name)?.ref;
  if (ref === undefined) throw new Error(`no shown element is named ${name}`);
  return ref;
}
