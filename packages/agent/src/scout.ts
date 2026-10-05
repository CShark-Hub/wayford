/**
 * Scout: a task walked with full vision, to find where its goal actually is (`tasks/s2-04-scout.md`,
 * `docs/PLAN.md` F4). Without that ground truth a report cannot tell "the feature is broken" from
 * "the feature works but Vera could not find it" (`AGENTS.md`, "Scout is mandatory").
 *
 * Scout reuses the Actor loop whole. Each attempt is an ordinary run of `runActor`, with Scout's
 * own profile, which constrains nothing, and its LLM on the `scout` role. So an attempt emits
 * `runStarted` like any run, with Scout's model as `modelIds.actor` (`ModelIds` in core), and its
 * folder holds the evidence a path points at.
 *
 * Run by hand when the target app changes (`run-scout.ts`). There is no cache and no DOM hash: we
 * own the app and know when it changes.
 *
 * The Actor never reads what Scout writes (`AGENTS.md`). So this module is not in the package's
 * main entry: it ships as `@wayford/agent/scout`, as the fake adapter ships as `./fake`, and a
 * caller that imports `runActor` from `@wayford/agent`, as io's runs do, never loads it. Inside
 * this package, `actor-isolation.test.ts` fails when any other module, the barrel included,
 * reaches it.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GroundTruth,
  groundTruthOf,
  type PathStep,
  type Profile,
  type RunEvent,
  type RunResult,
  type ScoutAttempt,
  type ScoutPath,
  type Task,
  UI_PATTERNS,
  WayfordError,
} from "@wayford/core";
import { targetAppJargon } from "@wayford/core/fixtures";
import type { Logger } from "pino";
import type { Browser } from "playwright";
import { runActor } from "./actor-loop.js";
import type { Llm } from "./llm.js";
import { llmActor } from "./llm-actor.js";
import type { LlmSettings } from "./llm-settings.js";
import type { TargetAppParams } from "./start-url.js";

/**
 * Full vision: no perception threshold, no attention or memory cap, every pattern known, no
 * behaviour dice. Built here, not kept with the personas in core's fixtures: Scout is not under
 * test, and a persona there joins the persona grid and the words the Actor may not read.
 *
 * `budgetSeconds` is required, so it is set far past any attempt the 20-step cap allows: the cap
 * ends a lost attempt, and the clock (B3, s2-10) never cuts a slow model short.
 */
export const SCOUT_PROFILE: Profile = {
  id: "prof_scout",
  label: "Scout",
  description:
    "Ground truth, not a persona: sees the whole page on a desktop, knows every pattern, nothing capped, no dice.",
  seed: 0,
  device: "desktop",
  perception: { emulation: "none" },
  behaviour: { budgetSeconds: 3600 },
  knowledge: { knownPatterns: [...UI_PATTERNS], unknownPatterns: [] },
};

/** Every attempt runs, so "the shortest" and "every success" mean something. */
const SCOUT_ATTEMPTS = 3;

export interface ScoutOptions {
  /** The caller's, as for `runActor`: Scout never launches or closes it. */
  browser: Browser;
  task: Task;
  params: TargetAppParams;
  /**
   * Scout writes `<dir>/<task id>.json`, and each attempt's run folder goes under
   * `<dir>/attempts/`, so all its output sits in one directory, apart from the Actor's runs.
   */
  dir: string;
  settings: LlmSettings;
  /** Replaces the adapter in tests, as in `llmActor`. */
  llm?: (logger: Logger) => Llm;
  logger: Logger;
  /** Called with each event of each attempt, as `runActor` calls it. */
  onEvent?: (event: RunEvent) => void;
}

/**
 * Walks `task` `SCOUT_ATTEMPTS` times, one attempt after another with run seeds 1, 2 and 3, writes
 * its `GroundTruth` to `<dir>/<task id>.json` and returns it.
 *
 * Rejects when an attempt's `runActor` rejects, which leaves no ground truth: before the run
 * starts, or when its record cannot be folded or written (`runActor`). Rejects with
 * `scout_inconclusive`, and writes nothing, when no attempt reached the goal and one of them
 * crashed: a crash is no evidence that the goal is out of reach.
 */
export async function scout(options: ScoutOptions): Promise<GroundTruth> {
  const { task, dir, settings, llm } = options;
  const results: RunResult[] = [];
  for (let seed = 1; seed <= SCOUT_ATTEMPTS; seed++) {
    results.push(
      await runActor({
        browser: options.browser,
        profile: SCOUT_PROFILE,
        task,
        seed,
        params: options.params,
        // Scout's profile sets no vocabulary, so K2 never fires; passed all the same, as every run.
        jargon: targetAppJargon,
        runsDir: join(dir, "attempts"),
        backend: llmActor({ settings, role: "scout", ...(llm && { llm }) }),
        logger: options.logger,
        ...(options.onEvent && { onEvent: options.onEvent }),
      }),
    );
  }

  const attempts: ScoutAttempt[] = results.map((result) => ({
    runId: result.id,
    outcome: result.outcome,
    ...(result.outcome === "success" && { path: pathOf(result) }),
  }));
  const derived = groundTruthOf(attempts);
  const crashed = attempts.filter((attempt) => attempt.outcome === "error");
  if (!derived.reached && crashed.length > 0) {
    throw new WayfordError(
      "scout_inconclusive",
      `no attempt reached the goal of ${task.id}, and ${crashed.length} of ${attempts.length} crashed ` +
        `(${crashed.map((attempt) => attempt.runId).join(", ")}), so that is no evidence the goal ` +
        "is out of reach. Run Scout again.",
    );
  }
  const [first] = results;
  if (first === undefined) throw new Error("Scout ran no attempt");

  const truth = GroundTruth.parse({
    taskId: task.id,
    // The backend's model, as the attempt recorded it: Scout's, since it plays the Actor's part.
    modelId: first.modelIds.actor,
    startUrl: first.startUrl,
    recordedAt: new Date(Date.now()).toISOString(),
    attempts,
    ...derived,
  });
  await mkdir(dir, { recursive: true });
  // The task id parsed as `TaskId` on the attempts' `runStarted`, so it is one path segment.
  await writeFile(join(dir, `${task.id}.json`), `${JSON.stringify(truth, null, 2)}\n`);
  return truth;
}

/**
 * The path of a successful run: every action that ran, with the page it ran on and the key of the
 * element it named, and the page the last one landed on. A wasted step ran nothing, so it is
 * skipped; a successful run has no incomplete step (`RunResult`).
 */
function pathOf(result: RunResult): ScoutPath {
  const steps: PathStep[] = [];
  let reachedUrl = "";
  for (const step of result.steps) {
    if ("wasted" in step || "incomplete" in step) continue;
    const action = step.performedAction;
    let key: string | undefined;
    if ("ref" in action) {
      const element = step.fullObservation.elements.find((shown) => shown.ref === action.ref);
      // The loop checks every ref against the observation it showed, so only a bug reaches here.
      if (element === undefined) {
        throw new Error(
          `step ${step.stepIndex} of ${result.id} acted on ${action.ref}, never shown`,
        );
      }
      key = element.key;
    }
    steps.push({ url: step.urlBefore, action: action.type, ...(key !== undefined && { key }) });
    reachedUrl = step.urlAfter;
  }
  return { steps, reachedUrl };
}
