/**
 * A persona's two numbers, never merged (`docs/DESIGN.md`, "Readout", Principle 4): route open, the
 * filter's, and got through, the agent's, each k/n in `readout` and each a link to the runs behind
 * it. Got through carries a dashed underline: it is the number a hypothesis speaks to. A number the
 * report does not have reads "—", with its reason for a hover and a screen reader, never 0.
 *
 * Under them, the gap bar: per seed, whether the persona got through, had a route open and did not
 * get through (hatched: the agent's own wayfinding), or had every route closed (the sunken rest).
 * A seed the tool fell over in is left out of the bar, as it is left out of got through.
 */
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReportSeed } from "@wayford/core";
import { cn } from "cn";
import { count } from "./outcome-words.js";

/** Which of the two numbers a readout is. */
export type ReadoutKind = "routeOpen" | "gotThrough";

/**
 * Why a number is missing. Route open is null only on a goal with no route table; got through only
 * when every run errored, since its denominator leaves the errored runs out.
 */
const NO_VALUE: Record<ReadoutKind, string> = {
  routeOpen: "no route table for this goal",
  gotThrough: "every run errored",
};

/**
 * "—" in place of a number, with the reason as a hover and as text a screen reader reads. The dash
 * is set in `readout`, or in `className` for a smaller number such as the median time.
 */
export function NoValue({ reason, className = "readout" }: { reason: string; className?: string }) {
  return (
    <p title={reason} className="text-ink-2">
      <span aria-hidden="true" className={className}>
        —
      </span>
      <span className="sr-only">{reason}</span>
    </p>
  );
}

/**
 * One of the two numbers, k/n, linked through `to` to the runs behind it, with `opens` as the link's
 * title: the runs screen's filters can only select a superset of what the number counts, so the
 * link says what it opens. A got-through count of 0 stays plain text: its link would open no run,
 * as on the runs screen.
 */
export function Readout({
  kind,
  value,
  to,
  opens,
}: {
  kind: ReadoutKind;
  value: { k: number; n: number } | null;
  to: LinkProps;
  opens: string;
}) {
  if (value === null) return <NoValue reason={NO_VALUE[kind]} />;
  const figure = (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5",
        kind === "gotThrough" && "border-b-2 border-dashed border-line-strong pb-0.5",
      )}
    >
      <span className="readout text-ink">{value.k}</span>
      <span className="mono text-ink-2">{`/${value.n}`}</span>
    </span>
  );
  return (
    <p data-kind={kind}>
      {kind === "gotThrough" && value.k === 0 ? (
        figure
      ) : (
        <Link
          {...to}
          title={opens}
          className="inline-block rounded-sm transition-colors hover:bg-paper-sunken"
        >
          {figure}
        </Link>
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------
// The gap
// ---------------------------------------------------------------------------

/** A persona's seeds split for the gap bar. `total` leaves out the `errors`. */
export type GapCounts = {
  through: number;
  gap: number;
  closed: number;
  total: number;
  errors: number;
};

/**
 * The gap bar's counts, one per seed. Through is every seed that ended in success, whatever its
 * routes; gap is a seed with a route open that neither got through nor errored; closed is a seed
 * with every route closed that neither got through nor errored. Errored seeds are left out. Null
 * without a route table, or when every seed errored: there is no gap to draw.
 */
export function gapCounts(seeds: readonly ReportSeed[]): GapCounts | null {
  if (seeds.some((seed) => seed.openRoutes === null)) return null;
  const counted = seeds.filter((seed) => seed.outcome !== "error");
  if (counted.length === 0) return null;
  const through = counted.filter((seed) => seed.outcome === "success").length;
  const gap = counted.filter(
    (seed) => seed.outcome !== "success" && (seed.openRoutes?.length ?? 0) > 0,
  ).length;
  return {
    through,
    gap,
    closed: counted.length - through - gap,
    total: counted.length,
    errors: seeds.length - counted.length,
  };
}

/** `part` of `total` as a CSS width. */
function share(part: number, total: number): string {
  return `${(part / total) * 100}%`;
}

/**
 * The gap bar and its caption, counted by `gapCounts`. Through is the persona's `--p`, which the
 * caller sets (`slotStyle`) on the row the bar sits in; the gap is hatched; closed is the sunken
 * track left over. The counts are the bar's name, so a screen reader gets the numbers exactly.
 */
export function GapBar({ seeds }: { seeds: readonly ReportSeed[] }) {
  const counts = gapCounts(seeds);
  if (counts === null) {
    const tableless = seeds.some((seed) => seed.openRoutes === null);
    return <NoValue reason={tableless ? NO_VALUE.routeOpen : NO_VALUE.gotThrough} />;
  }
  const { through, gap, closed, total, errors } = counts;
  const left = errors > 0 ? `; ${count(errors, "errored seed")} left out` : "";
  return (
    <div className="grid gap-1.5">
      <div
        role="img"
        aria-label={`${through} through, ${gap} open but not through, ${closed} closed${left}`}
        className="flex h-3 overflow-hidden rounded-xs bg-paper-sunken ring-1 ring-line ring-inset"
      >
        <div data-part="through" className="bg-(--p)" style={{ width: share(through, total) }} />
        <div
          data-part="gap"
          className="bg-[repeating-linear-gradient(-45deg,var(--ink-3)_0_1.5px,transparent_1.5px_5px)] ring-1 ring-ink-3 ring-inset"
          style={{ width: share(gap, total) }}
        />
      </div>
      <p className="mono text-ink-2">{`${gap} open, not through`}</p>
    </div>
  );
}
