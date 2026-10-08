/**
 * One task's report (`docs/PLAN.md` F8, `docs/DEMO.md` beat 5, `docs/design/screens/report.html`):
 * the goal and Scout's line, per persona the two numbers side by side, and the findings grouped by
 * certainty, each opening its evidence step in run detail.
 *
 * The report is stored by io's Analyst (`api/reports.ts`), and its meta line names the backend it
 * read. "Analyse again" asks io to build it anew; io's `POST` is synchronous with no progress, so
 * "running" is the pending state of this goal's analysis. With no report yet, the screen offers the
 * same instead of an empty page.
 *
 * `?persona=` is the persona whose row was picked: the findings narrow to theirs and the page's
 * measurements, and say so, so a picked row is a link.
 *
 * `?analyse=true` asks for the Analyst on arrival, as the race's "Analyse this race" does. Once
 * the stored report has been read, the screen starts it, on io's default backend, only when no
 * report is stored and none is being built, then drops the flag from the address, so a reload, a
 * shared link or a second click on the race never pays for another. An analysis started on an
 * earlier visit shows as running too: the mutation outlives the screen, and its `onSuccess` stores
 * the report all the same.
 */
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute, Link } from "@tanstack/react-router";
import {
  ProfileId,
  type Report,
  type ReportBackend,
  type ScoutLine,
  type UnevidencedClosure,
} from "@wayford/core";
import { type ReactNode, useEffect, useRef } from "react";
import { z } from "zod";
import { analyse, reportQuery } from "../api/reports.js";
import { bundledTasks } from "../bundled-fixtures.js";
import { Banner } from "../components/banner.js";
import { EmptyState } from "../components/empty-state.js";
import { count } from "../components/outcome-words.js";
import { personaLabel } from "../components/persona-avatar.js";
import { SeedLegend } from "../components/seed-strip.js";
import { Skeleton } from "../components/skeleton.js";
import { Button } from "../components/ui/button.js";
import { CastTable, EXACT } from "../report/cast-table.js";
import { Findings } from "../report/findings.js";
import { usd } from "../runs/step-replay.js";
import { rootRoute } from "../shell.js";

/**
 * The report's search params: the persona whose row was picked. A broken value degrades to none,
 * as the runs screen's filters do, instead of an error screen.
 */
export const ReportSearch = z.object({
  persona: ProfileId.optional().catch(undefined),
  analyse: z.boolean().optional().catch(undefined),
});

/** Scout's line: reached in N steps, did not reach in N attempts, or no ground truth. */
function scoutLine(scout: ScoutLine): string {
  switch (scout.status) {
    case "reached":
      return `Scout reached it in ${count(scout.steps, "step")}`;
    case "notReached":
      return `Scout did not reach it in ${count(scout.attempts, "attempt")}`;
    case "noGroundTruth":
      return "no ground truth";
  }
}

/** What the report cost in all, its runs and its one Analyst call, in dollars: `usd` reads no more. */
function costInAll({ runs, analyst }: Report["cost"]): string {
  return usd({ ...runs, usd: runs.usd + analyst.usd });
}

/** `analysedAt` with fixed options in UTC, so it reads the same on every machine. */
const ANALYSED_AT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** "Left out: 2 older runs, 3 runs on the llm backend." with zero terms dropped; none, nothing. */
function leftOutLine(report: Report): string | undefined {
  const { olderRuns, otherBackend, sweepRuns } = report.leftOut;
  const other = report.backend === "jev" ? "llm" : "jev";
  const terms = [
    olderRuns > 0 ? count(olderRuns, "older run") : undefined,
    otherBackend > 0 ? `${count(otherBackend, "run")} on the ${other} backend` : undefined,
    sweepRuns > 0 ? count(sweepRuns, "sweep run") : undefined,
  ].filter((term) => term !== undefined);
  return terms.length === 0 ? undefined : `Left out: ${terms.join(", ")}.`;
}

