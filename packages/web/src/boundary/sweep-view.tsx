/**
 * One loaded sweep, laid out as `docs/design/screens/boundary.html` draws it: the source in the top
 * bar; the head, with the persona, the meta line, the headline and the axis switch; the lead; then
 * the chart beside the value table, and the runs of a value when one is open.
 *
 * The headline and the lead say what `readSweep` reads, in the agent's words: the boundary is a
 * got-through number, never where a route closes (`docs/DEMO.md`, "Words we do not use"). Route
 * open and got through stay two numbers, each k/n in mono.
 *
 * Both routes draw this view: `/boundary` on a preset's latest sweep and `/boundary/$sweepId` on
 * any stored one. A cell opens the runs on the route it is on.
 */
import { Link } from "@tanstack/react-router";
import { SWEEP_AXES, type Sweep, type SweepAxis } from "@wayford/core";
import type { ReactNode } from "react";
import { slotOf, slotStyle } from "../avatar/slots.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { PersonaAvatar, PersonaChip } from "../components/persona-avatar.js";
import { SEGMENT_GROUP, segmentItem } from "../components/segmented-control.js";
import { SourceBadge } from "../components/source-badge.js";
import { Tag } from "../components/tag.js";
import { TopBarSlot } from "../components/top-bar.js";
import { personaLabel } from "../runs/task-results.js";
import { AXIS_COPY, BOUNDARY_PRESETS, gridOf, proseValue, rangeLabel, seedsLabel } from "./axis.js";
import { readSweep, type SweepReading } from "./reading.js";
import { SweepChart } from "./sweep-chart.js";
import { ValueRuns } from "./value-runs.js";
import { ValueTable } from "./value-table.js";

/**
 * The page's frame in every state, loaded or not: the content column and the screen's padding, so
 * nothing moves when the data arrives.
 */
export const FRAME =
  "mx-auto grid max-w-(--content-max) gap-(--space-3) px-(--space-6) pt-(--space-5) pb-(--space-3)";

/** Where the screen's numbers come from: stored, on the backend the sweep ran on. */
export function SweepSource({ sweep }: { sweep: Sweep }) {
  return (
    <>
      <SourceBadge source="stored" />
      <Tag variant="plain">{sweep.backend}</Tag>
    </>
  );
}

/**
 * The switch between the two demo presets: a link each, drawn as a segmented control, each a chip
 * in its persona's slot. A preset is a place, so it is a link: one click opens `/boundary` on it,
 * and any open value is dropped. `value` marks the preset shown; with none, neither is marked, and
 * each link still opens its preset's latest sweep.
 */
