/**
 * The Target screen (`tasks/s3-15-target-screen.md`): a site's start URL, a goal in one sentence
 * and how success is checked go in, io's Extractor checks the goal, and the goal it accepted opens
 * the Lens and the Race and starts Scout, a run set and its report.
 *
 * Two modes, by `?task=`:
 * - none: the form. On io's 201 the task is written into the query cache under its id, then the
 *   URL takes the id, so the goal view draws with no wait and a reload comes back to it.
 * - `task=<id>`: the goal view, drawn only for a task io holds. io stores only a goal its check
 *   accepted, so no refused goal reaches a start.
 *
 * The rules are in `target/target-state.ts`, the calls in `target/target-calls.ts` and the views in
 * `target/target-view.tsx`. This file holds the state, the polling, the report's mutation, the
 * cache and the navigation.
 * The top bar's slot stays empty: the screen shows no measured data to badge, and its run button
 * names the backend.
 */
import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createRoute, Link, useRouter } from "@tanstack/react-router";
import { type Task, TaskId } from "@wayford/core";
import { useEffect, useEffectEvent, useReducer } from "react";
import { z } from "zod";
import { reportQuery } from "../api/reports.js";
import { storedTaskQuery } from "../api/runs.js";
import { readScout, startScout } from "../api/scout.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { Banner } from "../components/banner.js";
import { EmptyState } from "../components/empty-state.js";
import { Skeleton } from "../components/skeleton.js";
import { Button, buttonVariants } from "../components/ui/button.js";
import { rootRoute } from "../shell.js";
import {
  checkTarget,
  dispatchScout,
  pollRunSet,
  reportMutation,
  startRunSet,
} from "../target/target-calls.js";
import {
  formReducer,
  goalReducer,
  initialForm,
  initialGoal,
  isUnderWay,
} from "../target/target-state.js";
import { GoalView, TargetFormView } from "../target/target-view.js";

/** How long after its last read settled Scout is read again, while it runs. */
const SCOUT_POLL_MS = 3000;

/** How long after its last poll settled a running set's runs are asked for again. */
const RUNS_POLL_MS = 2000;

/** The screen's search params: the stored task, once a check accepted it. A broken id is none. */
const TargetSearch = z.object({ task: TaskId.optional().catch(undefined) });

/**
 * While `active`, `tick` once every `intervalMs`, each `intervalMs` after the last one settled, so
 * two never overlap however slow io answers. The first comes `intervalMs` after the poll turns
 * active: what turned it on has just read io. A `setTimeout` chain, stopped when `active` turns
 * false or the view unmounts. An effect event, so each call reads the last render's state, never
 * the state the chain started in.
 */
function usePoll(active: boolean, intervalMs: number, tick: () => Promise<unknown>): void {
  const onTick = useEffectEvent(tick);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = () => {
      timer = setTimeout(() => {
        void onTick().finally(() => {
          if (!stopped) next();
        });
      }, intervalMs);
    };
    next();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, intervalMs]);
}

/**
 * The goal view of `task`, live: Scout read once and then while it runs, the set's runs polled
 * while it runs, and the Analyst asked once each time the set ends. The report is a mutation under
 * the Report screen's key, so a report being written, or the last one's failure, shows here on any
 * visit, and the stored one is read from io for the link, so a reload keeps it. Keyed by task
 * above, so each goal starts from `initialGoal`.
 */
