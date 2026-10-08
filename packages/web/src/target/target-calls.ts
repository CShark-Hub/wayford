/**
 * The Target screen's calls to io, as plain functions of what the screen holds and a `dispatch`, so
 * a test drives each with a stubbed `fetch` and a recording dispatch. Each makes or awaits one kind
 * of call, dispatches what io answered and never rejects: a failure is dispatched in the state's words for
 * it. The screen (`screens/target.tsx`) calls them; the reducers (`target-state.ts`) keep every rule
 * about what an answer may change. The report is a mutation instead (`reportMutation`), so the
 * Report screen sees it.
 *
 * Every run and the report are on the LLM, as `runsRequestOf` and `reportMutation` send them
 * (`docs/adr/0003-any-target.md` D9).
 */
import { mutationOptions, type QueryClient } from "@tanstack/react-query";
import type { Profile, RunId, StartedRun, Task, TaskId } from "@wayford/core";
import { analyse, reportQuery } from "../api/reports.js";
import { type Extraction, extractTask, fetchRun, startRuns } from "../api/runs.js";
import type { ScoutAnswer } from "../api/scout.js";
import {
  type FormAction,
  type GoalAction,
  type GoalState,
  type RunSet,
  runsRequestOf,
  type TargetForm,
  taskRequestOf,
} from "./target-state.js";

/** A rejection's message, for the screen's alert lines. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ask io to check the goal `form` holds. The stored task on io's 201, which the screen caches and
 * navigates to; `undefined` on its 422, whose refusal the form then holds, or on a failure, whose
 * message it shows. The form's fields are disabled while it checks, so no answer can arrive for a
 * form edited since.
 */
export async function checkTarget(
  form: TargetForm,
  dispatch: (action: FormAction) => void,
): Promise<Task | undefined> {
  const request = taskRequestOf(form);
  dispatch({ type: "checkStarted" });
  let extraction: Extraction;
  try {
    extraction = await extractTask(request);
  } catch (error) {
    dispatch({ type: "checkFailed", message: messageOf(error) });
    return undefined;
  }
  dispatch({ type: "checkAnswered", extraction });
  return extraction.ok ? extraction.task : undefined;
}

/**
 * `answer`, io's word on Scout from `api/scout.ts`'s `readScout` or `startScout`, dispatched as
 * `scoutRead`. A rejection (io down, the proxy's non-JSON 502, a refused start) is a failed Scout.
 */
export async function dispatchScout(
  answer: Promise<ScoutAnswer>,
  dispatch: (action: GoalAction) => void,
): Promise<void> {
  let scout: ScoutAnswer;
  try {
    scout = await answer;
  } catch (error) {
    scout = { status: "failed", message: messageOf(error) };
  }
  dispatch({ type: "scoutRead", scout });
}

/**
 * Ask io to start the run set `state` describes on `task`: the personas in `profiles`' order, the
 * chosen seeds, on the LLM. The set then runs, or goes back to idle with io's reason.
 */
export async function startRunSet(
  task: Task,
  state: GoalState,
  profiles: readonly Profile[],
  dispatch: (action: GoalAction) => void,
): Promise<void> {
  const request = runsRequestOf(task, state, profiles);
  dispatch({ type: "runsStarting" });
  let runs: StartedRun[];
  try {
    ({ runs } = await startRuns(request));
  } catch (error) {
    dispatch({ type: "runsFailed", message: messageOf(error) });
    return;
  }
  dispatch({ type: "runsStarted", runs });
}

/** One run's poll: whether io has it stored, and the call's message when it rejected. */
type RunPoll = { id: RunId; stored: boolean; error?: string };

/** Ask io for run `id`: stored on any answer but its 404. A call that rejects counts as not. */
async function pollRun(id: RunId): Promise<RunPoll> {
  try {
    return { id, stored: (await fetchRun(id)) !== null };
  } catch (error) {
    return { id, stored: false, error: messageOf(error) };
  }
}

/**
 * One poll of a running set: io asked for each of its runs not yet ended, in parallel, and one
 * `runsPolled` dispatched with those it now has stored. io stores a run when it ends, so stored is
 * ended. A call that rejects (io down, a body that is not a run) leaves its run for the next tick,
 * and its message, the first in the set's order when several reject, is the poll's `error`. A set
 * that is not running is not polled.
 */
export async function pollRunSet(
  runSet: RunSet,
  dispatch: (action: GoalAction) => void,
): Promise<void> {
  if (runSet.status !== "running") return;
  const waiting = runSet.runs.filter((run) => !runSet.ended.includes(run.id));
  const polls = await Promise.all(waiting.map((run) => pollRun(run.id)));
  const ended = polls.filter((poll) => poll.stored).map((poll) => poll.id);
  const error = polls.find((poll) => poll.error !== undefined)?.error;
  dispatch({ type: "runsPolled", ended, ...(error !== undefined && { error }) });
}

/**
 * The Analyst over `taskId`'s stored runs, on the LLM, as a mutation under the key the Report
 * screen gives its own (`screens/report.tsx`): while either runs, `useIsMutating` on that key shows
 * it on both screens and on a later visit to either, so neither offers a second paid call. The
 * report lands in `reportQuery`'s cache, which the goal view's link reads, even once the screen
 * that asked has unmounted.
 */
export function reportMutation(client: QueryClient, taskId: TaskId) {
  return mutationOptions({
    mutationKey: ["analyse", taskId],
    mutationFn: () => analyse(taskId, "llm"),
    onSuccess: (report) => client.setQueryData(reportQuery(report.taskId).queryKey, report),
  });
}
