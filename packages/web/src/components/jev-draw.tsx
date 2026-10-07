/**
 * How a Jev step chose its action (`docs/adr/0001-jev-actor-backend.md`, decisions 3, 4 and 6),
 * drawn as `.wf-draw`: the options laid end to end on a bar from 0 to 1, in offer order, and the
 * run's seeded roll as a needle. The segment under the needle is the action taken. It is core's
 * `drawOption`, the draw the run made, never worked out again here and never the top pick.
 *
 * Jev rounds each probability, so they need not sum to 1: a segment is the option's share of the
 * total, the scale `drawOption` draws on, and the probability printed is as stored. A stored roll
 * can run to 17 digits, so the flag shows three places and the roll as stored is in its title.
 */
import { type DecisionRecord, drawOption } from "@wayford/core";
import { cn } from "cn";
import { describeAction } from "../runs/replay.js";
import { SIGNAL_FLAG } from "./filter-states.js";

/** Each option's range on the cumulative scale from 0 to 1, and the index of the drawn one. */
export function drawScale(decision: DecisionRecord): {
  ranges: { from: number; to: number }[];
  drawn: number;
} {
  const { probabilities, rolled } = decision;
  const total = probabilities.reduce((sum, p) => sum + p, 0);
  let running = 0;
  const ranges = probabilities.map((p) => {
    const from = running / total;
    running += p;
    return { from, to: running / total };
  });
  return { ranges, drawn: drawOption(probabilities, rolled) };
}

/** A point on the scale, to three places: `0.071`. */
function point(at: number): string {
  return String(Number(at.toFixed(3)));
}

/**
 * `part` of `whole` as a CSS percentage, to three places: a point on the bar, `62.626%`, or a box
 * over the viewport, `6.875%`.
 */
export function percent(part: number, whole = 1): string {
  return `${Number(((part * 100) / whole).toFixed(3))}%`;
}

/**
 * How a label hangs from a point on the bar: centred on it in the middle, and from it toward the
 * middle near either end, so a label at the bar's first or last quarter stays over the bar.
 */
function hang(at: number): string {
  if (at < 0.25) return "translate-x-0";
  if (at > 0.75) return "-translate-x-full";
  return "-translate-x-1/2";
}

/** The share of the draw from which an option earns a label under the bar: a twentieth. */
const LABEL_SHARE = 0.05;

/**
 * At most this many options are labelled under the bar, the drawn one among them, so the row holds
 * one line at 640 px. Three clicks or scrolls fit it; a label longer than that, typed text say, is
 * cut short by the row's ellipsis.
 */
const MOST_LABELS = 3;

/**
 * The options labelled under the bar, by index: up to `MOST_LABELS` of those with at least
 * `LABEL_SHARE` of the draw, the largest first. When the drawn one is not among them, it takes the
 * last place, after at most `MOST_LABELS - 1` of them, so the draw is always named and the row
 * never holds more than `MOST_LABELS`. A tie keeps the order offered.
 */
export function labelledOptions(ranges: readonly { from: number; to: number }[], drawn: number) {
  const largest = ranges
    .map((range, index) => ({ index, share: range.to - range.from }))
    .filter(({ share }) => share >= LABEL_SHARE)
    .sort((a, b) => b.share - a.share || a.index - b.index)
    .slice(0, MOST_LABELS)
    .map(({ index }) => index);
  return largest.includes(drawn) ? largest : [...largest.slice(0, MOST_LABELS - 1), drawn];
}

/**
 * The draw: a 36 px bar of one segment per option, as wide as its share, the drawn one filled with
 * the persona's slot; the needle, a signal post at the roll, flagged with the roll; and under the
 * bar 0, the options worth a label with the probability Jev gave each (`labelledOptions`), and 1,
 * so the room reads how likely each likely option was without scrolling to the list. The bar is an
 * image whose label says it all, and each segment's title gives its action, its probability and its
 * range. An option of probability 0 keeps its segment and its title, but draws nothing, no width
 * and no divider, so it moves no other segment.
 */
export function JevDraw({ decision }: { decision: DecisionRecord }) {
  const { ranges, drawn } = drawScale(decision);
  const { options, probabilities, rolled } = decision;
  const drawnOption = options[drawn];
  const drew = drawnOption === undefined ? "" : describeAction(drawnOption.action);
  const labelled = labelledOptions(ranges, drawn);
  const count = `${options.length} ${options.length === 1 ? "option" : "options"}`;
  // A segment with width closes on a divider when another with width follows it, so no divider
  // doubles the bar's own edge, even after the last option with width is followed by zeros.
  const lastShown = ranges.findLastIndex((range) => range.to > range.from);
  return (
    // The top padding holds the needle's flag, which rises above the bar. The draw, and the row of
    // labels in it, may each be narrower than the labels' text: the row's ellipsis cuts the text,
    // and the draw never widens its column.
    <div className="grid min-w-0 gap-2 pt-8">
      <div
        role="img"
        aria-label={`${count}, rolled ${rolled}, drew ${drew}`}
        className="relative h-9 rounded-xs border border-line-strong"
      >
        <div className="flex h-full overflow-hidden rounded-xs">
          {options.map(({ action }, i) => {
            const range = ranges[i] ?? { from: 0, to: 0 };
            const isDrawn = i === drawn;
            const divided = range.to > range.from && i < lastShown;
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: the options keep the order offered, so the index is the option's identity
                key={i}
                data-segment=""
                data-drawn={isDrawn ? "" : undefined}
                title={`${describeAction(action)} · ${probabilities[i]} · ${point(range.from)} to ${point(range.to)}`}
                className={cn(
                  "h-full",
                  divided && "border-r border-line-strong",
                  isDrawn ? "bg-(--p)" : i % 2 === 0 ? "bg-paper-sunken" : "bg-surface",
                )}
                style={{ width: percent(range.to - range.from) }}
              />
            );
          })}
        </div>
        <div
          data-needle=""
          className="absolute -inset-y-2 w-(--stroke-post) -translate-x-1/2 bg-signal"
          style={{ left: percent(rolled) }}
        >
          <span
            title={`rolled ${rolled}`}
            className={cn("absolute bottom-full left-1/2 mb-0.5", SIGNAL_FLAG, hang(rolled))}
          >
            {`rolled ${point(rolled)}`}
          </span>
        </div>
      </div>
      {/* The options list below holds every probability for assistive technology, and the bar's
          label says what was drawn, so this row is for the eye alone. */}
      <div
        data-labels=""
        aria-hidden="true"
        className="flex min-w-0 items-baseline gap-(--space-4) mono-label text-ink-3"
      >
        <span className="font-normal">0</span>
        <span className="min-w-0 flex-1 truncate text-center">
          {labelled.map((index, place) => {
            const option = options[index];
            if (option === undefined) return null;
            return (
              <span key={index}>
                {place === 0 ? null : " · "}
                <span
                  data-drawn={index === drawn ? "" : undefined}
                  className={cn(index === drawn && "text-ink")}
                >
                  {`${describeAction(option.action)} ${probabilities[index]}`}
                </span>
              </span>
            );
          })}
        </span>
        <span className="font-normal">1</span>
      </div>
    </div>
  );
}
