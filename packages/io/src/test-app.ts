/**
 * Test support for io's own tests, never exported from the barrel
 * (`docs/specs/2026-10-02-s4-03-runs-api.md`, "test-app.ts"): `testApp`, the whole app on a store
 * in a temporary folder, and `runnerDefaults` and `analystDefaults`, what it runs on; `postJson`
 * and `getJson`, one request each, and `getBytes`, one read as bytes; `fakeRun`, a `RunFn`
 * scripted per run, so no io test needs a browser or a model, and `gate`, which holds one open;
 * `readSse` and `readEvents`, which read a server-sent event stream message by message;
 * `noIllustration`, the default picture, which throws; `noAxeViolations`, the default axe-core
 * scan, which finds nothing; `noScout`, the default Scout, which throws; `quiet` and `capture`, a
 * logger that writes nothing and one that keeps every warning; `crlfCheckout`, files read with
 * CRLF, as a clone checked out before `.gitattributes` holds them; for the Analyst's tests,
 * `storedRun`, `fakeAxe` and Vera's `/deliveries` as the filter gives it; and for the browser tests
 * on any page, `anyPage`, a site's page with a 404 stylesheet, a 404 font face and an endless
 * animation, `FAINT_TEXT`, its paragraph, `FAILED_FONT_PAGE`, a page whose only fault is its font,
 * and `serveLocal`, `servePage` and `stopLocal`, a Node server on a free port. io's test files
 * share it, as agent's callers share `fake-llm.ts`.
 */
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ActorBackendFactory,
  type ActorBackendName,
  decisionDrawFor,
  providerSeedFor,
  startUrlFor,
  TARGET_APP_DEFAULTS,
} from "@wayford/agent";
import { fakeLlm } from "@wayford/agent/fake";
import {
  type Action,
  type AxeScan,
  type Cost,
  type FinishedOutcome,
  type FullObservation,
  newId,
  type ObservedElement,
  type Profile,
  RunEvent,
  type RunId,
  type RunResult,
  type RunSweep,
  runResultFromEvents,
  type Seed,
  type Task,
  WayfordError,
} from "@wayford/core";
import {
  measurementFixture,
  observationFixture,
  profileFixture,
  targetAppJargon,
  taskFixture,
} from "@wayford/core/fixtures";
import { perceive } from "@wayford/filter/perceive";
import pino from "pino";
import { onTestFinished, vi } from "vitest";
import { type AppOptions, createApp } from "./app.js";
import type { AxeLookup, AxeScanFn } from "./axe.js";
import { type Db, migrateDatabase, openDatabase } from "./db/database.js";
import type { PageRef } from "./page-ref.js";
import type { IllustrateFn } from "./routes/illustration.js";
import type { MeasureFn } from "./routes/measure.js";
import type { RunFn, RunnerOptions } from "./runner.js";
import type { ScoutFn } from "./scout-jobs.js";

export interface TempStore {
  /** The temporary folder, holding `runs/` and `wayford.sqlite`. */
  dir: string;
  /** `<dir>/runs`, created empty. */
  runsDir: string;
  /** `<dir>/wayford.sqlite`, migrated and open. */
  db: Db;
  /** Closes the database, then removes the folder. */
  close(): Promise<void>;
}

