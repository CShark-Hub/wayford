/**
 * Test support for io's own tests, never exported from the barrel
 * (`docs/specs/2026-10-02-s4-03-runs-api.md`, "test-app.ts"): `testApp`, the whole app on a store
 * in a temporary folder, and `runnerDefaults`, what it runs on; `postJson` and `getJson`, one
 * request each; `fakeRun`, a `RunFn` scripted per run, so no io test needs a browser or a model,
 * and `gate`, which holds one open; and `readSse` and `readEvents`, which read a server-sent event
 * stream message by message. io's test files share it, as agent's callers share `fake-llm.ts`.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ActorBackendFactory, startUrlFor, TARGET_APP_DEFAULTS } from "@wayford/agent";
import { fakeLlm } from "@wayford/agent/fake";
import {
  type Action,
  type Cost,
  type FinishedOutcome,
  newId,
  RunEvent,
  type RunResult,
  runResultFromEvents,
  WayfordError,
} from "@wayford/core";
import { observationFixture } from "@wayford/core/fixtures";
import pino from "pino";
import { type AppOptions, createApp } from "./app.js";
import { type Db, migrateDatabase, openDatabase } from "./db/database.js";
import type { MeasureFn } from "./routes/measure.js";
import type { RunFn, RunnerOptions } from "./runner.js";

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

/**
 * An Actor backend factory that throws if called: no io test builds a backend. The fake run builds
 * none, and `runActor` refuses a step cap of 0 before it would.
 */
export const noBackend: ActorBackendFactory = () => {
  throw new Error("no io test builds an Actor backend");
};

/**
 * A `MeasureFn` that throws if called: a test that measures says how, as `measure.test.ts` and
 * `measure.browser.test.ts` do.
 */
export const noMeasure: MeasureFn = () => {
  throw new Error("this io test measures no page");
};

/** A logger that writes nothing. */
export const quiet = pino({ level: "silent" });

/**
 * The runner's options on `store`, with nothing real behind them: `fakeRun()`, `noBackend`, the
 * target app's defaults and `quiet`.
 */
export function runnerDefaults(store: TempStore): RunnerOptions {
  return {
    db: store.db,
    run: fakeRun(),
    actor: noBackend,
    params: TARGET_APP_DEFAULTS,
    runsDir: store.runsDir,
    logger: quiet,
  };
}

/** What `testApp` puts in place of its defaults, by key: any option but the store's. */
export type TestAppOptions = Partial<Omit<AppOptions, "db" | "runsDir">>;

/**
 * An app on its own store, as `testApp` returns it. A test lets its runs end before `close`: a run
 * writes into the folder.
 */
export type TestApp = TempStore & { app: ReturnType<typeof createApp> };

/**
 * The whole app on a `tempStore()`, on `runnerDefaults`, the fake `Llm` with no answers and
 * `noMeasure`. `options` replaces any of them. The fixture replay keeps the route's own pace unless
 * `replaySpacingMs` is given.
 */
export async function testApp(options: TestAppOptions = {}): Promise<TestApp> {
  const store = await tempStore();
  const app = createApp({
    ...runnerDefaults(store),
    llm: fakeLlm({}),
    measure: noMeasure,
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
      modelIds: { actor: "fake" },
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
