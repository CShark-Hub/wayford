/**
 * A `Race` is the run set one `POST /runs` started (issue #194), stored so the web can reopen it by
 * its URL and list it in the Race's History. It is a record at rest beside the seven contracts, and
 * new, so none of them changes.
 *
 * A race holds no status: whether it still runs is io's runner's to say, at read time, so no restart
 * can leave a race running for good. `RaceStatus` is that answer, as `GET /races` adds it.
 */
import { z } from "zod";
import { ProfileId, RaceId, RunId, Seed } from "./primitives.js";
import { Task } from "./task.js";

/**
 * One run of a run set, as io's runner hands it back when it queues the run: a receipt, not a
 * record. A run still waiting for a slot has sent no `runStarted`, so the receipt is what names its
 * persona and seed.
 */
export const StartedRun = z.object({ id: RunId, profileId: ProfileId, seed: Seed }).strict();
export type StartedRun = z.infer<typeof StartedRun>;

/**
 * A race: `task` is the whole stored task its runs share, so a race reads without a second lookup;
 * `startedAt` is when io stored it, a timestamp, never a decision; `runs` are the runner's
 * receipts, seed-major.
 */
export const Race = z
  .object({
    id: RaceId,
    task: Task,
    startedAt: z.iso.datetime(),
    runs: z.array(StartedRun).min(1),
  })
  .strict();
export type Race = z.infer<typeof Race>;

/** Whether io's runner still runs any of a race's runs, as `GET /races` reads it. */
export const RaceStatus = z.enum(["running", "finished"]);
export type RaceStatus = z.infer<typeof RaceStatus>;