/** A button that asks io for the report; disabled, and saying so, while it runs. */
function AnalyseButton({
  label,
  variant,
  pending,
  onClick,
}: {
  label: string;
  variant: "default" | "outline";
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant={variant} disabled={pending} onClick={onClick}>
      {pending ? "Analysing…" : label}
    </Button>
  );
}

/** One closure no step shows: persona · route · page · role "name" · rules · N seeds. */
function ClosureLine({ closure }: { closure: UnevidencedClosure }) {
  return (
    <li>
      {`${personaLabel(closure.profileId)} · route ${closure.routeId} · `}
      <span className="mono">{closure.page}</span>
      {` · ${closure.role} “${closure.name}” · `}
      <span className="mono">{closure.rules.join(", ")}</span>
      {` · ${count(closure.seeds, "seed")}`}
    </li>
  );
}

/** When and by which model, what was left out, and the closures no step shows. */
function ReportFooter({ report }: { report: Report }) {
  const leftOut = leftOutLine(report);
  const when = ANALYSED_AT.format(new Date(report.analysedAt));
  return (
    <footer className="grid gap-(--space-1) border-t border-line pt-(--space-3) body text-ink-2">
      <p>{`Analysed ${when} UTC by ${report.analystModelId}.`}</p>
      {leftOut === undefined ? null : <p>{leftOut}</p>}
      {report.unevidencedClosures.length === 0 ? null : (
        <>
          <p>Closed with no evidence step:</p>
          <ul className="grid gap-(--space-1)">
            {report.unevidencedClosures.map((closure) => (
              <ClosureLine
                key={`${closure.profileId}-${closure.routeId}-${closure.page}-${closure.role}-${closure.name}`}
                closure={closure}
              />
            ))}
          </ul>
        </>
      )}
    </footer>
  );
}

/** The report, top to bottom: the cast table, the pick line, the findings, the footer. */
function ReportBody({ report, persona }: { report: Report; persona: ProfileId | undefined }) {
  return (
    <>
      <CastTable report={report} picked={persona} />
      {persona === undefined ? null : (
        <p className="body text-ink-2">
          {`${personaLabel(persona)}'s findings and the page's measurements. `}
          <Link
            to="/report/$taskId"
            params={{ taskId: report.taskId }}
            search={{}}
            activeOptions={EXACT}
            className="inline-flex min-h-8 items-center text-ink underline underline-offset-4"
          >
            Show all
          </Link>
        </p>
      )}
      <Findings report={report} persona={persona} />
      <ReportFooter report={report} />
    </>
  );
}

/** Placeholders in the shape of the report: one per cast row and one per findings column. */
function ReportSkeleton() {
  return (
    <>
      <p role="status" className="sr-only">
        Loading the report.
      </p>
      <div className="grid gap-(--space-2)">
        {["ada", "kai", "vera"].map((row) => (
          <Skeleton key={row} className="h-16 w-full" />
        ))}
      </div>
      <div className="grid gap-(--space-4) lg:grid-cols-3">
        {["measurement", "deterministic", "hypothesis"].map((column) => (
          <Skeleton key={column} className="h-40" />
        ))}
      </div>
    </>
  );
}

