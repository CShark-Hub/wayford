import { createLink, useNavigate } from "@tanstack/react-router";
import type { RunId, RunOutcome, RunStep } from "@wayford/core";
import { cn } from "cn";
import { type ComponentPropsWithRef, useEffect, useEffectEvent } from "react";
import { describeAction } from "../runs/replay.js";
import { markedEnding, OutcomeGlyph, outcomeKind } from "./outcome.js";

/**
 * What a step did, as its link names it: the action performed, `wasted` when no action ran, and
 * for a step the run stopped in, `stopped`, or the action planned and that it never landed.
 */
function stepSummary(step: RunStep): string {
  if ("wasted" in step) return "wasted";
  if (step.performedAction === undefined) return "stopped";
  const action = describeAction(step.performedAction);
  return "incomplete" in step ? `${action}, never landed` : action;
}

/** A step's accessible name: `step 2: /deliveries · doubleClick e2`, the path it observed. */
function stepLabel(step: RunStep): string {
  return `step ${step.stepIndex}: ${new URL(step.fullObservation.url).pathname} · ${stepSummary(step)}`;
}

/**
 * The anchor of a step. TanStack marks a link `aria-current="page"` when the URL's own search
 * matches it, which says nothing when the URL names no step and step 0 is shown. The timeline
 * marks its current step itself, as `aria-current="step"`, so it is the one mark a screen reader
 * hears. Every step stays a link, so the current one is the replay's permalink. TanStack hands a
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

// `.wf-kbd`, at full opacity: ink-3 holds 4.5:1 on paper only as drawn.
const KBD = "rounded-xs border border-current px-1.5 mono-label";

// Elements that take ← and → for themselves: a caret moves in a field, a select changes its
// option, a focused video seeks.
const OWN_ARROWS = new Set(["INPUT", "TEXTAREA", "SELECT", "VIDEO"]);

/** -1 for ←, 1 for →, undefined for any other key, a modified one, or one already handled. */
export function stepKeyDelta(
  event: Pick<
    KeyboardEvent,
    "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "defaultPrevented"
  > & { target: { tagName?: string; isContentEditable?: boolean } | null },
): -1 | 1 | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return undefined;
  // A Radix tab list or toggle group moves on arrows and prevents the default; React's root
  // listener runs before the window's, so such a key arrives here already handled.
  if (event.defaultPrevented) return undefined;
  const { target } = event;
  if (target?.isContentEditable) return undefined;
  if (OWN_ARROWS.has(target?.tagName?.toUpperCase() ?? "")) return undefined;
  if (event.key === "ArrowLeft") return -1;
  if (event.key === "ArrowRight") return 1;
  return undefined;
}

/**
 * The step `delta` away from the one at `position`, an index into `steps`: undefined past either
 * end. At -1, when the URL asked for a step the run does not hold, either key opens the first.
 */
export function neighbourStep(
  steps: readonly RunStep[],
  position: number,
  delta: -1 | 1,
): RunStep | undefined {
  return position < 0 ? steps[0] : steps[position + delta];
}

/**
 * On the run detail page: ← and → open the step before or after the current one. One `keydown`
 * listener on the window, added once per mount and removed on unmount: an effect event, it reads
 * the latest steps and position whenever a key comes. A key the browser or a widget keeps for
 * itself, by `stepKeyDelta`, and a key at either end move nothing. StepTimeline calls it, so a
 * page that shows the timeline has its keys.
 */
function useStepKeys(runId: RunId, steps: readonly RunStep[], position: number): void {
  const navigate = useNavigate();
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const delta = stepKeyDelta({
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      defaultPrevented: event.defaultPrevented,
      target: event.target instanceof HTMLElement ? event.target : null,
    });
    if (delta === undefined) return;
    const step = neighbourStep(steps, position, delta);
    if (step === undefined) return;
    // The key is spent on the move, so no other listener reads it too.
    event.preventDefault();
    void navigate({ to: "/runs/$runId", params: { runId }, search: { step: step.stepIndex } });
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/**
 * A run's steps in a row, drawn as `.wf-step`: one 40 px link per step to its `?step`, numbered
 * by its `stepIndex`. The current step is filled with ink, a wasted one hatched, and the last one
 * ringed with a 2 px ink border, carrying the outcome's glyph when the run ended Gave up, Over
 * budget or Error. ← and → move between the steps (`useStepKeys`); two hints after the row say so.
 * `steps` are sorted by `stepIndex`, `position` is the current one's index into them, -1 for none.
 */
export function StepTimeline({
  runId,
  steps,
  position,
  outcome,
}: {
  runId: RunId;
  steps: readonly RunStep[];
  position: number;
  /** How the run ended, for the last step's glyph. */
  outcome: RunOutcome;
}) {
  useStepKeys(runId, steps, position);
  const end = outcomeKind(outcome);
  const glyph = markedEnding(end) ? end : undefined;
  return (
    <div className="flex min-w-0 items-center gap-4">
      {/* The native group element, a `fieldset`, rather than a `div` given the role. */}
      <fieldset aria-label="Steps" className="flex flex-wrap gap-1">
        {steps.map((step, index) => {
          const current = index === position;
          const last = index === steps.length - 1;
          const wasted = "wasted" in step;
          return (
            <StepLink
              key={step.stepIndex}
              to="/runs/$runId"
              params={{ runId }}
              search={{ step: step.stepIndex }}
              current={current}
              aria-label={stepLabel(step)}
              className={cn(
                "inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-sm border px-1.5 mono-label transition-colors",
                current
                  ? "border-ink bg-ink text-paper"
                  : "border-line-strong bg-surface text-ink-2 hover:bg-paper-sunken hover:text-ink",
                wasted && "hatch",
                last && "border-2 border-ink",
                // The glyph keeps its outcome's colour on the surface, and the step's paper on ink.
                current && "[&_svg]:text-paper",
              )}
            >
              {wasted ? (
                // Text over the hatch could not be measured, so the number sits on a patch of the
                // step's own fill, whatever state that is in.
                <span className="rounded-xs bg-inherit px-0.5">{step.stepIndex}</span>
              ) : (
                step.stepIndex
              )}
              {last && glyph !== undefined ? <OutcomeGlyph kind={glyph} /> : null}
            </StepLink>
          );
        })}
      </fieldset>
      <span aria-hidden="true" className="inline-flex gap-1 text-ink-3">
        <kbd className={KBD}>←</kbd>
        <kbd className={KBD}>→</kbd>
      </span>
    </div>
  );
}
