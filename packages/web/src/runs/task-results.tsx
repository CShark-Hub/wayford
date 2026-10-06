/**
 * Each task's results per persona (`docs/PLAN.md` F7 AC2): two small bar charts for the glance,
 * success rate and median time to success, and under them a table of the exact numbers, which is
 * what a screen reader and a test read. Personas run left to right in fixture order, Ada to Zoya,
 * then any persona that is not bundled, by id (`taskStats`).
 *
 * A chart draws only the personas it has a value for. An empty place on the axis would read as 0%,
 * or as the fastest, so a persona left off a chart is named under it with the reason, and the
 * reasons do not overlap: "Every run errored" for a persona whose every run was the tool falling
 * over, which has neither a rate nor a time; "No success" for one that ran and never arrived, which
 * has a rate of 0 and no time. The table says the same in the cells that have no value.
 *
 * The persona, success and error cells link to the runs behind them (`AGENTS.md`, "Every verdict
 * clickable through to evidence"): the persona to its runs on the task, the success and error
 * counts to those runs alone. A count of none has no run to show, so it stays plain text.
 */
import { Link } from "@tanstack/react-router";
import type { RunResult } from "@wayford/core";
import type { ReactNode } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { PersonaChip } from "#components/persona-avatar";
import { profileColour, slotOf } from "../avatar/slots.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { type PersonaStats, type TaskStats, taskStats } from "./stats.js";

/** The bundled personas' ids in fixture order: the order every chart and table follows. */
const PERSONA_ORDER = bundledProfiles.map((profile) => profile.id);

/** Each bundled persona's label, by id. A persona that is not bundled has none. */
const LABELS = new Map(bundledProfiles.map((profile) => [profile.id, profile.label]));

/** A persona's name on the dashboard: the bundled profile's label, or the id itself. */
export function personaLabel(profileId: string): string {
  return LABELS.get(profileId) ?? profileId;
}

/**
 * A persona as the dashboard names it: its chip, a square in its slot's colour, then its label. A
 * persona that is not bundled takes the fallback slot, and its id is set in monospace.
 */
export function PersonaName({ profileId }: { profileId: string }) {
  const bundled = LABELS.has(profileId);
  return (
    <PersonaChip slot={slotOf(profileId)}>
      <span className={bundled ? undefined : "font-mono"}>{personaLabel(profileId)}</span>
    </PersonaChip>
  );
}

