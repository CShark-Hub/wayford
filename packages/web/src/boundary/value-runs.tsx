/**
 * The runs behind one value of a sweep: a cell per seed, in seed order, each a link to its run's
 * detail. It opens under the value table when the URL names a stored value (`?value=3`).
 *
 * A cell whose run is read is the shared `SeedCell` (`docs/DESIGN.md`, "SeedStrip"): its border is
 * route open, from the sweep, and its fill and slash are the outcome, from the run. A run never
 * stored is slashed, as an error is. `SeedStrip` takes outcomes already settled, while these runs
 * are read one by one, so the cells are laid out here. A cell whose run is still loading is a
 * skeleton; one whose run failed to load is a blank sunken block, under a fault banner. Neither is
 * drawn as an outcome.
 *
 * Each run is read with `runQuery`, whose cache run detail shares, so a cell opens onto a run
 * already in hand.
 */
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { RunResult, Sweep, SweepValue } from "@wayford/core";
import { useId } from "react";
import { runQuery } from "../api/runs.js";
import { Banner } from "../components/banner.js";
import { count, OUTCOME_WORDS } from "../components/outcome-words.js";
import { type RouteState, SeedCell, SeedLegend } from "../components/seed-strip.js";
import { Skeleton } from "../components/skeleton.js";
import { Button, buttonVariants } from "../components/ui/button.js";
import { gridValue } from "./axis.js";
import { ValueLink } from "./value-table.js";

/** What the cell knows of its run: read, not stored (io's 404), still loading, or failed to load. */
type RunState =
  | { kind: "read"; run: RunResult }
  | { kind: "missing" }
  | { kind: "loading" }
  | { kind: "failed" };

/** A label's words for a run the cell holds no outcome of. */
const UNREAD_WORDS: Record<Exclude<RunState["kind"], "read">, string> = {
  missing: "not stored",
  loading: "reading its outcome",
  failed: "outcome not read",
};

/** A label's words for each route state, as `SeedLegend` names them. */
const ROUTE_WORDS: Record<RouteState, string> = {
  open: "route open",
  closed: "every route closed",
  none: "no route table",
};

/** The run state of one `runQuery` result. A failure after a read keeps the run, as run detail does. */
function stateOf(query: { data: RunResult | null | undefined; isError: boolean }): RunState {
  if (query.data) return { kind: "read", run: query.data };
  if (query.isError) return { kind: "failed" };
  if (query.data === null) return { kind: "missing" };
  return { kind: "loading" };
}

/** Whether the filter left a route open on `seed`, closed every one, or the goal has no table. */
function routeOn(row: SweepValue, seed: number): RouteState {
  if (row.routeOpenSeeds === null) return "none";
  return row.routeOpenSeeds.includes(seed) ? "open" : "closed";
}

/** The cell's label: the seed, what happened, route open, and the run it opens. */
function cellLabel(seed: number, runId: string, route: RouteState, state: RunState): string {
  const outcome =
    state.kind === "read"
      ? OUTCOME_WORDS[state.run.outcome].toLowerCase()
      : UNREAD_WORDS[state.kind];
  return `seed ${seed}: ${outcome}, ${ROUTE_WORDS[route]}. Opens ${runId}`;
}

/** A cell with no outcome to draw: a skeleton while its run loads, blank once it failed to. */
function UnreadCell({ runId, label, loading }: { runId: string; label: string; loading: boolean }) {
  return (
    <Link
      to="/runs/$runId"
      params={{ runId }}
      aria-label={label}
      title={label}
      className="block size-8 rounded-xs bg-paper-sunken"
    >
      {loading ? <Skeleton className="size-full" /> : null}
    </Link>
  );
}

/** The runs at `row`'s value, one cell per seed, the legend under them, and a link that closes. */
export function ValueRuns({ sweep, row }: { sweep: Sweep; row: SweepValue }) {
  const labelId = useId();
  const runs = useQueries({ queries: row.runIds.map((id) => runQuery(id)) });
  const failed = runs.filter((query) => stateOf(query).kind === "failed");
  return (
    <section aria-labelledby={labelId} className="grid justify-items-start gap-(--space-2)">
      <p id={labelId} className="mono-label text-ink-2">
        {`runs at ${gridValue(sweep, row.value)}`}
      </p>
      {failed.length > 0 ? (
        <Banner
          kind="fault"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                for (const query of failed) void query.refetch();
              }}
            >
              Try again
            </Button>
          }
        >
          {`${count(failed.length, "run")} of ${row.runIds.length} could not be read from io. `}
          <span className="font-mono">{failed[0]?.error?.message}</span>
        </Banner>
      ) : null}
      {/* 4 px apart, so ten seeds keep one row in the table's column at 1280 px. */}
      <ul className="flex flex-wrap gap-1">
        {sweep.seeds.map((seed, i) => {
          const runId = row.runIds[i];
          // `Sweep` refuses more run ids than seeds, not fewer: a seed with none has no cell.
          if (runId === undefined) return null;
          const query = runs[i];
          const state = query === undefined ? { kind: "loading" as const } : stateOf(query);
          const route = routeOn(row, seed);
          const label = cellLabel(seed, runId, route, state);
          return (
            <li key={seed}>
              {state.kind === "loading" || state.kind === "failed" ? (
                <UnreadCell runId={runId} label={label} loading={state.kind === "loading"} />
              ) : (
                <SeedCell
                  runId={runId}
                  route={route}
                  through={state.kind === "read" && state.run.outcome === "success"}
                  slashed={state.kind === "missing" || state.run.outcome === "error"}
                  label={label}
                />
              )}
            </li>
          );
        })}
      </ul>
      <SeedLegend tableless={row.routeOpenSeeds === null} />
      <ValueLink value={undefined} className={buttonVariants({ variant: "outline", size: "sm" })}>
        Close
      </ValueLink>
    </section>
  );
}
