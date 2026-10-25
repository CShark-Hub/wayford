/**
 * `/runs`: start a run set, follow each run live, and read back what was stored
 * (`docs/specs/2026-10-02-s4-03-runs-api.md`, "routes/runs.ts"). The runner runs the jobs; this
 * file validates at the edge, looks the inputs up, and serves what the runner and the database
 * hold.
 *
 * - `POST /`: a `RunsRequest`. 202 `{ raceId, runs }`, one `StartedRun` per seed × persona,
 *   seed-major, every run on the Actor backend the request names, or the runner's default; the
 *   set is stored as a race under `raceId` (`routes/races.ts`).
 *   400 `{ error }` for a body that is not a `RunsRequest`; 404 `{ error }` naming every unknown
 *   task and profile id; 415 from `createApp` for a body that is not `application/json`, and 413
 *   for one over `MAX_BODY_BYTES`; 422 `{ error }` naming `docs/adr/0003-any-target.md` D9 for
 *   Jev, named or the default, on a task off the target app. On a 400, 404, 413, 415 or 422 no run
 *   starts.
 * - `GET /`: every stored run matching the query's `taskId`, `profileId` and `outcome`, newest
 *   first, as `RunResult[]`. A sweep's runs are listed only under `?sweepId=`, never with the
 *   persona's own. Any other key is a 400, so a misspelt filter never lists every run.
 * - `GET /:id`: the stored `RunResult`, or 404. A run in flight is a 404 until it is stored.
 * - `GET /:id/events`: the run's `RunEvent`s as server-sent events (below), or 404 for a run this
 *   process has not started.
 * - `GET /:id/video`, `GET /:id/trace`, `GET /:id/steps/:index/screenshot`: the run's files, each
 *   as a download under its own name, which names persona, seed and run id (F12 AC3).
 *
 * The SSE framing is m0-07's, which the ring and the dashboard are built against:
 *
 * - `event:` is the `RunEvent` type, `data:` the whole event as JSON.
 * - `id:` is the event's index in its run. A reconnecting `EventSource` sends the last one it saw
 *   as `Last-Event-ID` and the stream resumes after it.
 * - A client that has already seen the last event of an ended run gets 204, which tells
 *   `EventSource` to stop reconnecting.
 *
 * A run's stream sends what the run has published so far, then each event as it is published, and
 * closes after the terminal event, which the runner publishes only once it has tried to store the
 * run. A client that disconnects ends its own stream, never the run. The core fixture run is still replayed under
 * the id `fixture`, at a pace a person can watch, for the web's events screen.
 *
 * A stored file path is data read back from the database, so a file is served only from inside its
 * run's own folder (`runFilePath`), and only when it is a file. Anything else is a 404.
 */
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { zValidator } from "@hono/zod-validator";
import type { ActorBackendName } from "@wayford/agent";
import {
  MAX_RUN_SET_SEEDS,
  newId,
  ProfileId,
  type Race,
  type RunEvent,
  RunOutcome,
  Seed,
  type StartedRun,
  SweepId,
  TaskId,
  WayfordError,
} from "@wayford/core";
import { profileFixtures, runEventFixtures } from "@wayford/core/fixtures";
import { type Context, Hono } from "hono";
import { type SSEMessage, type SSEStreamingApi, streamSSE } from "hono/streaming";
import { z } from "zod";
import type { Db } from "../db/database.js";
import { saveRace } from "../db/races.js";
import { listRuns, loadRun } from "../db/runs.js";
import { loadTask } from "../db/tasks.js";
import { attachment, runFilePath } from "../run-files.js";
import type { LiveRun, Runner } from "../runner.js";

const unique = (items: readonly unknown[]) => new Set(items).size === items.length;

/**
 * Agent's `ActorBackendName`, spelt from its type: its value would load agent's runtime into io's
 * barrel (s4-03, "The barrel"). A name added to or dropped from agent's fails to compile here.
 */
const ActorBackend = z.enum({ llm: "llm", jev: "jev" } satisfies Record<
  ActorBackendName,
  ActorBackendName
>);

/**
 * The body of `POST /runs`, built from core's schemas. Every persona runs on every seed (A20), so
 * a repeated seed or persona would run one persona twice on the same dice.
 */