/** A migrated database and an empty runs folder, in a new folder under the OS's temporary one. */
export async function tempStore(): Promise<TempStore> {
  const dir = await mkdtemp(join(tmpdir(), "wayford-io-"));
  const runsDir = join(dir, "runs");
  await mkdir(runsDir);
  const url = `file:${join(dir, "wayford.sqlite")}`;
  migrateDatabase(url);
  const db = openDatabase(url);
  return {
    dir,
    runsDir,
    db,
    async close() {
      // Closed before the folder goes: Windows will not remove an open database file.
      db.$client.close();
      await rm(dir, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}

/** An Actor backend factory that throws if called, for a slot no run reaches. */
export const noBackend: ActorBackendFactory = () => {
  throw new Error("this io test builds no Actor backend");
};

/** A backend factory naming `modelId`, whose `answer` throws. */
function fakeBackend(modelId: string): ActorBackendFactory {
  return () => ({
    modelId,
    sampling: undefined,
    answer() {
      throw new Error("the fake run asks the Actor nothing");
    },
  });
}

/** The Actor model `fakeBackends.llm` names, and a stored run's by default. */
export const FAKE_LLM_MODEL = "fake-llm";

/** The Actor model `fakeBackends.jev` names, and Jev's model in `analystDefaults`. */
export const FAKE_JEV_MODEL = "fake-jev";

/** One fake factory per backend name, so a test can tell which one a run was handed. */
export const fakeBackends: Readonly<Record<ActorBackendName, ActorBackendFactory>> = {
  llm: fakeBackend(FAKE_LLM_MODEL),
  jev: fakeBackend(FAKE_JEV_MODEL),
};

/**
 * A `MeasureFn` that throws if called: a test that measures says how, as `measure.test.ts` and
 * `measure.browser.test.ts` do.
 */
export const noMeasure: MeasureFn = () => {
  throw new Error("this io test measures no page");
};

/**
 * An `IllustrateFn` that throws if called: a test that takes a picture says how, as
 * `illustration.test.ts` and `illustration.browser.test.ts` do.
 */
export const noIllustration: IllustrateFn = () => {
  throw new Error("this io test takes no picture");
};

/**
 * A `ScoutFn` that throws if called: a test that scouts says how, as `routes/tasks.test.ts` does.
 */
export const noScout: ScoutFn = () => {
  throw new Error("this io test scouts no task");
};

/**
 * An `AxeScanFn` that finds no violation on any page, scanned at a fixed time by a fake axe-core,
 * keyed by the page's URL: a test that needs violations, or a failed scan, says so, as
 * `routes/axe.test.ts` does.
 */
export const noAxeViolations: AxeScanFn = async (page) => ({
  url: page.url,
  scannedAt: "2026-10-06T09:00:00.000Z",
  axeVersion: "fake",
  violations: [],
});

/**
 * An `AxeLookup` that keeps every page it was asked, in order: whole, `onTargetApp` included, in
 * `pages`, and by URL alone in `asked`, read off `pages`.
 */
export type FakeAxe = AxeLookup & { readonly pages: PageRef[]; readonly asked: string[] };

/**
 * An `AxeLookup` for the Analyst's tests, with no store and no scanner, reading each page by its
 * whole URL: a URL in `failures` rejects with its error, one of `scans` answers with that scan,
 * and any other page finds no violation, as `noAxeViolations` scans it.
 */
export function fakeAxe(
  scans: readonly AxeScan[] = [],
  failures: Readonly<Record<string, Error>> = {},
): FakeAxe {
  const pages: PageRef[] = [];
  const lookup: AxeLookup = async (page) => {
    pages.push(page);
    const failure = failures[page.url];
    if (failure !== undefined) throw failure;
    return scans.find((scan) => scan.url === page.url) ?? noAxeViolations(page);
  };
  // A getter, not `Object.assign`, which would copy the URLs once.
  return Object.defineProperties(lookup, {
    pages: { value: pages },
    asked: { get: () => pages.map((page) => page.url) },
  }) as FakeAxe;
}

/** A logger that writes nothing. */
export const quiet = pino({ level: "silent" });

/** A logger that keeps every warning, parsed, in order. */
export function capture() {
  const lines: Record<string, unknown>[] = [];
  const logger = pino(
    { level: "warn" },
    { write: (line: string) => void lines.push(JSON.parse(line)) },
  );
  return { lines, logger };
}

/**
 * To the end of the test, a module imported afresh reads every file with `readFileSync` as a clone
 * checked out before `.gitattributes` holds it (`core.autocrlf`), each LF as CRLF, whatever this
 * checkout holds: no checkout holds CRLF any more, CI's included. Import the module under test with
 * `await import(...)` after the call.
 */
export function crlfCheckout(): void {
  vi.resetModules();
  vi.doMock("node:fs", async (importOriginal) => {
    const fs = await importOriginal<typeof import("node:fs")>();
    const readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
      const read = fs.readFileSync(...args);
      return typeof read === "string" ? read.replace(/\r?\n/g, "\r\n") : read;
    }) as typeof fs.readFileSync;
    // The default export too, so `import fs from "node:fs"` reads with CRLF as well.
    const crlf = { ...fs, readFileSync };
    return { ...crlf, default: crlf };
  });
  onTestFinished(() => {
    vi.doUnmock("node:fs");
    vi.resetModules();
  });
}

/** The target app's origin in io's tests: the one the core task fixtures start on. */
const FIXTURE_ORIGIN = "http://localhost:5174";

/**
 * The runner's options on `store`, with nothing real behind them: `fakeRun()`, `fakeBackends` with
 * `llm` the default, the target app on the core task fixtures' origin with its defaults and jargon
 * list, `groundTruthDir(store)` and `quiet`. A test that serves the app on a free port passes its
 * origin.
 */
export function runnerDefaults(store: TempStore): RunnerOptions {
  return {
    db: store.db,
    run: fakeRun(),
    backends: fakeBackends,
    defaultBackend: "llm",
    targetAppOrigin: FIXTURE_ORIGIN,
    params: TARGET_APP_DEFAULTS,
    jargon: targetAppJargon,
    runsDir: store.runsDir,
    groundTruthDir: groundTruthDir(store),
    logger: quiet,
  };
}

/**
 * The Analyst's options on `store`, with nothing behind them: no route table for any task,
 * `groundTruthDir(store)`, `FAKE_JEV_MODEL` as Jev's model, the one `fakeBackends.jev` names, and
 * the target app on the origin `runnerDefaults` has, the one the core task fixtures start on.
 */
export function analystDefaults(
  store: TempStore,
): Pick<AppOptions, "routes" | "groundTruthDir" | "jevModel" | "targetAppOrigin"> {
  return {
    routes: async () => undefined,
    groundTruthDir: groundTruthDir(store),
    jevModel: FAKE_JEV_MODEL,
    targetAppOrigin: FIXTURE_ORIGIN,
  };
}

/**
 * `<dir>/ground-truth`, the ground-truth folder of the runner and the Analyst on `store`. Absent
 * until a test writes into it, so no task has a ground truth: no step cap and no Scout line.
 */
function groundTruthDir(store: TempStore): string {
  return join(store.dir, "ground-truth");
}

/** What `testApp` puts in place of its defaults, by key: any option but the store's. */
export type TestAppOptions = Partial<Omit<AppOptions, "db" | "runsDir">>;

/**
 * An app on its own store, as `testApp` returns it. A test lets its runs end before `close`: a run
 * writes into the folder.
 */
export type TestApp = TempStore & { app: ReturnType<typeof createApp> };

/**
 * The whole app on a `tempStore()`, answering `localhost`, the host `app.request` gives a bare
 * path, on `runnerDefaults`, the fake `Llm` with no answers, `noMeasure`, `noIllustration`,
 * `noAxeViolations`, `noScout` and `analystDefaults`. `options` replaces any of them. The fixture
 * replay keeps the route's own pace unless `replaySpacingMs` is given.
 */
export async function testApp(options: TestAppOptions = {}): Promise<TestApp> {
  const store = await tempStore();
  const app = createApp({
    hosts: ["localhost"],
    ...runnerDefaults(store),
    llm: fakeLlm({}),
    measure: noMeasure,
    illustrate: noIllustration,
    scanAxe: noAxeViolations,
    scout: noScout,
    ...analystDefaults(store),
    ...options,
  });
  return { ...store, app };
}

type App = TestApp["app"];

/** `POST` `body` as JSON to `path`: the status and the parsed answer. */
export async function postJson(app: App, path: string, body: unknown) {
  const res = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

/** `GET` a JSON route: the status and the parsed answer. */
export async function getJson(app: App, path: string) {
  const res = await app.request(path);
  return { status: res.status, body: await res.json() };
}

/**
 * `GET` a route that answers bytes, such as `/illustration`'s PNG: the status, the content type
 * and the body as bytes.
 */
export async function getBytes(app: App, path: string) {
  const res = await app.request(path);
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    bytes: new Uint8Array(await res.arrayBuffer()),
  };
}

type RunOptions = Parameters<RunFn>[0];

/**
 * What one fake run does, picked per run from its options. `{}` is a run that starts, writes a
 * video and a trace, and finishes `success` with no step.
 */
export interface FakeScript {
  /**
   * Throws a `fake_crash` before `runStarted`, or in place of the terminal event, after the step
   * and the gate.
   */
  throws?: "beforeStart" | "afterStart";
  /** Awaited after `runStarted` and the step, so a test holds the run open. */
  gate?: Promise<void>;
  /**
   * One step 0 on `observationFixture`: a scroll down that lands, billed `FAKE_STEP_COST`, with a
   * screenshot.
   */
  step?: boolean;
  /** `runFinished` with this outcome, `success` when absent, or `runFailed` with this error. */
  end?: { outcome: FinishedOutcome } | { failed: string };
  /**
   * The video path the terminal event names. Absent, the fake writes `<stem>.webm` and names it; a
   * string is named as given and nothing is written; `null` names none. The trace is always
   * written and named, as `<stem>.trace.zip`.
   */
  videoPath?: string | null;
}

/** A promise for `FakeScript.gate`, and the function that opens it, so the run goes on. */
export function gate() {
  let open = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** A `RunFn` that keeps the options of every call, in call order. */
export type FakeRun = RunFn & { readonly calls: RunOptions[] };

/** What the fake's one step bills: not zero, so a summed cost is seen to include it. */
export const FAKE_STEP_COST: Cost = { tokensIn: 100, tokensOut: 10, usd: 0.25 };

const NO_COST: Cost = { tokensIn: 0, tokensOut: 0, usd: 0 };
const SCROLL_DOWN: Action = { type: "scroll", direction: "down" };

/**
 * A `RunFn` behind `runActor`'s interface, minus the browser: it emits a real `runStarted` built
 * from its options, then what `script` asks for, every event passing `RunEvent` and handed to
 * `onEvent` synchronously, as `runActor` hands them. It returns the fold of the events it emitted.
 * Its files go under `<runsDir>/<runId>/`, named `<label>-seed<seed>-<runId>…` as
 * `run-context.ts` names a real run's, each holding its own name as its bytes so a test can tell
 * them apart.
 */
export function fakeRun(script: (options: RunOptions) => FakeScript = () => ({})): FakeRun {
  const calls: RunOptions[] = [];
  const run = async (options: RunOptions): Promise<RunResult> => {
    calls.push(options);
    const plan = script(options);
    if (plan.throws === "beforeStart") throw crash();

    const { profile, task, seed, params } = options;
    const runId = options.runId ?? newId("run");
    // Built as `runActor` builds it, so `modelIds.actor` names the factory the runner handed on.
    const backend = options.backend({
      logger: options.logger.child({ runId }),
      providerSeed: providerSeedFor(seed),
      decisionDraw: decisionDrawFor(seed),
    });
    const runDir = join(options.runsDir, runId);
    const stem = `${profile.label.toLowerCase()}-seed${seed}-${runId}`;
    const events: RunEvent[] = [];
    const emit = (event: RunEvent): void => {
      const parsed = RunEvent.parse(event);
      events.push(parsed);
      options.onEvent?.(parsed);
    };
    const write = async (name: string): Promise<string> => {
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, name), name);
      return name;
    };
    const t0 = Date.now();

    emit({
      type: "runStarted",
      runId,
      stepIndex: 0,
      timestamp: new Date(t0).toISOString(),
      taskId: task.id,
      profileId: profile.id,
      seed,
      startUrl: startUrlFor(task, params),
      modelIds: { actor: backend.modelId },
      ...(options.sweep === undefined ? {} : { sweep: options.sweep }),
    });
    let cost = NO_COST;
    if (plan.step === true) {
      const observation = { ...observationFixture, stepIndex: 0 };
      emit({ type: "stepObserved", runId, stepIndex: 0, timestamp: now(), observation });
      emit({
        type: "actionPlanned",
        runId,
        stepIndex: 0,
        timestamp: now(),
        proposedAction: SCROLL_DOWN,
        performedAction: SCROLL_DOWN,
        dice: [],
        cost: FAKE_STEP_COST,
      });
      cost = FAKE_STEP_COST;
      const screenshotPath = await write(`${stem}-step-0.png`);
      emit({
        type: "actionPerformed",
        runId,
        stepIndex: 0,
        timestamp: now(),
        urlAfter: observation.url,
        screenshotPath,
      });
    }
    await plan.gate;
    if (plan.throws === "afterStart") throw crash();

    const videoPath = plan.videoPath === undefined ? await write(`${stem}.webm`) : plan.videoPath;
    const tracePath = await write(`${stem}.trace.zip`);
    const end = {
      runId,
      stepIndex: 0,
      timestamp: now(),
      durationMs: Math.max(0, Date.now() - t0),
      cost,
      ...(videoPath === null ? {} : { videoPath }),
      tracePath,
    };
    emit(
      plan.end !== undefined && "failed" in plan.end
        ? { type: "runFailed", error: plan.end.failed, ...end }
        : { type: "runFinished", outcome: plan.end?.outcome ?? "success", ...end },
    );
    return runResultFromEvents(events);
  };
  return Object.assign(run, { calls });
}

