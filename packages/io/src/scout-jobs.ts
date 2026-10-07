/**
 * Scout jobs (s4-10): one Scout per task at a time, in this process's memory, so a second
 * `POST /tasks/:id/scout` while one runs gets the running one back
 * (`docs/specs/2026-10-07-s4-10-scout-sweep-any-task.md`, "io: scout-jobs.ts"). A finished Scout
 * leaves no job: its ground-truth file answers from then on, whoever wrote it.
 *
 * Agent is imported as types only and the Scout function is handed in, as `measure` is, so loading
 * this loads neither agent's runtime nor Playwright (s4-03, "The barrel").
 */
import type { TargetAppParams } from "@wayford/agent";
import type { GroundTruth, Task, TaskId } from "@wayford/core";
import type { Logger } from "pino";
import { failureText, onTargetApp } from "./runner.js";

/**
 * Scouts `task`, with the target app's parameters when it is on the app, and writes
 * `<dir>/<task id>.json`.
 */
export type ScoutFn = (options: {
  task: Task;
  params: TargetAppParams | undefined;
  dir: string;
}) => Promise<GroundTruth>;

export type ScoutJob =
  | { taskId: TaskId; status: "running" }
  | { taskId: TaskId; status: "failed"; error: string };

export interface ScoutJobs {
  /** Starts Scout on `task`, or returns the one already running. Never rejects. */
  start(task: Task): ScoutJob & { status: "running" };
  /**
   * The job this process last started on `taskId`, while it runs or after it failed; else
   * undefined.
   */
  job(taskId: TaskId): ScoutJob | undefined;
}

/**
 * The jobs over `scout`. Every Scout writes to `groundTruthDir`, the folder the routes and the
 * report read, so one setting names it. Parameters go only to a task on the target app at
 * `targetAppOrigin`, as the runner decides (ADR 0003, D2).
 */
export function createScoutJobs(options: {
  scout: ScoutFn;
  targetAppOrigin: string;
  params: TargetAppParams;
  groundTruthDir: string;
  logger: Logger;
}): ScoutJobs {
  const { scout, targetAppOrigin, params, groundTruthDir, logger } = options;
  const jobs = new Map<TaskId, ScoutJob>();

  /** Runs Scout and settles the job: gone on success, `failed` with its error otherwise. */
  async function walk(task: Task, job: ScoutJob & { status: "running" }): Promise<void> {
    try {
      const onApp = onTargetApp(task, targetAppOrigin);
      await scout({ task, params: onApp ? params : undefined, dir: groundTruthDir });
      jobs.delete(task.id);
    } catch (error) {
      logger.error({ err: error, taskId: task.id }, "Scout failed");
      jobs.set(task.id, { ...job, status: "failed", error: failureText(error) });
    }
  }

  return {
    start(task) {
      const current = jobs.get(task.id);
      if (current?.status === "running") return current;
      const job = { taskId: task.id, status: "running" as const };
      jobs.set(task.id, job);
      void walk(task, job);
      return job;
    },
    job: (taskId) => jobs.get(taskId),
  };
}
