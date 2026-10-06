/**
 * One stored run, replayed step by step with its evidence, video and trace (`docs/PLAN.md` F7 AC3,
 * AC4, F12 AC2). The header names the run as `persona | seed | run id`, its only number; the step
 * replayed is `?step=N`, a `stepIndex` (`src/runs/replay.ts`), so a replay position is a link.
 *
 * The run comes from io, parsed with core's schema (`src/api/runs.ts`); the screenshots, the video
 * and the trace are files the browser fetches from io itself. Output register: monochrome, dense,
 * monospace for ids, seeds and measurements, and the persona colour, set once as `--persona` on
 * the screen's root, the only accent (`docs/PLAN.md` "UI").
 */
import { useQuery } from "@tanstack/react-query";
import { createLink, createRoute, Link } from "@tanstack/react-router";
import type { RunResult, RunStep } from "@wayford/core";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { runQuery, tasksQuery, traceUrl, videoUrl } from "../api/runs.js";
import { profileColour } from "../avatar/slots.js";
import { Detail, Details } from "../runs/details.js";
import { describeAction, RunDetailSearch } from "../runs/replay.js";
import { costLine, StepReplay } from "../runs/step-replay.js";
import { formatSeconds, personaLabel } from "../runs/task-results.js";
import { rootRoute } from "../shell.js";

/** The id of the step list's heading. */
const STEPS_HEADING = "run-steps";
/** The id of the replayed step's heading. */
const STEP_HEADING = "run-step";

const LINK = "underline underline-offset-4 hover:text-foreground";

/**
 * What the step list says a step did: the action performed, `wasted` when no action ran, and for a
 * step the run stopped in, `stopped`, or the action planned and that it never landed.
 */
function stepSummary(step: RunStep): string {
  if ("wasted" in step) return "wasted";
  if (step.performedAction === undefined) return "stopped";
  const action = describeAction(step.performedAction);
  return "incomplete" in step ? `${action}, never landed` : action;
}

/**
 * The anchor of a step list entry. TanStack marks a link `aria-current="page"` when the URL's own
 * search matches it, which says nothing when the URL names no step and step 0 is shown. The list
 * marks its current entry itself, as `aria-current="step"`, so it is the one mark a screen reader
 * hears. Every entry stays a link, so the current one is the replay's permalink. TanStack hands a
 * host other than its own `a` a `disabled` flag, which an anchor has no use for, so it is dropped.
 */
function StepAnchor({
  current,
  disabled: _,
  ...props
}: ComponentPropsWithRef<"a"> & { current: boolean; disabled?: boolean }) {
  return <a {...props} aria-current={current ? "step" : undefined} />;
}

const StepLink = createLink(StepAnchor);

/**
 * The Actor backend a run ran on, as its record shows it: `jev` when a step carries the decision
 * Jev drew, `llm` otherwise. Web does not know which model id is Jev's, so it cannot match
 * `modelIds.actor` first, as io's `backendOf` does. So any Jev run that stopped before its first
 * planned action reads `llm`, where io's gap is only such a run on an earlier Jev version. Its
 * model id, printed beside it, still names Jev.
 */
function backendOf(run: RunResult): "jev" | "llm" {
  return run.steps.some((step) => "decision" in step && step.decision !== undefined)
    ? "jev"
    : "llm";
}

/** The screen before a run is shown: its id as the heading, and what stands in for the run. */
function Placeholder({ runId, children }: { runId: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-6">
      <h1 className="font-mono text-xl font-semibold">{runId}</h1>
      {children}
    </div>
  );
}

/** The run's video, with a download link, or a line saying none was recorded. */
function Recording({ run }: { run: RunResult }) {
  return (
    <section aria-labelledby="run-recording" className="flex flex-col gap-3">
      <h2 id="run-recording" className="font-medium">
        Recording
      </h2>
      <Details>
        <Detail term="Video">
          {run.videoPath === undefined ? (
            <span className="text-muted-foreground">not recorded</span>
          ) : (
            <span className="flex flex-col items-start gap-2">
              {/* Playwright records no sound, so the video has nothing to caption. */}
              <video
                controls
                muted
                preload="metadata"
                src={videoUrl(run.id)}
                className="w-full max-w-3xl rounded-md border"
              />
              <a href={videoUrl(run.id)} download className={LINK}>
                Download video
              </a>
            </span>
          )}
        </Detail>
        <Detail term="Trace">
          {run.tracePath === undefined ? (
            <span className="text-muted-foreground">not recorded</span>
          ) : (
            <a href={traceUrl(run.id)} download className={LINK}>
              Download trace
            </a>
          )}
        </Detail>
      </Details>
    </section>
  );
}

/**
 * Every step, in `stepIndex` order, each a link to its replay, and links to the steps before and
 * after the current one. A `?step` no step holds gets a notice above the list and no current entry.
 */