function crash(): WayfordError {
  return new WayfordError("fake_crash", "the fake run crashed");
}

function now(): string {
  return new Date().toISOString();
}

/** One server-sent event as `readSse` read it, stamped with the time it arrived. */
export type SseMessage = { event?: string; id?: string; data: string; receivedAt: number };

function parseMessage(block: string, receivedAt: number): SseMessage {
  const message: SseMessage = { data: "", receivedAt };
  const data: string[] = [];
  for (const line of block.split("\n")) {
    const colon = line.indexOf(":");
    const field = line.slice(0, colon);
    const value = line.slice(colon + 1).replace(/^ /, "");
    if (field === "data") data.push(value);
    if (field === "event") message.event = value;
    if (field === "id") message.id = value;
  }
  message.data = data.join("\n");
  return message;
}

/**
 * Read an SSE body message by message, stamping each with the time it arrived, until the stream
 * ends or `limit` messages have arrived. Then the reader is cancelled, as a client that goes away.
 */
export async function readSse(response: Response, limit = Number.POSITIVE_INFINITY) {
  if (!response.body) throw new Error("the response has no body");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const messages: SseMessage[] = [];
  let buffer = "";
  while (messages.length < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    for (;;) {
      const end = buffer.indexOf("\n\n");
      if (end === -1) break;
      messages.push(parseMessage(buffer.slice(0, end), performance.now()));
      buffer = buffer.slice(end + 2);
    }
  }
  await reader.cancel();
  return messages;
}