/** A fault banner: what failed, io's message in mono, and Try again. */
function Fault({
  children,
  message,
  onRetry,
}: {
  children: ReactNode;
  message: string;
  onRetry: () => void;
}) {
  return (
    <Banner
      kind="fault"
      action={
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {children} <span className="mono">{message}</span>
    </Banner>
  );
}

export function ReportScreen() {
  const { taskId } = reportRoute.useParams();
  const { persona, analyse: analyseOnArrival } = reportRoute.useSearch();
  const navigate = reportRoute.useNavigate();
  const client = useQueryClient();
  const query = useQuery(reportQuery(taskId));
  const analysis = useMutation({
    // Keyed by task, so moving to another task's report resets it: one goal's run never shows as
    // running, or failed, on another's page, and a POST that resolves after the move keeps the
    // options it started with, so its report lands on its own goal.
    mutationKey: ["analyse", taskId],
    mutationFn: (backend: ReportBackend | undefined) => analyse(taskId, backend),
    // The report names its task; storing by that id holds even if the key above were ever lost.
    onSuccess: (report) => client.setQueryData(reportQuery(report.taskId).queryKey, report),
  });
  const goal = bundledTasks.find((task) => task.id === taskId)?.goal;
  const stored = query.data;
  // This goal's analyses still running: this screen's own, or one an earlier visit started.
  const pending = useIsMutating({ mutationKey: ["analyse", taskId] }) > 0;

  // Handled once per arrival, after the stored report has been read: the flag stays set until the
  // replaced address reaches the screen, and StrictMode runs the effect twice. With no backend, io
  // reads the one the task's runs are on.
  const { mutate } = analysis;
  const handled = useRef(false);
  const read = !query.isPending;
  useEffect(() => {
    if (!analyseOnArrival) {
      handled.current = false;
      return;
    }
    if (handled.current || !read) return;
    handled.current = true;
    if (stored === null && !pending) mutate(undefined);
    void navigate({ search: ({ analyse: _analyse, ...rest }) => rest, replace: true });
  }, [analyseOnArrival, read, stored, pending, mutate, navigate]);

  let body: ReactNode;
  // Before a not-found too: io failing after a 404 says nothing about whether a report is stored.
  if (query.isError && !stored) {
    body = (
      <Fault message={query.error.message} onRetry={() => void query.refetch()}>
        This report could not be read from io.
      </Fault>
    );
  } else if (stored === undefined) {
    body = <ReportSkeleton />;
  } else if (stored === null) {
    body = (
      <EmptyState
        label="no report"
        sentence="No report on this goal yet."
        line="The Analyst reads the latest run of each persona and seed on this goal, all personas at once."
        action={
          <AnalyseButton
            label="Analyse runs"
            variant="default"
            pending={pending}
            onClick={() => analysis.mutate(undefined)}
          />
        }
      />
    );
  } else {
    body = <ReportBody report={stored} persona={persona} />;
  }

  return (
    <div className="mx-auto grid max-w-(--content-max) gap-(--space-4) px-(--space-6) pt-(--space-5) pb-(--space-6)">
      <header className="grid gap-(--space-2)">
        <div className="flex flex-wrap items-start justify-between gap-(--space-4)">
          <h1 className="display-m text-balance text-ink">
            {goal === undefined ? taskId : `“${goal}”`}
          </h1>
          {stored == null ? null : (
            <AnalyseButton
              label="Analyse again"
              variant="outline"
              pending={pending}
              onClick={() => analysis.mutate(stored.backend)}
            />
          )}
        </div>
        {stored == null ? null : (
          <div className="flex flex-wrap items-center justify-between gap-x-(--space-6) gap-y-(--space-2)">
            <p className="mono text-ink-2">
              {[taskId, stored.backend, count(stored.runCount, "run"), scoutLine(stored.scout)].map(
                (term) => (
                  <span key={term}>
                    {term}
                    <span className="text-ink-3"> · </span>
                  </span>
                ),
              )}
              <span>{`${costInAll(stored.cost)} in all`}</span>
            </p>
            <SeedLegend
              tableless={stored.personas.every((result) => result.routeOpenSeeds === null)}
            />
          </div>
        )}
      </header>
      {pending ? (
        <p role="status" className="body text-ink-2">
          Analysing the stored runs. This can take a few minutes.
        </p>
      ) : null}
      {analysis.isError ? (
        <Fault message={analysis.error.message} onRetry={() => analysis.mutate(analysis.variables)}>
          The runs could not be analysed.
        </Fault>
      ) : null}
      {body}
    </div>
  );
}

export const reportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/report/$taskId",
  // A zod schema is a Standard Schema, which TanStack validates with directly.
  validateSearch: ReportSearch,
  component: ReportScreen,
});
