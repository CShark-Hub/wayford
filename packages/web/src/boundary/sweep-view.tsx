/**
 * One loaded sweep, laid out as `docs/design/screens/boundary.html` draws it, plus an intro the
 * picture lacks (#242): the head, with the persona, the intro, the meta line, the headline and the
 * axis switch; the lead; then the chart beside the
 * value table, and the runs of a value when one is open.
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
import { PersonaAvatar, PersonaChip, personaLabel } from "../components/persona-avatar.js";
import { SEGMENT_GROUP, segmentItem } from "../components/segmented-control.js";
import { AXIS_COPY, BOUNDARY_PRESETS, gridOf, proseValue, rangeLabel, seedsLabel } from "./axis.js";
import { readSweep, type SweepReading } from "./reading.js";
import { SweepChart } from "./sweep-chart.js";
import { ValueRuns } from "./value-runs.js";
import { ValueTable } from "./value-table.js";

/**
 * The page's frame in every state, loaded or not: the content column and the screen's padding, so
 * nothing moves when the data arrives. Tighter than other screens (16 px at the top, 8 between and
 * under the blocks): the meta line's own row under the intro (#242) costs 20 px, and a loaded sweep
 * had about 3 px to spare at 1280 × 720.
 */
export const FRAME =
  "mx-auto grid max-w-(--content-max) gap-(--space-2) px-(--space-6) pt-(--space-4) pb-(--space-2)";

/**
 * What the page is for, before any chart or command (#242), so it holds up without a narrator, as on
 * the judges' app, where the Boundary is empty. One line at 1280 beside the switch: a loaded sweep
 * has no room for a second.
 */
export const BOUNDARY_INTRO =
  "A sweep reruns the goal as one limit tightens. Boundary: the first value where under half get through.";

/** The intro's paragraph, on a loaded sweep and on both empty states. */
export function Intro() {
  return <p className="body text-ink-2">{BOUNDARY_INTRO}</p>;
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
 * The meta line: who, which goal, the backend, the range, the seeds and the runs stored, and how far an
 * incomplete sweep got.
 */
function metaOf(sweep: Sweep, persona: string): string {
  const runs = sweep.values.reduce((sum, row) => sum + row.runIds.length, 0);
  const parts = [
    persona,
    sweep.taskId,
    sweep.backend,
    rangeLabel(sweep),
    seedsLabel(sweep.seeds),
    `${runs} runs`,
  ];
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
      <header className="flex items-center gap-(--space-5)">
        {profile === undefined ? null : <PersonaAvatar profile={profile} className="size-22" />}
        {/* Unlike the picture, the intro (#242) shares the top row with the switch, as on an empty
            preset, and the meta line has the row under them to itself, so a minted task id or an
            incomplete sweep still fits it on one line. The headline has the last row to itself,
            so a boundary at 3.0:1 fits on one line. */}
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-(--space-6)">
          <Intro />
          <AxisSwitch value={preset} />
          <p className="col-span-2 font-mono leading-5 text-ink-3">{metaOf(sweep, persona)}</p>
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