/**
 * `readSse` to the stream's end, with each message's `data` parsed as a `RunEvent`: the messages
 * as read, and the events they hold.
 */
export async function readEvents(response: Response) {
  const messages = await readSse(response);
  return { messages, events: messages.map(({ data }) => RunEvent.parse(JSON.parse(data))) };
}

/** What `storedRun` builds a run from. Only the persona, the seed and the steps are required. */
interface StoredRunOptions {
  profile: Profile;
  seed: Seed;
  /** `task_past-order`, the hard goal, when absent. */
  task?: Task;
  /** One step each, in order. Each observation is stored with its own index set. */
  steps: { observation: FullObservation; narration?: string }[];
  /** `gave_up` when absent. */
  outcome?: FinishedOutcome;
  /** The Actor's model id, `modelIds.actor`: `FAKE_LLM_MODEL` when absent. */
  modelId?: string;
  sweep?: RunSweep;
  /** A new run id when absent. */
  runId?: RunId;
  /** One second per step when absent, as the events are stamped. */
  durationMs?: number;
  /**
   * The run's simulated time (B3), all of it on the last step's `actionPlanned`, so the fold sums
   * it back. None when absent, as on a run stored before s2-09.
   */
  simulatedMs?: number;
}

/** When every `storedRun` starts: its events are stamped one second per step from here. */
const STORED_RUN_START = Date.parse("2026-10-05T12:00:00.000Z");

