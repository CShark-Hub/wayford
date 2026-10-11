/**
 * The Boundary screen (`docs/DEMO.md` beat 6): one stored sweep, its boundary named in the
 * headline, its two curves and its value table, each cell opening the runs behind it.
 *
 * Two routes draw it:
 * - `/boundary` opens a preset's latest stored sweep on the hard goal: `?axis=contrast`, Vera's,
 *   the default, or `?axis=maxElements`, Kai's.
 * - `/boundary/$sweepId` opens any stored sweep by id.
 *
 * On both, `?value=<v>` opens the runs at one value. Nothing here starts a sweep: `sweep` and
 * `seed:demo` store them, and the screen reads what io has.
 */
import { useQuery } from "@tanstack/react-query";
import { createRoute, Link } from "@tanstack/react-router";
import { SweepAxis } from "@wayford/core";
import type { ReactNode } from "react";
import { z } from "zod";
import { sweepQuery, sweepsQuery } from "../api/sweeps.js";
import { AXIS_COPY, BOUNDARY_PRESETS } from "../boundary/axis.js";
import { AxisSwitch, FRAME, Intro, SweepView } from "../boundary/sweep-view.js";
import { Banner } from "../components/banner.js";
import { personaLabel } from "../components/persona-avatar.js";
import { Skeleton } from "../components/skeleton.js";
import { Button, buttonVariants } from "../components/ui/button.js";
import { rootRoute } from "../shell.js";

/**
 * The screen's search params. Each ends in `.catch(undefined)`, as `RunsSearch` does, so a broken
 * link opens Vera's preset with no value open instead of an error screen.
 */
const BoundarySearch = z.object({
  /** The preset: absent means `contrast`. */
  axis: SweepAxis.optional().catch(undefined),
  /** The value whose runs are open. */
  value: z.number().optional().catch(undefined),
});

/**
 * The skeleton in the content's shape: the head's three rows (the intro beside the switch, the meta
 * line, the headline), the lead, the chart and the table.
 */
function SweepSkeleton() {
  return (
    <div className={FRAME} role="status" aria-label="Reading the stored sweep">
      <div className="flex items-center gap-(--space-5)">
        <Skeleton className="size-22 rounded-lg" />
        <div className="grid flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-(--space-6) gap-y-(--space-1)">
          <Skeleton className="h-6 w-184" />
          <Skeleton className="h-10 w-80 rounded-sm" />
          <Skeleton className="col-span-2 h-5 w-180" />
          <Skeleton className="col-span-2 h-16 w-170" />
        </div>
      </div>
      <Skeleton className="h-7 w-250" />
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-(--space-5)">
        <Skeleton className="h-116 w-207.5 rounded-md" />
        <div className="grid content-start gap-(--space-2)">
          <Skeleton className="h-16" />
          {Array.from({ length: 7 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: identical blocks in a fixed order
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** io failed: the fault banner with its words, and a retry. */
function Fault({ what, message, retry }: { what: string; message: string; retry: () => void }) {
  return (
    <div className={FRAME}>
      <Banner
        kind="fault"
        action={
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        }
      >
        {`${what} could not be read from io. `}
        <span className="font-mono">{message}</span>
      </Banner>
    </div>
  );
}

/** A command, as typed, never broken across lines, in its line's ink. */
function Command({ children }: { children: string }) {
  return <code className="font-mono whitespace-nowrap">{children}</code>;
}

/**
 * The empty state, local to this screen: a mono label, the sentence of what is missing, one line
 * of how to store a sweep, secondary in `ink-3` (#242), and one action. The page's intro stands
 * above it.
 */
function Empty({ title, action }: { title: string; action: ReactNode }) {
  return (
    <div className="grid max-w-140 justify-items-start gap-(--space-3) py-(--space-7)">
      <p className="mono-label text-ink-3">no sweep found</p>
      <h1 className="display-m text-balance text-ink">{title}</h1>
      <p className="body text-pretty text-ink-3">
        How to store one: <Command>pnpm seed:demo</Command> stores both demo sweeps in an empty
        database. <Command>pnpm --filter @wayford/io sweep</Command> prints how to run one alone.
      </p>
      {action}
    </div>
  );
}

/**
 * `/boundary`: a preset's latest stored sweep on the hard goal, Vera's unless `axis` names Kai's.
 */
export function BoundaryScreen() {
  const search = boundaryRoute.useSearch();
  const axis = search.axis ?? "contrast";
  const preset = BOUNDARY_PRESETS[axis];
  const sweeps = useQuery(sweepsQuery(preset));
  const retry = () => void sweeps.refetch();
  // A failure after a list was read keeps the list on screen, as run detail keeps its run.
  if (sweeps.isError && sweeps.data === undefined) {
    return <Fault what="The stored sweeps" message={sweeps.error.message} retry={retry} />;
  }
  if (sweeps.data === undefined) return <SweepSkeleton />;
  // io filters on persona and axis alone, newest first: a newer sweep on another task is skipped.
  const latest = sweeps.data.find((sweep) => sweep.taskId === preset.taskId);
  if (latest === undefined) {
    return (
      <div className={FRAME}>
        {/* The intro and the switch share the top row, as on a loaded sweep. The switch stays, so
            the other preset is one click away from an empty one. */}
        <div className="flex items-center justify-between gap-(--space-6)">
          <Intro />
          <AxisSwitch value={axis} />
        </div>
        <Empty
          title={`No ${AXIS_COPY[axis].switchLabel} sweep on ${personaLabel(preset.profileId)} on the hard goal yet.`}
          action={
            <Button variant="outline" onClick={retry}>
              Check again
            </Button>
          }
        />
      </div>
    );
  }
  return <SweepView sweep={latest} value={search.value} preset={axis} />;
}

/** `/boundary/$sweepId`: one stored sweep by id. */
export function BoundarySweepScreen() {
  const { sweepId } = boundarySweepRoute.useParams();
  const { value } = boundarySweepRoute.useSearch();
  const sweep = useQuery(sweepQuery(sweepId));
  // Before a not-found too: io failing after a 404 says nothing about whether the sweep is stored.
  if (sweep.isError && !sweep.data) {
    return (
      <Fault what="The sweep" message={sweep.error.message} retry={() => void sweep.refetch()} />
    );
  }
  if (sweep.data === undefined) return <SweepSkeleton />;
  if (sweep.data === null) {
    return (
      <div className={FRAME}>
        <Intro />
        <Empty
          title={`No stored sweep ${sweepId}.`}
          action={
            <Link to="/boundary" className={buttonVariants({ variant: "outline" })}>
              Open the latest sweep
            </Link>
          }
        />
      </div>
    );
  }
  // No preset is pressed: a stored sweep need not be its preset's latest, and a pressed item
  // could not be clicked to open that.
  return <SweepView sweep={sweep.data} value={value} />;
}

export const boundaryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/boundary",
  // A zod schema is a Standard Schema, which TanStack validates with directly.
  validateSearch: BoundarySearch,
  component: BoundaryScreen,
});

export const boundarySweepRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/boundary/$sweepId",
  validateSearch: BoundarySearch.pick({ value: true }),
  component: BoundarySweepScreen,
});
