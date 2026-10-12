/**
 * The whole run's narration, under run detail's replay (#197): "What Vera said", one line per step,
 * so a run's story reads from start to end without stepping through the replay. Each line is the
 * step's name as the strip gives it (`stepLabel`), linking to that step's replay, then its words as
 * the narration card prints them (`StepNarration`): a wasted step's refused answers, each after the
 * action it named. The words sit beside a dashed rule in the persona's fill: dashed, since narration
 * is a hypothesis, and the fill says whose (`docs/DESIGN.md`, Principles 3 and 6). The heading
 * carries the card's `narration · after the fact` as a line, not a heading, so the card's section
 * keeps that name alone. A Jev run says in one line that Jev writes none, and lists nothing.
 *
 * The heading's id is `NARRATION_HASH`, which the Report's "What they said" links land on, and a
 * line followed hands focus to the replayed step's heading.
 */
import type { RunResult, RunStep } from "@wayford/core";
import { cn } from "cn";
import { type RefObject, useEffect, useRef } from "react";
import { UNDERLINED } from "../components/finding.js";
import { PersonaLabel } from "../components/persona-avatar.js";
import { StepLink, stepLabel } from "../components/step-timeline.js";
import { NOTE } from "./details.js";
import { NARRATION_HASH } from "./replay.js";
import { backendOf, NARRATION_LABEL, StepNarration } from "./step-replay.js";

/** The label line's id, which describes the region, so its name stays the heading's alone. */
const LABEL = `${NARRATION_HASH}-label`;

/**
 * Run `run`'s narration, a line per step of `steps`, sorted by `stepIndex`, which is not empty.
 * `shown` is the step replayed, whose line is marked current; `stepHeading` is that step's heading,
 * which takes focus when a line is followed.
 */
export function NarrationList({
  run,
  steps,
  shown,
  stepHeading,
}: {
  run: RunResult;
  steps: readonly RunStep[];
  /** The `stepIndex` replayed, which a `?step` no step holds may name too. */
  shown: number | undefined;
  stepHeading: RefObject<HTMLHeadingElement | null>;
}) {
  const section = useRef<HTMLElement>(null);
  // A line followed changes the step replayed while focus is still on the line. The router scrolls
  // to the top, where the replay is, and focus left far below would scroll the page back down on
  // the next Tab: so focus moves to the replayed step's heading, without scrolling. Focus anywhere
  // else stays where it is. The `<li>`s keep their keys across steps, so the line followed still
  // holds focus when this runs. ← and → move from the step replayed, not from the line focused.
  // Back to `#run-narration` changes the step too, but there run detail has just landed on the
  // list's heading (`useLandOnHash`), a render before the step reached this list: the address bar,
  // already the new one, says so, where the router's hash may not yet.
  useEffect(() => {
    if (shown === undefined || window.location.hash === `#${NARRATION_HASH}`) return;
    if (section.current?.contains(document.activeElement)) {
      stepHeading.current?.focus({ preventScroll: true });
    }
  }, [shown, stepHeading]);
  return (
    <section
      ref={section}
      aria-labelledby={NARRATION_HASH}
      aria-describedby={LABEL}
      className="grid min-w-0 gap-(--space-3) pt-(--space-4)"
    >
      <div className="grid gap-1">
        {/* A focus target for the hash, not a control, so it draws no focus ring. */}
        <h2
          id={NARRATION_HASH}
          tabIndex={-1}
          className="title scroll-mt-(--space-4) text-ink outline-none"
        >
          What <PersonaLabel profileId={run.profileId} /> said
        </h2>
        <p id={LABEL} className="mono-label text-ink-3">
          {NARRATION_LABEL}
        </p>
      </div>
      {backendOf(run) === "jev" ? (
        <p className={NOTE}>Jev writes no narration</p>
      ) : (
        <ol className="grid max-w-[68ch] min-w-0 gap-(--space-4)">
          {steps.map((step) => {
            const current = step.stepIndex === shown;
            return (
              <li key={step.stepIndex} className="grid min-w-0 justify-items-start gap-1">
                {/* Following the line already replayed moves nothing: the step does not change,
                    so focus would stay here while the router scrolled to the top. */}
                <StepLink
                  to="/runs/$runId"
                  params={{ runId: run.id }}
                  search={{ step: step.stepIndex }}
                  current={current}
                  resetScroll={!current}
                  className={cn(
                    "inline-flex min-h-8 max-w-full items-center mono wrap-anywhere transition-colors",
                    UNDERLINED,
                    current ? "font-semibold text-ink" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {stepLabel(step)}
                </StepLink>
                <div className="min-w-0 max-w-full border-l-(length:--stroke-rule) border-dashed border-(--p) pl-(--space-3) wrap-anywhere">
                  <StepNarration step={step} jev={false} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