/**
 * A stored fake run, for the Analyst's tests: the events a run of `options` would emit, folded
 * with `runResultFromEvents`, so the run is exactly what the store would hold. No browser and no
 * model: each step is the observation given, a `scroll` down that lands on the next step's page
 * (or stays), its narration when given, and nothing billed. A test passes observations from
 * `perceive`, so the evidence checks read the decisions a real run of that persona and seed got.
 * The run starts on the target app's defaults and ends `runFinished` with `outcome`.
 */
export function storedRun(options: StoredRunOptions): RunResult {
  const { profile, seed, steps, simulatedMs } = options;
  const task = options.task ?? taskFixture("task_past-order");
  const runId = options.runId ?? newId("run");
  const at = (second: number) => new Date(STORED_RUN_START + second * 1000).toISOString();
  const stepMs = (stepIndex: number) =>
    simulatedMs === undefined || stepIndex !== steps.length - 1 ? {} : { simulatedMs };
  const events: RunEvent[] = [
    {
      type: "runStarted",
      runId,
      stepIndex: 0,
      timestamp: at(0),
      taskId: task.id,
      profileId: profile.id,
      seed,
      startUrl: startUrlFor(task, TARGET_APP_DEFAULTS),
      modelIds: { actor: options.modelId ?? FAKE_LLM_MODEL },
      ...(options.sweep === undefined ? {} : { sweep: options.sweep }),
    },
  ];
  steps.forEach(({ observation, narration }, stepIndex) => {
    const timestamp = at(stepIndex);
    const base = { runId, stepIndex, timestamp };
    events.push({ ...base, type: "stepObserved", observation: { ...observation, stepIndex } });
    // Before the action is planned, as the Actor loop emits it.
    if (narration !== undefined) events.push({ ...base, type: "narration", text: narration });
    events.push({
      ...base,
      type: "actionPlanned",
      proposedAction: SCROLL_DOWN,
      performedAction: SCROLL_DOWN,
      dice: [],
      cost: NO_COST,
      ...stepMs(stepIndex),
    });
    const urlAfter = steps[stepIndex + 1]?.observation.url ?? observation.url;
    events.push({ ...base, type: "actionPerformed", urlAfter });
  });
  events.push({
    type: "runFinished",
    runId,
    stepIndex: steps.length,
    timestamp: at(steps.length),
    outcome: options.outcome ?? "gave_up",
    durationMs: options.durationMs ?? steps.length * 1000,
    cost: NO_COST,
  });
  return runResultFromEvents(events);
}

