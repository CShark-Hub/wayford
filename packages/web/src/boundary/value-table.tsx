/**
 * The Boundary screen's value table: one row per stored value, beside the chart, as
 * `docs/design/screens/boundary.html` draws it. Columns: the value, route open (the filter's,
 * deterministic), got through (the agent's, a hypothesis, so dashed) and the runs.
 *
 * Every number opens its evidence (`docs/DESIGN.md`, Principle 4): every cell of a row is a link to
 * the runs at its value, the screen's own route with `value` set, and the panel under the table
 * then lists them. Every value stored is listed, past a stop too: the table is evidence, and the
 * chart makes the claim.
 *
 * The self-check measures headings, paragraphs, list items and controls, never a bare table cell,
 * so each header's words sit in a `<p>` and each cell's in its link.
 */
import { Link } from "@tanstack/react-router";
import type { Sweep, SweepValue } from "@wayford/core";
import { cn } from "cn";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { gridValue } from "./axis.js";
import { SeriesGlyph } from "./sweep-chart.js";

/**
 * A link to the runs at `value` on the screen's own route, or with `undefined` one that closes them:
 * `/boundary` keeps its axis and `/boundary/$sweepId` its id, since only `value` changes. It keeps
 * the page where it is, and marks itself current only on this very URL.
 */
export function ValueLink({
  value,
  ...props
}: {
  value: number | undefined;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to="."
      search={(prev) => ({ ...prev, value })}
      resetScroll={false}
      activeOptions={{ exact: true }}
      {...props}
    />
  );
}

/**
 * Every cell's link: a 32 px target both ways, so a one-digit cap or a "—" is no narrower, in mono
 * with tabular figures.
 */
const CELL_LINK =
  "inline-flex min-h-8 min-w-8 items-center rounded-xs font-mono tabular-nums text-ink";

/** "1 error", "2 errors". */
function errorsNote(errors: number): string {
  return `${errors} ${errors === 1 ? "error" : "errors"}`;
}

/** The route-open cell's number: k/n, or "—" when the goal has no route table. */
function routeOpenOf(sweep: Sweep, row: SweepValue): string {
  return row.routeOpenSeeds === null ? "—" : `${row.routeOpenSeeds.length}/${sweep.seeds.length}`;
}

/** A header cell's words, in a paragraph so the self-check measures them. */
function Header({ children, numeric }: { children: ReactNode; numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-2 pt-2 pb-2 align-bottom font-normal",
        numeric ? "text-right" : "text-left",
      )}
    >
      <p
        className={cn(
          "inline-flex flex-col gap-1.5 label text-ink-3",
          numeric ? "items-end" : "items-start",
        )}
      >
        {children}
      </p>
    </th>
  );
}

/** The value table. `selected` is the URL's `value`; its row, if stored, is marked current. */
export function ValueTable({ sweep, selected }: { sweep: Sweep; selected: number | undefined }) {
  const { boundary } = sweep;
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-line-strong">
          <Header>value</Header>
          <Header numeric>
            <SeriesGlyph series="route" />
            route open
          </Header>
          <Header numeric>
            <SeriesGlyph series="through" />
            got through
          </Header>
          <Header numeric>runs</Header>
        </tr>
      </thead>
      <tbody>
        {sweep.values.map((row) => (
          <Row
            key={row.value}
            sweep={sweep}
            row={row}
            boundary={row.value === boundary}
            current={row.value === selected}
          />
        ))}
      </tbody>
    </table>
  );
}

/** One stored value: every cell a link to its runs. */
function Row({
  sweep,
  row,
  boundary,
  current,
}: {
  sweep: Sweep;
  row: SweepValue;
  boundary: boolean;
  current: boolean;
}) {
  const at = gridValue(sweep, row.value);
  const seeds = sweep.seeds.length;
  const routeOpen = routeOpenOf(sweep, row);
  const through = `${row.successes}/${seeds}`;
  const runs = row.runIds.length;
  const errors = row.errors > 0 ? `, ${errorsNote(row.errors)}` : "";
  return (
    <tr
      aria-current={current ? "true" : undefined}
      className={cn(
        "border-b transition-colors hover:bg-paper-sunken",
        boundary ? "border-line-strong" : "border-line",
        current && "bg-paper-sunken",
      )}
    >
      <th scope="row" className="py-px pr-2 pl-1 text-left font-normal">
        <ValueLink
          value={row.value}
          aria-label={`${boundary ? "boundary, " : ""}${at}: open its runs`}
          className={cn(CELL_LINK, "gap-2", boundary && "font-semibold text-signal-ink")}
        >
          <span
            aria-hidden="true"
            data-mark={boundary ? "boundary-post" : undefined}
            className={cn("h-5.5 w-0.75 shrink-0 rounded-xs", boundary && "bg-signal")}
          />
          {at}
        </ValueLink>
      </th>
      <td className="px-2 py-px text-right">
        <ValueLink
          value={row.value}
          aria-label={
            row.routeOpenSeeds === null
              ? `route open — for this goal at ${at}: open its runs`
              : `route open ${routeOpen} at ${at}: open its runs`
          }
          className={cn(CELL_LINK, "justify-end")}
        >
          {routeOpen}
        </ValueLink>
      </td>
      <td className="px-2 py-px text-right">
        <ValueLink
          value={row.value}
          aria-label={`got through ${through} at ${at}: open its runs`}
          className={cn(CELL_LINK, "justify-end")}
        >
          {/* Dashed: got through is the agent's, a hypothesis (`docs/DESIGN.md`, Principle 3). */}
          <span className="border-b-2 border-dashed border-line-strong pb-px">{through}</span>
        </ValueLink>
      </td>
      <td className="px-2 py-px text-right whitespace-nowrap">
        {row.errors > 0 ? (
          <span className="mr-1.5 font-mono font-medium text-fault">{errorsNote(row.errors)}</span>
        ) : null}
        <ValueLink
          value={row.value}
          aria-label={`${runs} runs at ${at}${errors}: open them`}
          className={cn(
            CELL_LINK,
            "justify-end gap-1 underline decoration-line-strong underline-offset-3",
          )}
        >
          {runs}
          <ArrowRight aria-hidden="true" className="size-5 text-ink-3" strokeWidth={1.75} />
        </ValueLink>
      </td>
    </tr>
  );
}