function LiveGoal({ task }: { task: Task }) {
  const client = useQueryClient();
  const [state, dispatch] = useReducer(goalReducer, undefined, initialGoal);
  const report = reportMutation(client, task.id);
  const { mutate } = useMutation(report);
  // This goal's report being written, and how the last one ended: asked here, on an earlier
  // visit, or on the Report screen, all under the one key.
  const writing = useIsMutating({ mutationKey: report.mutationKey }) > 0;
  const failure = useMutationState({
    filters: { mutationKey: report.mutationKey },
    select: (mutation) => mutation.state.error,
  }).at(-1);
  const stored = useQuery(reportQuery(task.id)).data;

  useEffect(() => {
    void dispatchScout(readScout(task.id), dispatch);
  }, [task.id]);

  usePoll(state.scout.status === "running", SCOUT_POLL_MS, () =>
    dispatchScout(readScout(task.id), dispatch),
  );
  usePoll(state.runSet.status === "running", RUNS_POLL_MS, () =>
    pollRunSet(state.runSet, dispatch),
  );

  // Once per set: only a set's end turns the status `ended`, and a mount starts idle, so
  // StrictMode's second run of this effect posts nothing. `mutate` keeps its identity.
  useEffect(() => {
    if (state.runSet.status === "ended") mutate();
  }, [state.runSet.status, mutate]);

  return (
    <GoalView
      task={task}
      state={state}
      report={{
        stored: stored != null,
        writing,
        // A new set under way sets the last failure aside; its own report follows it.
        ...(failure != null && !isUnderWay(state.runSet.status) && { error: failure.message }),
      }}
      profiles={bundledProfiles}
      onAction={dispatch}
      onScout={() => void dispatchScout(startScout(task.id), dispatch)}
      onStart={() => void startRunSet(task, state, bundledProfiles, dispatch)}
      onReport={() => mutate()}
    />
  );
}

/**
 * The stored task under `taskId`, read from io's `GET /tasks`, or written into the cache by the
 * check that accepted it: the goal view, a skeleton while reading, the fault banner while io
 * fails, and the empty state when io holds no goal under the id.
 */
function StoredGoal({ taskId }: { taskId: TaskId }) {
  const query = useQuery(storedTaskQuery(taskId));
  const stored = query.data;
  if (stored) return <LiveGoal task={stored} />;
  return (
    <>
      {/* The page's one h1 while no goal is drawn, for a screen reader alone. */}
      <h1 className="sr-only">Target</h1>
      {query.isError ? (
        // Before a not-found too: io failing after a 404 says nothing about what it holds.
        <div className="py-(--space-6)">
          <Banner
            kind="fault"
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void query.refetch()}
              >
                Try again
              </Button>
            }
          >
            This goal could not be read from io. <span className="mono">{query.error.message}</span>
          </Banner>
        </div>
      ) : stored === null ? (
        <EmptyState
          label="no goal"
          sentence="No stored goal under this id."
          line="Only goals the check accepted are stored. Check a new one on this screen."
          action={
            // Back to the form, with what was typed still in it.
            <Link to="/target" search={{}} className={buttonVariants({ variant: "default" })}>
              New goal
            </Link>
          }
        />
      ) : (
        // In the goal view's shape: its id, its sentence, where it starts and what counts.
        <div className="grid max-w-180 gap-(--space-3) py-(--space-6)">
          <p role="status" className="sr-only">
            Reading the goal from io.
          </p>
          <Skeleton className="h-5 w-60" />
          <Skeleton className="h-18 w-full" />
          <Skeleton className="h-6 w-120" />
          <Skeleton className="h-6 w-100" />
        </div>
      )}
    </>
  );
}

export function TargetScreen() {
  const { task } = targetRoute.useSearch();
  const navigate = targetRoute.useNavigate();
  const router = useRouter();
  const client = useQueryClient();
  // Held above both modes, so "New goal" comes back to the form as it was typed and a second goal
  // on the same site is one edit away; a reload clears it.
  const [form, dispatch] = useReducer(formReducer, undefined, initialForm);

  return (
    // The page column (`docs/DESIGN.md`, "Space, shape and layout").
    <div className="mx-auto w-full max-w-(--content-max) px-(--space-6)">
      {task === undefined ? (
        <TargetFormView
          form={form}
          onAction={dispatch}
          onCheck={() => {
            // Where the check started: a person who has gone elsewhere meanwhile, Back to another
            // goal included, stays where they went.
            const from = router.state.location.href;
            void checkTarget(form, dispatch).then((checked) => {
              if (checked === undefined) return;
              // Cached first, so the goal view draws from it the moment the URL takes the id.
              client.setQueryData(storedTaskQuery(checked.id).queryKey, checked);
              if (router.state.location.href !== from) return;
              void navigate({ to: "/target", search: { task: checked.id } });
            });
          }}
        />
      ) : (
        // Keyed by task, so each goal's Scout, set and report start fresh.
        <StoredGoal key={task} taskId={task} />
      )}
    </div>
  );
}

export const targetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/target",
  // A zod schema is a Standard Schema, which TanStack validates with directly.
  validateSearch: TargetSearch,
  component: TargetScreen,
});
