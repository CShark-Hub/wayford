/**
 * The Jev tab of a step replay (`docs/adr/0001-jev-actor-backend.md`, decisions 3, 4 and 6): the
 * draw, then every option in offer order with the probability Jev gave it. The drawn option is
 * core's `drawOption` through `drawScale`, the draw the run made, never worked out again here.
 *
 * Jev rounds each probability, so they need not sum to 1: a bar is the option's share of the
 * total, the scale `drawOption` draws on, and the number printed is the stored one, short
 * (`shortNumber`), with the stored one in its title. An option's range on that scale is its
 * segment's width in the draw, and is printed in that segment's title.
 */
import type { DecisionRecord } from "@wayford/core";
import { cn } from "cn";
import { drawScale, JevDraw } from "../components/jev-draw.js";
import { Mark, shortNumber } from "./details.js";
import { describeAction } from "./replay.js";

/**
 * How sure Jev was, labelled as the model's and not the persona's (`docs/DESIGN.md`, Principle 6):
 * `confidence 0.71 · the model's, not Vera's`, the value in mono, short, with the stored one in its
 * title. It sits beside the step's tabs.
 */
export function ConfidenceNote({ confidence, persona }: { confidence: number; persona: string }) {
  return (
    <p className="body whitespace-nowrap text-ink-3">
      confidence{" "}
      <span className="mono text-ink" title={String(confidence)}>
        {shortNumber(confidence)}
      </span>
      {` · the model's, not ${persona}'s`}
    </p>
  );
}

/**
 * The decision of a step Jev chose: the draw, then every option offered, in that order, in two
 * columns read down. Each option gives its action, its description, a bar of its share and its
 * probability, short. The drawn one says "drawn" in words, besides its colour.
 */
export function DecisionPanel({ decision }: { decision: DecisionRecord }) {
  const { ranges, drawn } = drawScale(decision);
  const { options, probabilities } = decision;
  return (
    <div className="grid gap-3">
      <JevDraw decision={decision} />
      <ol
        aria-label="Options, in the order offered"
        className="grid grid-flow-col grid-cols-2 gap-x-6 gap-y-2"
        style={{ gridTemplateRows: `repeat(${Math.ceil(options.length / 2)}, auto)` }}
      >
        {options.map(({ action, description }, i) => {
          const { from = 0, to = 0 } = ranges[i] ?? {};
          const probability = probabilities[i] ?? 0;
          const isDrawn = i === drawn;
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: the options keep the order offered, so the index is the option's identity
              key={i}
              data-drawn={isDrawn ? "" : undefined}
              className={cn(
                "grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2",
                isDrawn ? "text-ink" : "text-ink-2",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn("truncate mono", isDrawn ? "text-ink" : "text-ink-3")}>
                  {describeAction(action)}
                </span>
                {isDrawn ? <Mark>drawn</Mark> : null}
              </span>
              <span
                aria-hidden="true"
                className="block h-1.5 w-12 overflow-hidden rounded-xs bg-paper-sunken inset-ring inset-ring-line"
              >
                <span
                  data-bar=""
                  className={cn("block h-full", isDrawn ? "bg-(--p)" : "bg-ink-3")}
                  style={{ width: `${((to - from) * 100).toFixed(1)}%` }}
                />
              </span>
              {/* Jev sends two places, so the column is one width down a list. A probability
                  worked out to more, as the fake Jev's are, is printed short. */}
              <span className="min-w-10 mono text-right text-ink" title={String(probability)}>
                {shortNumber(probability)}
              </span>
              <span className="col-span-3 truncate body" title={description}>
                {description}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="body text-ink-3">
        Jev gave each option it was offered a probability. The action was drawn from them by the
        run's seed, not taken as the top pick.
      </p>
    </div>
  );
}
