/**
 * One persona's seeds as a row of 32 px cells (`docs/DESIGN.md`, "SeedStrip"), each a link to the
 * run it read. The border is the filter's: solid ink when a route was left open, dashed when every
 * route was closed, a 1 px line-strong border when the goal has no route table (dotted means soft, so it is
 * not used here). The fill is the agent's: the persona's `--p` when it got through. A slash in
 * `fault` marks a run the tool fell over in. The fill reads the slot's `--p`, which the caller sets
 * (`slotStyle`) on the row the strip sits in.
 */
import { Link } from "@tanstack/react-router";
import type { ReportSeed } from "@wayford/core";
import { cn } from "cn";
import type { ReactNode } from "react";
import { OUTCOME_WORDS } from "./outcome-words.js";

/** Whether the filter left a route open in a seed, closed every one, or had no route table. */
type RouteState = "open" | "closed" | "none";

function routeState(seed: ReportSeed): RouteState {
  if (seed.openRoutes === null) return "none";
  return seed.openRoutes.length > 0 ? "open" : "closed";
}

const BORDER: Record<RouteState, string> = {
  open: "border-2 border-solid border-ink",
  closed: "border-2 border-dashed border-line-strong",
  none: "border border-solid border-line-strong",
};

/** What a cell says: "seed 1: Gave up, routes open: B, C. Opens run_kai-past-order-1". */
function seedLabel(seed: ReportSeed): string {
  const routes =
    seed.openRoutes === null
      ? "no route table"
      : `routes open: ${seed.openRoutes.length > 0 ? seed.openRoutes.join(", ") : "none"}`;
  return `seed ${seed.seed}: ${OUTCOME_WORDS[seed.outcome]}, ${routes}. Opens ${seed.runId}`;
}

/** The strip, a fieldset named by `label`: a group, as the runs screen's filters are. */
export function SeedStrip({ seeds, label }: { seeds: readonly ReportSeed[]; label: string }) {
  return (
    <fieldset aria-label={label} className="inline-flex flex-wrap gap-1.5">
      {seeds.map((seed) => {
        const route = routeState(seed);
        const name = seedLabel(seed);
        return (
          <Link
            key={seed.seed}
            to="/runs/$runId"
            params={{ runId: seed.runId }}
            aria-label={name}
            title={name}
            data-route={route}
            className={cn(
              "relative block size-8 shrink-0 rounded-xs transition-colors hover:bg-paper-sunken",
              BORDER[route],
              seed.outcome === "success" && "bg-(--p) hover:bg-(--p)",
            )}
          >
            {seed.outcome === "error" ? <FaultSlash /> : null}
          </Link>
        );
      })}
    </fieldset>
  );
}

/** The error mark, a `fault` diagonal at 2 px across whatever box it fills. */
function FaultSlash() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className="absolute inset-0 size-full text-fault"
    >
      <line
        x1="0"
        y1="1"
        x2="1"
        y2="0"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** One item of the legend: a 16 px swatch drawn as the cell it stands for, and its words. */
function LegendItem({
  swatch,
  slash = false,
  children,
}: {
  swatch: string;
  slash?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="inline-flex items-center gap-1.5 body text-ink-2">
      <span aria-hidden="true" className={cn("relative size-4 shrink-0 rounded-xs", swatch)}>
        {slash ? <FaultSlash /> : null}
      </span>
      {children}
    </li>
  );
}

/**
 * What a cell's border, fill and slash mean, as a list. The swatches take the cells' own borders, so
 * the legend cannot drift from the strip; got through is filled `ink-3`, since it is no persona's.
 * On a goal with no route table (`tableless`) every cell has the same border, so the legend names
 * that one instead of the two it never shows.
 */
export function SeedLegend({ tableless }: { tableless: boolean }) {
  return (
    <ul aria-label="Seed cell legend" className="flex flex-wrap items-center gap-x-(--space-4)">
      {tableless ? (
        <LegendItem swatch={BORDER.none}>no route table</LegendItem>
      ) : (
        <LegendItem swatch={BORDER.open}>route open</LegendItem>
      )}
      <LegendItem swatch={cn(tableless ? BORDER.none : BORDER.open, "bg-ink-3")}>
        got through
      </LegendItem>
      {tableless ? null : <LegendItem swatch={BORDER.closed}>every route closed</LegendItem>}
      <LegendItem swatch={cn(BORDER.none, "overflow-hidden")} slash>
        error
      </LegendItem>
    </ul>
  );
}