const RunsRequest = z
  .object({
    taskId: TaskId,
    profileIds: z
      .array(ProfileId)
      .min(1)
      .refine(unique, "each profile id at most once: a run set runs a persona once per seed"),
    seeds: z
      .array(Seed)
      .min(1)
      // The seed set the project quotes ("10 seeds → 3/10 success", `AGENTS.md`), so a typo of a
      // thousand seeds bills nothing.
      .max(MAX_RUN_SET_SEEDS)
      .refine(unique, "each seed at most once: a run set runs a persona once per seed"),
    backend: ActorBackend.exactOptional(),
  })
  .strict();

/** The query of `GET /runs`: what `listRuns` narrows by, each key at most once. */
const RunsQuery = z
  .object({
    taskId: TaskId.exactOptional(),
    profileId: ProfileId.exactOptional(),
    outcome: RunOutcome.exactOptional(),
    sweepId: SweepId.exactOptional(),
  })
  .strict();

/** What the runs routes read: the database, the app's one runner, and where run files are. */
type RunsRouteOptions = {
  db: Db;
  /** Shared by every request, so its five slots bound the whole app. */
  runner: Runner;
  /** Absolute. Each run's files are under `<runsDir>/<runId>/`. */
  runsDir: string;
  /** Pause between two replayed events of the fixture run. */
  replaySpacingMs?: number;
};

/** By id. A Map, not an object literal, so `constructor` or `__proto__` is no persona. */
const PROFILES = new Map(profileFixtures.map((profile) => [profile.id, profile]));

/** The id the core fixture run is replayed under: no `RunId`, so no real run can take it. */
const FIXTURE_RUN = "fixture";

/** One past the index the client last saw, or 0 when it saw none. */
function resumeIndex(lastEventId: string | undefined): number {
  return lastEventId !== undefined && /^\d+$/.test(lastEventId) ? Number(lastEventId) + 1 : 0;
}

/** The event at `index` in its run, as one SSE message. */
function message(event: RunEvent, index: number): SSEMessage {
  return { id: String(index), event: event.type, data: JSON.stringify(event) };
}

/** The routes above. Nothing here runs a run: `POST /` hands the set to the runner and answers. */
export function runsRoute({ db, runner, runsDir, replaySpacingMs = 300 }: RunsRouteOptions) {
  return new Hono()
    .post(
      "/",
      zValidator("json", RunsRequest, (result, c) => {
        if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
      }),
      async (c) => {
        // What is left after the task, personas and seeds applies to the whole set: `backend`.
        const { taskId, profileIds, seeds, ...set } = c.req.valid("json");
        const task = await loadTask(db, taskId);
        const unknown = profileIds.filter((id) => !PROFILES.has(id));
        if (task === undefined || unknown.length > 0) {
          const missing = [
            ...(task === undefined ? [`task ${taskId}`] : []),
            ...unknown.map((id) => `profile ${id}`),
          ];
          return c.json({ error: `no ${missing.join(", no ")}` }, 404);
        }
        // In request order, which the runner keeps within each seed.
        const profiles = profileIds.flatMap((id) => PROFILES.get(id) ?? []);
        let runs: StartedRun[];
        try {
          runs = runner.start(task, profiles, seeds, set);
        } catch (error) {
          // The body is valid, but the runner refuses what it asks for, before it starts anything.
          if (error instanceof WayfordError && error.code === "jev_off_target_app") {
            return c.json({ error: error.message }, 422);
          }
          throw error;
        }
        // Stored once the runner has minted the run ids; `new Date()` is a timestamp, never a
        // decision. A save that throws is a 500, and the runs are queued by then: they run, and
        // are stored as ordinary runs in no race.
        const race: Race = { id: newId("race"), task, startedAt: new Date().toISOString(), runs };
        await saveRace(db, race);
        return c.json({ raceId: race.id, runs }, 202);
      },
    )
    .get(
      "/",
      zValidator("query", RunsQuery, (result, c) => {
        if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
      }),
      async (c) => c.json(await listRuns(db, c.req.valid("query"))),
    )
    .get("/:id", async (c) => {
      const id = c.req.param("id");
      const run = await loadRun(db, id);
      return run === undefined ? c.json({ error: `no stored run ${id}` }, 404) : c.json(run);
    })
    .get("/:id/events", (c) => {
      const id = c.req.param("id");
      const start = resumeIndex(c.req.header("Last-Event-ID"));
      if (id === FIXTURE_RUN) return replayFixture(c, start, replaySpacingMs);

      const live = runner.live(id);
      if (live === undefined) return c.json({ error: `no run ${id} in this process` }, 404);
      if (live.ended && start >= live.events.length) return c.body(null, 204);
      return streamSSE(c, (stream) => follow(stream, live, start));
    })
    .get("/:id/video", async (c) => {
      const id = c.req.param("id");
      const run = await loadRun(db, id);
      return sendRunFile(c, runsDir, id, run?.videoPath, "video/webm", "video");
    })
    .get("/:id/trace", async (c) => {
      const id = c.req.param("id");
      const run = await loadRun(db, id);
      return sendRunFile(c, runsDir, id, run?.tracePath, "application/zip", "trace");
    })
    .get("/:id/steps/:index/screenshot", async (c) => {
      const { id, index } = c.req.param();
      const stored = /^\d+$/.test(index)
        ? await screenshotPath(db, runner, id, Number(index))
        : undefined;
      return sendRunFile(c, runsDir, id, stored, "image/png", `screenshot of step ${index}`);
    });
}