const vera = profileFixture("prof_vera");

/**
 * The target app's `/deliveries` as the filter gives it to Vera at `seed`, with the app's jargon:
 * the observation a run of hers on that seed got there, for the Analyst's tests to store.
 */
export function deliveries(seed: Seed): FullObservation {
  return perceive(measurementFixture, vera, seed, { jargon: targetAppJargon });
}

/** The page's "Order archive" link, the last step of route A. Throws when the page has none. */
export function archiveLink(observation: FullObservation): ObservedElement {
  const link = observation.elements.find((e) => e.role === "link" && e.name === "Order archive");
  if (link === undefined) throw new Error("the page holds no Order archive link");
  return link;
}

/**
 * The first of run seeds 1 to 30 for which `holds` is true, such as a seed where P1 cuts the
 * archive link: read off the filter, never guessed. Throws when none is.
 */
export function firstSeed(holds: (seed: Seed) => boolean): Seed {
  for (let seed = 1; seed <= 30; seed += 1) {
    if (holds(seed)) return seed;
  }
  throw new Error("seeds 1 to 30 hold no seed the test needs");
}

/** The paragraph `anyPage` sets at #aaa on white, about 2.3:1, when it is faint. */
export const FAINT_TEXT = "This paragraph is set at a low contrast.";

/**
 * A page as a real site may serve it: a stylesheet link and a font face the server answers 404,
 * text in that face, so the face is asked for and fails, and an animation that never ends. Its
 * paragraph, `FAINT_TEXT`, is at #aaa on white when `faint`, axe-core's `color-contrast`, and black
 * otherwise. No finite animation: this machine's headless Chromium draws no animation frames, so
 * one would never finish, while an endless one is set aside without waiting.
 */
export function anyPage(faint: boolean): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Any page</title>
    <link rel="stylesheet" href="/missing.css" />
    <style>
      @font-face {
        font-family: "Missing Face";
        src: url("/missing.woff2") format("woff2");
      }
      body { background: #fff; color: #000; font-family: sans-serif; }
      .faint { color: ${faint ? "#aaa" : "#000"}; }
      .missing { font-family: "Missing Face", sans-serif; }
      .spinner { width: 24px; height: 24px; background: #333; animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <main>
      <h1>Any page</h1>
      <p class="faint">${FAINT_TEXT}</p>
      <p class="missing">This line asks for a font the server does not have.</p>
      <div class="spinner"></div>
    </main>
  </body>
</html>`;
}

/**
 * A page whose one fault is a font face the server answers 404, used by its only text: the strict
 * load refuses it as `font_failed`, the lenient one sets the face aside. No animation, since the
 * strict load waits on one before it checks the fonts.
 */
export const FAILED_FONT_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <title>Failed font</title>
    <style>
      @font-face { font-family: "Missing Face"; src: url("/missing.woff2") format("woff2"); }
      p { font-family: "Missing Face", sans-serif; }
    </style>
  </head>
  <body><p>This line asks for a font the server does not have.</p></body>
</html>`;

/** A Node HTTP server of a test's, and the origin it listens on. */
export interface LocalServer {
  server: Server;
  /** `http://127.0.0.1:<port>`. */
  origin: string;
}

/** A server on `127.0.0.1` and a free port, answering with `handle`. */
export async function serveLocal(handle: RequestListener): Promise<LocalServer> {
  const server = createServer(handle);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${port}` };
}

/** `serveLocal` with `/page` answering `html`, and every other path a 404. */
export function servePage(html: string): Promise<LocalServer> {
  return serveLocal((req, res) => {
    if (req.url === "/page") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
}

/** Stops `local`'s server, its open connections first. */
export async function stopLocal(local: LocalServer): Promise<void> {
  local.server.closeAllConnections();
  await new Promise((resolve) => local.server.close(resolve));
}