/** Milliseconds as seconds, to a tenth at most: `15.5 s`, `20 s`. */
export function formatSeconds(ms: number): string {
  return `${Math.round(ms / 100) / 10} s`;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/**
 * One chart's size. Fixed, so there is no container to measure: the chart is the same size on
 * every screen, and a static render, which draws no SVG, gets its wrapper without a warning.
 */
const CHART_WIDTH = 360;
const CHART_HEIGHT = 180;

/** An axis's ticks and line, in theme tokens. */
const AXIS_TICK = { fill: "var(--ink-2)", fontSize: 12 };
const AXIS_LINE = "var(--line)";

/** One bar: the persona's label on the x axis, its value, and its colour. */
type BarDatum = { label: string; value: number; fill: string };

/** The bar of `persona` at `value`, in its persona colour. */
function barOf(persona: PersonaStats, value: number): BarDatum {
  const { profileId } = persona;
  return { label: personaLabel(profileId), value, fill: profileColour(profileId) };
}

/**
 * One bar per datum, each filled with its own `fill`. Hidden from assistive technology: the table
 * under it holds the same numbers, exactly. No bar to draw draws no chart.
 */
function PersonaBars({
  data,
  unit,
  domain,
}: {
  data: readonly BarDatum[];
  unit: string;
  domain: [number, number | "auto"];
}) {
  if (data.length === 0) return null;
  return (
    <div aria-hidden="true">
      <BarChart
        width={CHART_WIDTH}
        height={CHART_HEIGHT}
        data={[...data]}
        accessibilityLayer={false}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <XAxis dataKey="label" interval={0} tick={AXIS_TICK} tickLine={false} stroke={AXIS_LINE} />
        <YAxis
          unit={unit}
          domain={domain}
          allowDecimals={false}
          width={56}
          tick={AXIS_TICK}
          tickLine={false}
          stroke={AXIS_LINE}
        />
        {/* Each bar's colour is the `fill` of its datum, which Recharts spreads over the bar. */}
        <Bar dataKey="value" isAnimationActive={false} maxBarSize={40} />
      </BarChart>
    </div>
  );
}

/** A line under a chart naming the personas it leaves off, or nothing when it leaves none off. */
function LeftOff({ reason, personas }: { reason: string; personas: readonly PersonaStats[] }) {
  if (personas.length === 0) return null;
  const names = personas.map((persona) => personaLabel(persona.profileId)).join(", ");
  return <p className="text-xs text-muted-foreground">{`${reason}: ${names}`}</p>;
}

/** A chart with its caption above and the personas it leaves off named under it. */
function ChartFigure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-xs font-medium text-muted-foreground">{caption}</figcaption>
      {children}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

/** A rate as a whole percent: `75%`. */
function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

const NUMBER_CELL = "px-3 py-1.5 text-right font-mono tabular-nums";
const EVIDENCE_LINK =
  "underline decoration-muted-foreground underline-offset-2 hover:text-foreground";

/** One persona's row: each number with a link to the runs behind it, when there are any. */
function ResultRow({ taskId, persona }: { taskId: string; persona: PersonaStats }) {
  const { profileId, runs, errors, successes, successRate, medianSuccessMs } = persona;
  const success =
    successRate === undefined
      ? "all errored"
      : `${successes}/${runs - errors}, ${percent(successRate)}`;
  const time =
    medianSuccessMs !== undefined
      ? formatSeconds(medianSuccessMs)
      : successRate === undefined
        ? "all errored"
        : "no success";
  return (
    <tr className="border-t">
      <th scope="row" className="px-3 py-1.5 text-left font-normal">
        <Link to="/runs" search={{ taskId, profileId }} className={EVIDENCE_LINK}>
          <PersonaName profileId={profileId} />
        </Link>
      </th>
      <td className={NUMBER_CELL}>{runs}</td>
      <td className={NUMBER_CELL}>
        {successes > 0 ? (
          <Link
            to="/runs"
            search={{ taskId, profileId, outcome: "success" }}
            className={EVIDENCE_LINK}
          >
            {success}
          </Link>
        ) : (
          success
        )}
      </td>
      <td className={NUMBER_CELL}>{time}</td>
      <td className={NUMBER_CELL}>
        {errors > 0 ? (
          <Link
            to="/runs"
            search={{ taskId, profileId, outcome: "error" }}
            className={EVIDENCE_LINK}
          >
            {errors}
          </Link>
        ) : (
          errors
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// One task, and every task
// ---------------------------------------------------------------------------

/** One task's charts and table, headed by its goal, or by its id when the goal is unknown. */
function TaskResult({ stats, goal }: { stats: TaskStats; goal: string | undefined }) {
  const { taskId, personas } = stats;
  const headingId = `task-results-${taskId}`;
  const errored = personas.filter((persona) => persona.successRate === undefined);
  const neverArrived = personas.filter(
    (persona) => persona.successRate !== undefined && persona.medianSuccessMs === undefined,
  );
  const rates = personas.flatMap((persona) =>
    persona.successRate === undefined ? [] : [barOf(persona, persona.successRate * 100)],
  );
  const times = personas.flatMap((persona) =>
    persona.medianSuccessMs === undefined ? [] : [barOf(persona, persona.medianSuccessMs / 1000)],
  );
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id={headingId} className="font-medium">
          {goal ?? taskId}
        </h3>
        {goal === undefined ? null : (
          <span className="font-mono text-xs text-muted-foreground">{taskId}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-6">
        <ChartFigure caption="Success rate, %">
          <PersonaBars data={rates} unit="%" domain={[0, 100]} />
          <LeftOff reason="Every run errored" personas={errored} />
        </ChartFigure>
        <ChartFigure caption="Median time to success, s">
          <PersonaBars data={times} unit=" s" domain={[0, "auto"]} />
          <LeftOff reason="No success" personas={neverArrived} />
          <LeftOff reason="Every run errored" personas={errored} />
        </ChartFigure>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-1.5 text-left font-medium">
                Persona
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">
                Runs
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">
                Success
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">
                Median time to success
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">
                Errors
              </th>
            </tr>
          </thead>
          <tbody>
            {personas.map((persona) => (
              <ResultRow key={persona.profileId} taskId={taskId} persona={persona} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Every task's results, one section per task with runs, by task id. `runs` is every run of each
 * task shown, narrowed by the task filter alone: a rate over runs already narrowed to one persona
 * or one outcome would contrast nothing. `goals` labels a task by its goal; a task it lacks is
 * labelled by its id. No run draws nothing.
 */
export function TaskResults({
  runs,
  goals,
}: {
  runs: readonly RunResult[];
  goals: ReadonlyMap<string, string>;
}) {
  const tasks = taskStats(runs, PERSONA_ORDER);
  if (tasks.length === 0) return null;
  return (
    <section aria-labelledby="task-results" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="task-results" className="font-medium">
          Results per task
        </h2>
        <p className="text-sm text-muted-foreground">
          Every run of each task, whatever the persona and outcome filters say. The success rate
          leaves out runs that errored: those are the tool falling over, not the persona.
        </p>
      </div>
      {tasks.map((stats) => (
        <TaskResult key={stats.taskId} stats={stats} goal={goals.get(stats.taskId)} />
      ))}
    </section>
  );
}