/** m0-07's replay of the core fixture run, `spacingMs` between two events. */
function replayFixture(c: Context, start: number, spacingMs: number) {
  if (start >= runEventFixtures.length) return c.body(null, 204);
  return streamSSE(c, async (stream) => {
    for (let index = start; index < runEventFixtures.length && !stream.aborted; index++) {
      const event = runEventFixtures[index] as RunEvent;
      if (index > start) await stream.sleep(spacingMs);
      await stream.writeSSE(message(event, index));
    }
  });
}

/**
 * Writes the live run's events from index `from` on, each as it is published, and returns after
 * the terminal event, when the run has ended without one, or once the client has gone. The run
 * never waits on a stream: the runner publishes whether anyone reads.
 */
async function follow(stream: SSEStreamingApi, live: LiveRun, from: number): Promise<void> {
  const gone = new Promise<void>((resolve) => stream.onAbort(() => resolve()));
  let index = from;
  while (!stream.aborted) {
    const event = live.events[index];
    if (event !== undefined) {
      await stream.writeSSE(message(event, index));
      index++;
    } else if (live.ended) {
      // `end` publishes the terminal event and ends the run at once, so nothing follows it.
      return;
    } else {
      await Promise.race([live.changed(), gone]);
    }
  }
}

/**
 * Step `stepIndex`'s `screenshotPath`: from the live run's `actionPerformed` while the run is in
 * flight, so the ring shows each run's latest screenshot during the run (s3-03), and from the
 * stored run once it has ended. A wasted step has none.
 */
async function screenshotPath(
  db: Db,
  runner: Runner,
  id: string,
  stepIndex: number,
): Promise<string | undefined> {
  const live = runner.live(id);
  if (live !== undefined && !live.ended) {
    for (const event of live.events) {
      if (event.type === "actionPerformed" && event.stepIndex === stepIndex) {
        return event.screenshotPath;
      }
    }
    return undefined;
  }
  const run = await loadRun(db, id);
  return run?.steps.find((step) => step.stepIndex === stepIndex)?.screenshotPath;
}

/**
 * The file a run stored as `stored`, resolved inside `<runsDir>/<runId>/`, as a download of type
 * `type` under the file's own name. A 404 when there is no path, the run id is no `RunId`, the
 * path lands outside the run's folder, or no file is there.
 */
async function sendRunFile(
  c: Context,
  runsDir: string,
  runId: string,
  stored: string | undefined,
  type: string,
  what: string,
) {
  const path = stored === undefined ? undefined : runFilePath(runsDir, runId, stored);
  const bytes = path === undefined ? undefined : await readRegularFile(path);
  if (path === undefined || bytes === undefined) {
    return c.json({ error: `no ${what} for run ${runId}` }, 404);
  }
  return c.body(bytes, 200, {
    "Content-Type": type,
    "Content-Disposition": attachment(basename(path)),
  });
}

/**
 * The bytes of the file at `path`, or `undefined` when nothing is there or it is no regular file.
 * Any other failure, such as a file io may not read, is a fault of the server, not a missing file,
 * so it is thrown and answered 500.
 */
async function readRegularFile(path: string) {
  try {
    return (await stat(path)).isFile() ? await readFile(path) : undefined;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw error;
  }
}
