/**
 * `scout` on the served target app, against the scripted-fake box of `tasks/s2-04-scout.md`. The
 * app is built and served once, one Chromium serves every attempt, and each test writes into a
 * fresh temporary directory.
 *
 * No test reaches a model or a network: Scout's LLM is the fake adapter, and `fetch` throws from
 * the moment the app is up. The fake answers by element name, read from the turn it is sent, as
 * `actor-loop.browser.test.ts` does, since refs are numbered per page.
 */
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ActorResponse, GroundTruth, RunResult, type Task } from "@wayford/core";
import { groundTruthFixture, taskFixture } from "@wayford/core/fixtures";
import { serveTargetApp, type TargetApp } from "@wayford/filter/serve-target-app";
import pino from "pino";
import { type Browser, chromium } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { z } from "zod";
import { runActor } from "./actor-loop.js";
import { type FakeLlm, fakeLlm } from "./fake-llm.js";
import type { CompleteRequest } from "./llm.js";
import { parseLlmSettings } from "./llm-settings.js";
import { SCOUT_PROFILE, scout } from "./scout.js";
import { TARGET_APP_DEFAULTS } from "./start-url.js";

// Building the app and launching Chromium take longer than vitest's 5 s hook default, and Scout
// records three runs, each with a video.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// Neither model has a price in models.yaml, so no test here can build the real adapter by mistake.
const settings = parseLlmSettings({
  LLM_API_KEY: "test-key",
  LLM_ACTOR_MODEL: "fake",
  LLM_SCOUT_MODEL: "fake-scout",
});

const quiet = pino({ level: "silent" });

let app: TargetApp;
let browser: Browser;
let dir: string;

beforeAll(async () => {
  browser = await chromium.launch().catch((error: unknown) => {
    throw new Error(
      "Chromium did not launch. If it is not installed, run " +
        "`pnpm --filter @wayford/agent exec playwright install --only-shell chromium`.",
      { cause: error },
    );
  });
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
  dir = await mkdtemp(join(tmpdir(), "wayford-scout-"));
});

afterEach(async () => {
  await Promise.all(browser.contexts().map((context) => context.close()));
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
});

// ---------------------------------------------------------------------------
// Scripted answers
// ---------------------------------------------------------------------------

type Request = CompleteRequest<z.ZodObject>;

/** A page line of the observation text, such as `[e3] link "Deliveries" at 410,25`. */
const PAGE_LINE = /^\[(e[1-9][0-9]*)\] (.*)$/;

/** An answer that clicks the first `<role> "<name>"` of the page it is shown. */
function click(role: string, name: string): (request: Request) => ActorResponse {
  return (request) => {
    const turn = request.messages[1]?.content ?? "";
    const named = `${role} ${JSON.stringify(name)} at `;
    for (const line of turn.split("\n")) {
      const match = PAGE_LINE.exec(line);
      if (match?.[1] !== undefined && match[2]?.startsWith(named)) {
        return { narration: `${name} looks right.`, action: { type: "click", ref: match[1] } };
      }
    }
    throw new Error(`Scout was not shown a ${role} named ${JSON.stringify(name)}`);
  };
}

const ROUTE_B = [
  click("link", "Your account"),
  click("button", "More options"),
  click("menuitem", "Past orders"),
];
const ROUTE_A = [click("link", "Deliveries"), click("link", "Order archive")];
const GIVE_UP: ActorResponse = { narration: "Nothing here.", action: { type: "giveUp" } };

const pathname = (url: string) => new URL(url).pathname;

/** Scout on the hard goal, started on the served app's home page, its LLM answering `answers`. */
function scoutOn(answers: unknown[]): { fake: FakeLlm; run: Promise<GroundTruth> } {
  const fake = fakeLlm({ scout: answers });
  const task: Task = { ...taskFixture("task_past-order"), startUrl: `${app.origin}/` };
  const run = scout({
    run: (options) => runActor({ ...options, browser }),
    task,
    params: TARGET_APP_DEFAULTS,
    dir,
    settings,
    llm: () => fake,
    logger: quiet,
  });
  return { fake, run };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("keeps every success and takes route A as the ground truth", async () => {
  const { fake, run } = scoutOn([...ROUTE_B, ...ROUTE_A, GIVE_UP]);
  const truth = await run;

  // The box: the path /, /deliveries, /deliveries/archive, and "Order archive" as the target.
  const { shortest, target } = truth;
  expect(shortest?.runId).toBe(truth.attempts[1]?.runId);
  expect(
    [...(shortest?.path.steps ?? []).map((step) => step.url), shortest?.path.reachedUrl].map(
      (url) => pathname(url ?? ""),
    ),
  ).toStrictEqual(["/", "/deliveries", "/deliveries/archive"]);
  expect(target?.key).toBe("main//link:Order archive");
  expect(pathname(target?.page ?? "")).toBe("/deliveries");

  // Every attempt is kept, route B, route A and the give-up, with the paths of the fixture, which
  // are the ones collect really gives, origin aside.
  const local = (attempts: GroundTruth["attempts"]) =>
    attempts.map(({ outcome, path }) => ({
      outcome,
      steps: path?.steps.map((step) => ({ ...step, url: pathname(step.url) })),
      reachedUrl: path && pathname(path.reachedUrl),
    }));
  expect(local(truth.attempts)).toStrictEqual(local(groundTruthFixture.attempts));

  // Scout's model on the `scout` role, on every call and on the record.
  expect(fake.calls.map(({ role }) => role)).toStrictEqual(Array(6).fill("scout"));
  expect(truth.modelId).toBe("fake-scout");
  expect(pathname(truth.startUrl)).toBe("/");

  // The file is the ground truth returned, and every attempt is a run under `attempts/`.
  const written = JSON.parse(await readFile(join(dir, "task_past-order.json"), "utf8"));
  expect(GroundTruth.parse(written)).toStrictEqual(truth);
  const runs = await Promise.all(
    truth.attempts.map(async ({ runId }) =>
      RunResult.parse(
        JSON.parse(await readFile(join(dir, "attempts", runId, "result.json"), "utf8")),
      ),
    ),
  );
  expect(runs.map((run) => [run.profileId, run.seed, run.modelIds.actor])).toStrictEqual([
    [SCOUT_PROFILE.id, 1, "fake-scout"],
    [SCOUT_PROFILE.id, 2, "fake-scout"],
    [SCOUT_PROFILE.id, 3, "fake-scout"],
  ]);
});

test("no attempt reached and one crashed: scout_inconclusive, and no file", async () => {
  const { run } = scoutOn([GIVE_UP, GIVE_UP, new Error("the model is down")]);

  await expect(run).rejects.toMatchObject({ code: "scout_inconclusive" });
  expect(existsSync(join(dir, "task_past-order.json"))).toBe(false);
});

test("no attempt reached and none crashed: a result, written as not reached", async () => {
  const { run } = scoutOn([GIVE_UP, GIVE_UP, GIVE_UP]);
  const truth = await run;

  expect(truth.reached).toBe(false);
  expect(truth.attempts.map(({ outcome }) => outcome)).toStrictEqual([
    "gave_up",
    "gave_up",
    "gave_up",
  ]);
  expect(truth).not.toHaveProperty("shortest");
  expect(truth).not.toHaveProperty("target");
  const written = JSON.parse(await readFile(join(dir, "task_past-order.json"), "utf8"));
  expect(GroundTruth.parse(written)).toStrictEqual(truth);
});