export function AxisSwitch({ value }: { value?: SweepAxis | undefined }) {
  return (
    <nav aria-label="Axis" className="shrink-0">
      <ul className={SEGMENT_GROUP}>
        {SWEEP_AXES.map((axis) => {
          const { profileId } = BOUNDARY_PRESETS[axis];
          return (
            <li key={axis} className="flex">
              <Link
                to="/boundary"
                search={{ axis }}
                aria-current={axis === value ? "page" : undefined}
                className={segmentItem()}
              >
                <PersonaChip slot={slotOf(profileId)}>
                  {`${AXIS_COPY[axis].switchLabel} · ${personaLabel(profileId)}`}
                </PersonaChip>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A value in prose with its unit: "3:1", "10 elements". */
function proseWithUnit(axis: SweepAxis, value: number): string {
  const { unit } = AXIS_COPY[axis];
  return unit === "" ? proseValue(axis, value) : `${proseValue(axis, value)} ${unit}`;
}

/** The headline's words for a stop: "a run errored", "2 runs errored". */
function headlineErrors(errors: number): string {
  return errors === 1 ? "a run errored" : `${errors} runs errored`;
}

/**
 * The meta line: who, which goal, the range, the seeds and the runs stored, and how far an
 * incomplete sweep got.
 */
function metaOf(sweep: Sweep, persona: string): string {
  const runs = sweep.values.reduce((sum, row) => sum + row.runIds.length, 0);
  const parts = [persona, sweep.taskId, rangeLabel(sweep), seedsLabel(sweep.seeds), `${runs} runs`];
  if (sweep.status === "incomplete") {
    parts.push(`incomplete, ${sweep.values.length} of ${gridOf(sweep).length} values`);
  }
  return parts.join(" · ");
}

/**
 * The headline's one number, in `display-xl`. Orange means the line (`docs/DESIGN.md`, Principle 2),
 * so only the boundary is `signal-ink`; a stop is a fault, and no boundary is plain ink.
 */
function Figure({ tone, children }: { tone: "signal" | "fault" | "ink"; children: ReactNode }) {
  const colour = { signal: "text-signal-ink", fault: "text-fault", ink: "text-ink" }[tone];
  return <span className={`display-xl tabular-nums ${colour}`}>{children}</span>;
}

/** The headline, one sentence per reading. */
function Headline({ sweep, reading }: { sweep: Sweep; reading: SweepReading }) {
  switch (reading.kind) {
    case "boundary":
      return (
        <>
          Under half get through, first at{" "}
          <Figure tone="signal">{proseValue(sweep.axis, reading.row.value)}</Figure>.
        </>
      );
    case "none":
      return (
        <>
          No boundary up to <Figure tone="ink">{proseValue(sweep.axis, reading.last.value)}</Figure>
          .
        </>
      );
    case "stopped":
      return (
        // Short enough for one line beside the switch at 1280, as the boundary's sentence is.
        <>
          Stops at <Figure tone="fault">{proseValue(sweep.axis, reading.row.value)}</Figure>:{" "}
          {headlineErrors(reading.row.errors)}.
        </>
      );
    case "empty":
      return <>Nothing measured yet.</>;
    default:
      return reading satisfies never;
  }
}

/** A k/n or a count in the lead: mono, in ink. */
function Count({ children }: { children: ReactNode }) {
  return <b className="font-mono font-medium text-ink">{children}</b>;
}

/** A value in the lead: mono. */
function Value({ children }: { children: ReactNode }) {
  return <span className="font-mono">{children}</span>;
}

/** The lead under the head: the reading's numbers, k/n in mono. */
function Lead({ sweep, reading }: { sweep: Sweep; reading: SweepReading }) {
  const seeds = sweep.seeds.length;
  switch (reading.kind) {
    case "boundary": {
      const open = reading.row.routeOpenSeeds;
      return (
        <>
          The first value, from the laxest, where under half got through:{" "}
          <Count>{`${reading.row.successes}/${seeds}`}</Count> at{" "}
          <Value>{proseWithUnit(sweep.axis, reading.row.value)}</Value>
          {open === null ? (
            ". This goal has no route table, so route open reads —."
          ) : (
            <>
              , while the filter left a route open in <Count>{`${open.length}/${seeds}`}</Count>.
            </>
          )}
        </>
      );
    }
    case "none": {
      const first = sweep.values[0] ?? reading.last;
      return (
        <>
          Half or more got through at every value from{" "}
          <Value>{proseWithUnit(sweep.axis, first.value)}</Value> to{" "}
          <Value>{proseWithUnit(sweep.axis, reading.last.value)}</Value>.
        </>
      );
    }
    case "stopped": {
      const { errors } = reading.row;
      return (
        <>
          <Count>{errors}</Count> {errors === 1 ? "run" : "runs"} at{" "}
          <Value>{proseWithUnit(sweep.axis, reading.row.value)}</Value> errored, so the sweep claims
          nothing from there on.
        </>
      );
    }
    case "empty":
      return <>The sweep is stored, but no value has finished yet.</>;
    default:
      return reading satisfies never;
  }
}

/**
 * A loaded sweep. `value` is the URL's: the row it names, if stored, is marked and its runs open.
 * `preset` is the switch's pressed item, none when left out.
 */
export function SweepView({
  sweep,
  value,
  preset,
}: {
  sweep: Sweep;
  value: number | undefined;
  preset?: SweepAxis;
}) {
  const reading = readSweep(sweep);
  const profile = bundledProfiles.find((bundled) => bundled.id === sweep.profileId);
  const persona = personaLabel(sweep.profileId);
  const open = sweep.values.find((row) => row.value === value);
  return (
    <div className={FRAME} style={slotStyle(slotOf(sweep.profileId))}>
      <TopBarSlot>
        <SweepSource sweep={sweep} />
      </TopBarSlot>

      <header className="flex items-center gap-(--space-5)">
        {profile === undefined ? null : <PersonaAvatar profile={profile} className="size-22" />}
        {/* As the picture lays it out: the meta line and the switch share the top row, and the
            headline has the row under them to itself, so a boundary at 3.0:1 fits on one line. */}
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-(--space-6)">
          <p className="font-mono leading-5 text-ink-3">{metaOf(sweep, persona)}</p>
          <AxisSwitch value={preset} />
          <h1 className="col-span-2 display-l text-balance text-ink">
            <Headline sweep={sweep} reading={reading} />
          </h1>
        </div>
      </header>

      <p className="lead text-ink-2">
        <Lead sweep={sweep} reading={reading} />
      </p>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-(--space-5)">
        <SweepChart sweep={sweep} reading={reading} persona={persona} />
        {/* Sized by the chart alone, so a long table or an open value scrolls inside the
            column instead of growing the page. */}
        <div className="grid min-h-0 content-start gap-(--space-3) overflow-y-auto contain-size">
          <ValueTable sweep={sweep} selected={value} />
          {open === undefined ? null : <ValueRuns sweep={sweep} row={open} />}
          <p className="body text-ink-3">
            {`Only ${persona}'s ${AXIS_COPY[sweep.axis].name} moves; the rest of the profile stays as stored.`}
          </p>
        </div>
      </div>
    </div>
  );
}
