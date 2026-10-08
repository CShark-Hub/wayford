/**
 * The Race's History, under the start panel (issue #194): every race io keeps, the running ones at
 * the top and the finished ones under them, each newest first. A race opens on its own URL, live
 * while it runs and from its runs' records once it has finished, and a finished race links to its
 * goal's report too. Several races can run at once, and every one is listed.
 *
 * `RaceHistory` reads the list from io, and draws its loading, its fault and its empty state
 * (`docs/DESIGN.md`, "States") in the section's place.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Banner } from "#components/banner";
import { Skeleton } from "#components/skeleton";
import { Button, buttonVariants } from "#components/ui/button";
import { type Race, racesQuery } from "../api/races.js";
import { PersonaName } from "../components/persona-avatar.js";
import { goalLabel } from "./panel-state.js";
import { useReportTask } from "./report-task.js";

const HEADING_ID = "race-history";

/** An instrument label: lowercase, mono, ink-3 (`docs/DESIGN.md`, "Type"). */
const LABEL = "mono-label text-ink-3";

/** `startedAt` with fixed options in UTC, so it reads the same on every machine, as the report's. */
const STARTED_AT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
});

/** Each item once, in first-seen order. */
function distinct<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/**
 * One race as a row: its goal's label and sentence, which open the race, its personas in start
 * order, its seeds, and when it started. A finished race's row ends in a link to the report the
 * race leads to: the stored one on its goal (`useReportTask`), or else the race's own, whose empty
 * state offers to analyse its runs.
 */
function RaceRow({ race }: { race: Race }) {
  const profileIds = distinct(race.runs.map((run) => run.profileId));
  const reportTask = useReportTask(race.task);
  const seeds = distinct(race.runs.map((run) => run.seed));
  return (
    <li
      data-race={race.id}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-(--space-5) gap-y-(--space-1) border-b border-line py-(--space-3)"
    >
      <div className="flex min-w-0 flex-col gap-(--space-1)">
        <Link
          to="/race/$raceId"
          params={{ raceId: race.id }}
          className="flex min-h-(--target-min) min-w-0 items-center gap-(--space-2) body font-medium text-ink underline-offset-4 hover:underline"
        >
          <span className={`shrink-0 ${LABEL}`}>{goalLabel(race.task)}</span>
          <q className="min-w-0 truncate">{race.task.goal}</q>
        </Link>
        <div className="flex flex-wrap items-center gap-x-(--space-4) gap-y-(--space-1) body text-ink-2">
          <ul aria-label="Personas" className="flex flex-wrap gap-x-(--space-3)">
            {profileIds.map((id) => (
              <li key={id}>
                <PersonaName profileId={id} />
              </li>
            ))}
          </ul>
          <span className="mono">
            <span className="text-ink-3">{seeds.length > 1 ? "seeds " : "seed "}</span>
            {seeds.join(", ")}
          </span>
          <span className="mono">
            <span className="text-ink-3">started </span>
            {`${STARTED_AT.format(new Date(race.startedAt))} UTC`}
          </span>
        </div>
      </div>
      {race.status === "finished" ? (
        <Link
          to="/report/$taskId"
          params={{ taskId: reportTask ?? race.task.id }}
          className={buttonVariants({ variant: "ghost" })}
        >
          Report
        </Link>
      ) : null}
    </li>
  );
}

/** One group of races under its label and count, or nothing when it holds none. */
function Group({ label, races }: { label: string; races: readonly Race[] }) {
  if (races.length === 0) return null;
  const id = `${HEADING_ID}-${label}`;
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <h3 id={id} className={LABEL}>{`${label} · ${races.length}`}</h3>
      <ul className="flex flex-col">
        {races.map((race) => (
          <RaceRow key={race.id} race={race} />
        ))}
      </ul>
    </section>
  );
}

/**
 * `races`, newest first as io lists them: the running ones, then the finished ones, the two groups
 * keeping that order. A line says so when there is none.
 */
function HistoryList({ races }: { races: readonly Race[] }) {
  if (races.length === 0) {
    return <p className="body text-ink-2">No race yet: the races you start are listed here.</p>;
  }
  return (
    <div className="flex flex-col gap-(--space-4)">
      <Group label="running" races={races.filter((race) => race.status === "running")} />
      <Group label="finished" races={races.filter((race) => race.status === "finished")} />
    </div>
  );
}

/** The History section: io's races, or what stands in for them while they load or fail. */
export function RaceHistory() {
  const races = useQuery(racesQuery());
  return (
    <section
      aria-labelledby={HEADING_ID}
      className="flex flex-col gap-(--space-3) border-t border-line pt-(--space-5) pb-(--space-7)"
    >
      <h2 id={HEADING_ID} className="title text-ink">
        History
      </h2>
      {races.isError && races.data === undefined ? (
        <Banner
          kind="fault"
          action={
            <Button variant="outline" onClick={() => void races.refetch()}>
              Try again
            </Button>
          }
        >
          The races could not be read from io, so none is listed.{" "}
          <span className="block mono whitespace-pre-wrap">{races.error.message}</span>
        </Banner>
      ) : races.data === undefined ? (
        <div className="flex flex-col gap-(--space-2)">
          <p role="status" className="sr-only">
            Loading races
          </p>
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <HistoryList races={races.data} />
      )}
    </section>
  );
}