function StepList({
  runId,
  steps,
  requested,
  position,
}: {
  runId: string;
  steps: readonly RunStep[];
  requested: number | undefined;
  position: number;
}) {
  // Only read when a step is shown, so `position` is at least 0 here.
  const before = steps[position - 1];
  const after = steps[position + 1];
  return (
    <nav aria-labelledby={STEPS_HEADING} className="flex flex-col gap-3 lg:sticky lg:top-6">
      <h2 id={STEPS_HEADING} className="font-medium">
        Steps
      </h2>
      {position < 0 && requested !== undefined ? (
        <p role="status" className="text-sm">{`This run has no step ${requested}`}</p>
      ) : null}
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">This run stored no step.</p>
      ) : (
        <ol className="flex flex-col gap-0.5 text-sm">
          {steps.map((step, index) => (
            <li key={step.stepIndex}>
              <StepLink
                to="/runs/$runId"
                params={{ runId }}
                search={{ step: step.stepIndex }}
                current={index === position}
                className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 rounded-md border-l-2 border-transparent px-2 py-1 text-muted-foreground hover:text-foreground aria-[current=step]:border-(--persona) aria-[current=step]:bg-muted/50 aria-[current=step]:text-foreground"
              >
                <span className="font-mono tabular-nums">{step.stepIndex}</span>
                <span className="truncate font-mono">{stepSummary(step)}</span>
              </StepLink>
            </li>
          ))}
        </ol>
      )}
      {position < 0 ? null : (
        <div className="flex justify-between gap-4 text-sm">
          <Neighbour runId={runId} step={before} label="Previous step" />
          <Neighbour runId={runId} step={after} label="Next step" />
        </div>
      )}
    </nav>
  );
}

/** A link to the step beside the current one, or its label greyed out at either end. */
function Neighbour({
  runId,
  step,
  label,
}: {
  runId: string;
  step: RunStep | undefined;
  label: string;
}) {
  if (step === undefined) return <span className="text-muted-foreground/60">{label}</span>;
  return (
    <Link to="/runs/$runId" params={{ runId }} search={{ step: step.stepIndex }} className={LINK}>
      {label}
    </Link>
  );
}

/** A stored run: the header, the recording, the step list and the step replayed. */
function RunDetail({
  run,
  goal,
  requested,
}: {
  run: RunResult;
  /** The task's goal, once `GET /tasks` has it. */
  goal: string | undefined;
  /** The `?step` of the URL, if any. */
  requested: number | undefined;
}) {
  const steps = run.steps.toSorted((a, b) => a.stepIndex - b.stepIndex);
  const shown = requested ?? steps[0]?.stepIndex;
  const position = steps.findIndex((step) => step.stepIndex === shown);
  const current = steps[position];
  return (
    <div
      className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6"
      // A persona that is not bundled has no slot of its own: its accent is the fallback's grey.
      style={{ "--persona": profileColour(run.profileId) }}
    >
      <header className="flex flex-col gap-3 border-l-4 border-(--persona) ps-4">
        <h1 className="font-mono text-xl font-semibold">
          {`${personaLabel(run.profileId)} | ${run.seed} | ${run.id}`}
        </h1>
        <Details>
          <Detail term="Outcome">
            <span className="font-mono">{run.outcome}</span>
          </Detail>
          <Detail term="Duration">
            <span className="font-mono">{formatSeconds(run.durationMs)}</span>
          </Detail>
          <Detail term="Cost">
            <span className="font-mono">{costLine(run.cost)}</span>
          </Detail>
          <Detail term="Task">
            {goal === undefined ? (
              <span className="font-mono">{run.taskId}</span>
            ) : (
              <>
                {goal} <span className="font-mono text-muted-foreground">{run.taskId}</span>
              </>
            )}
          </Detail>
          <Detail term="Actor backend">
            <span className="font-mono">{backendOf(run)}</span>
          </Detail>
          <Detail term="Actor model">
            <span className="font-mono">{run.modelIds.actor}</span>
          </Detail>
          <Detail term="Start URL">
            <span className="font-mono break-all">{run.startUrl}</span>
          </Detail>
        </Details>
      </header>
      <Recording run={run} />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <StepList runId={run.id} steps={steps} requested={requested} position={position} />
        {current === undefined ? null : (
          <section aria-labelledby={STEP_HEADING} className="flex min-w-0 flex-col gap-4">
            <h2 id={STEP_HEADING} className="font-medium">
              {`Step ${current.stepIndex}`}
            </h2>
            <StepReplay run={run} step={current} />
          </section>
        )}
      </div>
    </div>
  );
}

export function RunDetailScreen() {
  const { runId } = runDetailRoute.useParams();
  const { step } = runDetailRoute.useSearch();
  const run = useQuery(runQuery(runId));
  // Goal labels only: while the tasks load, or when io fails them, the header shows the task id.
  const tasks = useQuery(tasksQuery());
  const stored = run.data;
  // Before a not-found too: io failing after a 404 says nothing about whether the run is stored.
  if (run.isError && !stored) {
    return (
      <Placeholder runId={runId}>
        <div role="alert" className="flex flex-col gap-2 text-sm">
          <p>This run could not be read from io.</p>
          <pre className="font-mono text-xs whitespace-pre-wrap text-muted-foreground">
            {run.error.message}
          </pre>
        </div>
      </Placeholder>
    );
  }
  if (stored === undefined) {
    return (
      <Placeholder runId={runId}>
        <p className="text-sm text-muted-foreground">Loading run…</p>
      </Placeholder>
    );
  }
  if (stored === null) {
    return (
      <Placeholder runId={runId}>
        <p className="text-sm">{`No run ${runId} is stored. A run is stored when it ends.`}</p>
      </Placeholder>
    );
  }
  const goal = tasks.data?.find((task) => task.id === stored.taskId)?.goal;
  return <RunDetail run={stored} goal={goal} requested={step} />;
}

export const runDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/$runId",
  // A zod schema is a Standard Schema, which TanStack validates with directly.
  validateSearch: RunDetailSearch,
  component: RunDetailScreen,
});
