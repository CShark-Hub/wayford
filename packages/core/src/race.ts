/**
 * A `Race` is the run set one `POST /runs` started (issue #194), stored so the web can reopen it by
 * its URL and list it in the Race's History. It is a record at rest beside the seven contracts, and
 * new, so none of them changes.
 *
 * A race holds no status: whether it still runs is io's runner's to say, at read time, so no restart
 * can leave a race running for good. `RaceStatus` is that answer, as `GET /races` adds it.
 *
 * A stop (#6) is the one thing io writes into a race once it is stored: `cancelled` names the runs
 * it dropped from the queue before they started. Such a run leaves no record of its own, and a
 * restart wipes the runner's memory of it, so only the race can say it was stopped. That is no
 * status either: whether any run still runs is still the runner's to say.
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
 * A stop of the race (#6): `at` is when the stop that dropped runs was confirmed, a timestamp,
 * never a decision; `dequeued` are the runs it dropped from io's queue before they started, in
 * queue order. A run listed here never started and is never stored.
 */
export const RaceCancel = z
  .object({ at: z.iso.datetime(), dequeued: z.array(RunId).min(1) })
  .strict();
export type RaceCancel = z.infer<typeof RaceCancel>;

/**
 * A race: `task` is the whole stored task its runs share, so a race reads without a second lookup;
 * `startedAt` is when io stored it, a timestamp, never a decision; `runs` are the runner's
 * receipts, seed-major; `cancelled` is its stop, absent on a race nobody stopped and on one stored
 * before #6. Every run the stop names is one of `runs`, and named once.
 *
 * That rule is a refine, so `.omit`, `.pick` and `.partial` throw on this schema; `.extend` with
 * new keys still works and keeps it.
 */
export const Race = z
  .object({
    id: RaceId,
    task: Task,
    startedAt: z.iso.datetime(),
    runs: z.array(StartedRun).min(1),
    cancelled: RaceCancel.optional(),
  })
  .strict()
  .superRefine((race, ctx) => {
    const ids = new Set(race.runs.map(({ id }) => id));
    const named = new Set<string>();
    for (const [i, id] of (race.cancelled?.dequeued ?? []).entries()) {
      const path = ["cancelled", "dequeued", i];
      if (!ids.has(id)) {
        ctx.addIssue({ code: "custom", path, message: `${id} is not one of the race's runs` });
      } else if (named.has(id)) {
        ctx.addIssue({ code: "custom", path, message: `${id} is named twice` });
      }
      named.add(id);
    }
  });
export type Race = z.infer<typeof Race>;

/** Whether io's runner still runs any of a race's runs, as `GET /races` reads it. */
export const RaceStatus = z.enum(["running", "finished"]);
export type RaceStatus = z.infer<typeof RaceStatus>;
