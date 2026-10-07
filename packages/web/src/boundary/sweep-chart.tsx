/**
 * The Boundary screen's chart: one stored sweep as two curves over its grid, as
 * `docs/design/screens/boundary.html` draws it and `docs/DESIGN.md`, "Charts", rules it.
 *
 * - Route open, the filter's share, is a solid `ink` line with square points; got through, the
 *   agent's, a dashed line in the persona's colour with open circles. The area between them is
 *   hatched: the agent's own wayfinding, a hypothesis.
 * - x is the sweep's full grid, laxest left, one band per value, so an incomplete sweep shows the
 *   range it has not reached. y is the share of the sweep's seeds, fixed at 0 to 1.
 * - The boundary is a got-through number (`boundaryOf`): one `signal` post and its flag. A sweep
 *   stopped at an errored value gets a solid `fault` stop line instead, and nothing past it.
 *
 * Plain SVG, no chart library. Every colour is a token, through Tailwind's token utilities or
 * `--p`, the persona slot's fill, set on the figure. The numbers below are the drawing's own,
 * copied from the picture and `components.css`'s `.wf-chart`, as the avatar keeps its coordinates.
 * Every computed coordinate is rounded to one decimal, so the markup depends on the sweep alone.
 */
import type { Sweep, SweepValue } from "@wayford/core";
import { useId } from "react";
import { slotOf, slotStyle } from "../avatar/slots.js";
import { AXIS_COPY, gridOf, gridValue } from "./axis.js";
import { claimedRows, type SweepReading, shares } from "./reading.js";

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** The SVG's frame, drawn at this size. */
const WIDTH = 812;
const HEIGHT = 404;
/** The plot, on its `surface` plate: x over the grid's bands, y over the share of seeds. */
const PLOT = { left: 60, right: 796, top: 52, bottom: 330 } as const;
const PLOT_WIDTH = PLOT.right - PLOT.left;
const PLOT_HEIGHT = PLOT.bottom - PLOT.top;

/** The series' strokes, and the stop line's. */
const STROKE = 2.5;
/** Grid, axes, the half line and the swatch's edge. */
const HAIRLINE = 1;
/** Got through's dashes: dashed means hypothesis. */
const THROUGH_DASH = "7 5";
/** The half line's dots. */
const HALF_DASH = "2 4";
/** Route open's square point, its side. */
const ROUTE_POINT = 9;
/** Got through's open circle, its radius. */
const THROUGH_RADIUS = 5;
/** y grid lines every tenth of the seeds. */
const GRID_LINES = 10;

/** About one 16 px Geist Mono character, and the room kept between two labels on one line. */
const MONO_CHAR = 9.6;
const LABEL_GAP = 12;
/** Tick marks below the x axis, and the labels under them. */
const TICK_LENGTH = 6;
const TICK_LABEL_Y = 358;
/** The y labels, right-aligned left of the plot, each this far under its line. */
const Y_LABEL_X = 48;
const Y_LABEL_DROP = 5;
/** The y title over the y labels, on the flag's line; the x title and "stricter →" under the ticks. */
const Y_TITLE = { x: 0, y: 22 } as const;
const X_TITLE_Y = 398;
/** "half the seeds", right-aligned over the half line. */
const HALF_LABEL = { x: 790, rise: 8 } as const;
/** A label inside the plot keeps a `surface` halo this wide, so no hatch or line buries it. */
const HALO = 4;

/** The boundary's post runs from the x axis up to here; the flag hangs off its top. */
const POST_TOP = 14;
const FLAG = { y: 12, height: 28, radius: 2, padding: 10, baseline: 32 } as const;
/** The stop label sits this far beside the stop line, on the flag's baseline. */
const STOP_LABEL_GAP = 8;
/** "no boundary up to …", right-aligned in the plot's lower right. */
const NONE_NOTE = { x: 784, y: 314 } as const;
/** "nothing measured yet", centred in the plot's upper half. */
const EMPTY_NOTE = { share: 0.75, drop: 5 } as const;

/** The gap's hatch: one line per tile, tilted 45°. */
const HATCH = { size: 6, stroke: 1.2 } as const;
/** The measuring surface: one dot per tile, and a tick at each corner. */
const DOTS = { size: 16, radius: 1 } as const;
const CORNER = { inset: 0.75, arm: 12, stroke: 1.5 } as const;

/** A legend glyph: a series' line through its point. */
const GLYPH = { width: 34, height: 16 } as const;
/** The legend's gap swatch. */
const SWATCH = { width: 18, height: 16, inset: 1 } as const;

/** Every text on the chart: 16 px mono, meta ink unless it says more. */
const TEXT = "mono fill-ink-3";

/** A coordinate on one decimal, so the markup stays stable. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** y of a share of the seeds, 0 on the x axis and 1 at the plot's top. */
function yOf(share: number): number {
  return round1(PLOT.bottom - share * PLOT_HEIGHT);
}

/** About how wide a line of 16 px mono text runs. */
function monoWidth(text: string): number {
  return text.length * MONO_CHAR;
}

/** A polyline's or polygon's `points`. */
function pointsAttr(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

/** "1 run errored", "2 runs errored". */
function erroredRuns(errors: number): string {
  return `${errors} ${errors === 1 ? "run" : "runs"} errored`;
}

/**
 * The reading's mark and the span its words take on the flag's line: the boundary's post with its
 * flag, or the stop line with its label. Each sits right of its line, and flips left when that
 * would cross the plot's right edge.
 */
type Mark =
  | { kind: "post"; x: number; label: string; left: number; width: number }
  | { kind: "stop"; x: number; label: string; labelX: number; anchor: "start" | "end" };

function markOf(
  sweep: Sweep,
  reading: SweepReading,
  xOf: (value: number) => number,
): Mark | undefined {
  switch (reading.kind) {
    case "boundary": {
      const x = xOf(reading.row.value);
      const label = `boundary ${gridValue(sweep, reading.row.value)} · ${reading.row.successes}/${sweep.seeds.length}`;
      const width = round1(monoWidth(label) + 2 * FLAG.padding);
      const left = x + width > PLOT.right ? round1(x - width) : x;
      return { kind: "post", x, label, left, width };
    }
    case "stopped": {
      const x = xOf(reading.row.value);
      const label = `stops at ${gridValue(sweep, reading.row.value)} · ${erroredRuns(reading.row.errors)}`;
      const flips = x + STOP_LABEL_GAP + monoWidth(label) > PLOT.right;
      return {
        kind: "stop",
        x,
        label,
        labelX: round1(flips ? x - STOP_LABEL_GAP : x + STOP_LABEL_GAP),
        anchor: flips ? "end" : "start",
      };
    }
    case "none":
    case "empty":
      return undefined;
    default:
      return reading satisfies never;
  }
}

/** Where a mark's flag or label starts, on the flag's line. */
function markLeft(mark: Mark): number {
  if (mark.kind === "post") return mark.left;
  return mark.anchor === "start" ? mark.labelX : mark.labelX - monoWidth(mark.label);
}

// ---------------------------------------------------------------------------
// The chart
// ---------------------------------------------------------------------------

/**
 * The sweep's chart in its figure: the legend in HTML, then the SVG. `persona` is the display name
 * the titles use, "Vera". Every series draws `claimedRows` alone, so a stopped sweep draws nothing
 * past its stop.
 */
export function SweepChart({
  sweep,
  reading,
  persona,
}: {
  sweep: Sweep;
  reading: SweepReading;
  persona: string;
}) {
  const id = useId();
  const hatchId = `${id}hatch`;
  const dotsId = `${id}dots`;

  const grid = gridOf(sweep);
  const band = PLOT_WIDTH / grid.length;
  // Each value at its band's centre, by its index on the grid.
  const xs = grid.map((_, i) => round1(PLOT.left + (i + 0.5) * band));
  const xOf = (value: number): number => {
    const x = xs[grid.indexOf(value)];
    // A parsed sweep's values are its grid's first ones, in order (`Sweep`'s refinement).
    if (x === undefined) throw new Error(`${sweep.id}: ${value} is not on the sweep's grid`);
    return x;
  };

  const claimed = claimedRows(sweep, reading);
  const through: (readonly [number, number])[] = [];
  const route: (readonly [number, number])[] = [];
  for (const row of claimed) {
    const x = xOf(row.value);
    const share = shares(sweep, row);
    through.push([x, yOf(share.through)]);
    if (share.routeOpen !== null) route.push([x, yOf(share.routeOpen)]);
  }
  // The gap needs route open at every value got through is drawn at.
  const gap = route.length > 0 && route.length === through.length;
  // No route table is the goal's: known once a value is stored, and then every value says so.
  const noRouteTable =
    sweep.values.length > 0 && sweep.values.every((row) => row.routeOpenSeeds === null);

  const mark = markOf(sweep, reading, xOf);
  const markAt =
    reading.kind === "boundary" || reading.kind === "stopped" ? grid.indexOf(reading.row.value) : 0;
  const ticks = tickLabels(sweep, grid, band, markAt);
  // The y title shares the flag's line: it moves to the right end when the flag would cover it.
  const yTitle = `share of ${sweep.seeds.length} seeds`;
  const yTitleRight =
    mark !== undefined && markLeft(mark) < Y_TITLE.x + monoWidth(yTitle) + LABEL_GAP;

  return (
    <figure
      className="rounded-md border border-line bg-paper-sunken px-2 pt-5 pb-2"
      style={slotStyle(slotOf(sweep.profileId))}
    >
      <Legend hatchId={hatchId} noRouteTable={noRouteTable} />
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={ariaLabelOf(sweep, reading, persona, claimed, route.length > 0)}
        className="mx-auto block"
      >
        <defs>
          <pattern
            id={hatchId}
            width={HATCH.size}
            height={HATCH.size}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={HATCH.size}
              className="stroke-ink-3"
              strokeWidth={HATCH.stroke}
            />
          </pattern>
          <pattern id={dotsId} width={DOTS.size} height={DOTS.size} patternUnits="userSpaceOnUse">
            <circle cx={DOTS.size / 2} cy={DOTS.size / 2} r={DOTS.radius} className="fill-line" />
          </pattern>
        </defs>

        <MeasuringSurface dotsId={dotsId} />
        <rect
          x={PLOT.left}
          y={PLOT.top}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          className="fill-surface stroke-line"
          strokeWidth={HAIRLINE}
        />
        <Grid xs={xs} />
        <Axes
          sweep={sweep}
          persona={persona}
          grid={grid}
          xs={xs}
          ticks={ticks}
          yTitle={yTitle}
          yTitleRight={yTitleRight}
        />

        {gap ? (
          <polygon
            data-series="gap"
            points={pointsAttr([...route, ...[...through].reverse()])}
            fill={`url(#${hatchId})`}
          />
        ) : null}
        {(["route", "through"] as const).map((series) => {
          const points = series === "route" ? route : through;
          return points.length > 0 ? (
            <polyline
              key={series}
              data-series={series}
              points={pointsAttr(points)}
              className={`fill-none ${SERIES[series].stroke}`}
              strokeWidth={STROKE}
              strokeDasharray={SERIES[series].dash}
            />
          ) : null;
        })}

        {mark === undefined ? null : <MarkDrawing mark={mark} />}

        {route.map(([x, y]) => (
          <Point key={x} series="route" x={x} y={y} marked />
        ))}
        {through.map(([x, y]) => (
          <Point key={x} series="through" x={x} y={y} marked />
        ))}

        <PlotLabels sweep={sweep} reading={reading} />
      </svg>
    </figure>
  );
}

/** How each series' line is drawn: solid `ink` for the filter's, dashed `--p` for the agent's. */
const SERIES = {
  route: { stroke: "stroke-ink", dash: undefined },
  through: { stroke: "stroke-(--p)", dash: THROUGH_DASH },
} as const;

/**
 * A series' point: route open a filled `ink` square, got through an open circle in `--p`.
 * `marked` tags a point of the plot (`data-point`), so the legend's glyphs are never counted.
 */
function Point({
  series,
  x,
  y,
  marked,
}: {
  series: keyof typeof SERIES;
  x: number;
  y: number;
  marked?: boolean;
}) {
  const data = marked ? series : undefined;
  return series === "route" ? (
    <rect
      data-point={data}
      x={round1(x - ROUTE_POINT / 2)}
      y={round1(y - ROUTE_POINT / 2)}
      width={ROUTE_POINT}
      height={ROUTE_POINT}
      className="fill-ink"
    />
  ) : (
    <circle
      data-point={data}
      cx={x}
      cy={y}
      r={THROUGH_RADIUS}
      className="fill-surface stroke-(--p)"
      strokeWidth={STROKE}
    />
  );
}

/**
 * A series' key: its line through its point, drawn as the chart draws them. Got through's `--p`
 * needs a persona slot set around it (`slotStyle`). The legend uses it, and the value table's
 * header.
 */
export function SeriesGlyph({ series }: { series: keyof typeof SERIES }) {
  const mid = GLYPH.height / 2;
  return (
    <svg
      width={GLYPH.width}
      height={GLYPH.height}
      viewBox={`0 0 ${GLYPH.width} ${GLYPH.height}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <line
        x1={1}
        y1={mid}
        x2={GLYPH.width - 1}
        y2={mid}
        className={SERIES[series].stroke}
        strokeWidth={STROKE}
        strokeDasharray={SERIES[series].dash}
      />
      <Point series={series} x={GLYPH.width / 2} y={mid} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/**
 * The legend, one row above the plot: each series' glyph, its name and whose it is. Without a
 * route table, route open says so, and the gap has no entry. The entries sit close enough to keep
 * one row inside the chart's frame; past that they wrap rather than spill.
 */
function Legend({ hatchId, noRouteTable }: { hatchId: string; noRouteTable: boolean }) {
  const entry = "inline-flex items-center gap-1.5 whitespace-nowrap";
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1.5 pl-2 body text-ink-2">
      <li className={entry}>
        <SeriesGlyph series="route" />
        <span>
          route open{" "}
          <span className="text-ink-3">
            {noRouteTable ? "· — for this goal" : "· the filter · deterministic"}
          </span>
        </span>
      </li>
      <li className={entry}>
        <SeriesGlyph series="through" />
        <span>
          got through <span className="text-ink-3">· the agent · hypothesis</span>
        </span>
      </li>
      {noRouteTable ? null : (
        <li className={entry}>
          <svg
            width={SWATCH.width}
            height={SWATCH.height}
            viewBox={`0 0 ${SWATCH.width} ${SWATCH.height}`}
            aria-hidden="true"
            className="shrink-0"
          >
            <rect
              x={SWATCH.inset}
              y={SWATCH.inset}
              width={SWATCH.width - 2 * SWATCH.inset}
              height={SWATCH.height - 2 * SWATCH.inset}
              fill={`url(#${hatchId})`}
              className="stroke-ink-3"
              strokeWidth={HAIRLINE}
            />
          </svg>
          lost on an open route
        </li>
      )}
    </ul>
  );
}

/**
 * The tick labels to keep, by grid index: every `stride`-th from the marked value, the boundary's
 * or the stop's, so that one is always kept and no two kept labels collide.
 */
function tickLabels(
  sweep: Sweep,
  grid: readonly number[],
  band: number,
  markIndex: number,
): Set<number> {
  const widest = Math.max(...grid.map((value) => monoWidth(gridValue(sweep, value, false))));
  const stride = Math.max(1, Math.ceil((widest + LABEL_GAP) / band));
  return new Set(grid.flatMap((_, i) => ((i - markIndex) % stride === 0 ? [i] : [])));
}

/** The measuring surface under the plate: a dot grid over `paper-sunken`, a tick at each corner. */
function MeasuringSurface({ dotsId }: { dotsId: string }) {
  const near = CORNER.inset;
  const farX = WIDTH - CORNER.inset;
  const farY = HEIGHT - CORNER.inset;
  const arm = CORNER.arm;
  return (
    <g>
      <rect width={WIDTH} height={HEIGHT} fill={`url(#${dotsId})`} />
      <path
        d={[
          `M${near} ${near + arm}V${near}H${near + arm}`,
          `M${farX - arm} ${near}H${farX}V${near + arm}`,
          `M${farX} ${farY - arm}V${farY}H${farX - arm}`,
          `M${near + arm} ${farY}H${near}V${farY - arm}`,
        ].join("")}
        className="fill-none stroke-ink-3"
        strokeWidth={CORNER.stroke}
      />
    </g>
  );
}

/** The grid: a `line` every tenth of the seeds but the half and the axis, and one per value. */
function Grid({ xs }: { xs: readonly number[] }) {
  const tenths = Array.from({ length: GRID_LINES }, (_, i) => (i + 1) / GRID_LINES).filter(
    (share) => share !== 0.5,
  );
  return (
    <g className="stroke-line" strokeWidth={HAIRLINE}>
      {tenths.map((share) => (
        <line key={`y${share}`} x1={PLOT.left} y1={yOf(share)} x2={PLOT.right} y2={yOf(share)} />
      ))}
      {xs.map((x) => (
        <line key={`x${x}`} x1={x} y1={PLOT.top} x2={x} y2={PLOT.bottom} />
      ))}
    </g>
  );
}

/** The half line, the two axes, their labels and titles, and a tick per value of the grid. */
function Axes({
  sweep,
  persona,
  grid,
  xs,
  ticks,
  yTitle,
  yTitleRight,
}: {
  sweep: Sweep;
  persona: string;
  grid: readonly number[];
  /** Each grid value's x, by its index. */
  xs: readonly number[];
  ticks: ReadonlySet<number>;
  yTitle: string;
  yTitleRight: boolean;
}) {
  return (
    <g>
      <line
        x1={PLOT.left}
        y1={yOf(0.5)}
        x2={PLOT.right}
        y2={yOf(0.5)}
        className="stroke-ink-3"
        strokeWidth={HAIRLINE}
        strokeDasharray={HALF_DASH}
      />
      <g className="stroke-line-strong" strokeWidth={HAIRLINE}>
        <line x1={PLOT.left} y1={PLOT.bottom} x2={PLOT.right} y2={PLOT.bottom} />
        <line x1={PLOT.left} y1={PLOT.top} x2={PLOT.left} y2={PLOT.bottom} />
        {grid.map((value, i) => (
          <line
            key={value}
            data-mark="tick"
            x1={xs[i]}
            y1={PLOT.bottom}
            x2={xs[i]}
            y2={PLOT.bottom + TICK_LENGTH}
          />
        ))}
      </g>

      {[1, 0.5, 0].map((share) => (
        <text
          key={share}
          x={Y_LABEL_X}
          y={yOf(share) + Y_LABEL_DROP}
          textAnchor="end"
          className={TEXT}
        >
          {share}
        </text>
      ))}
      <text
        x={yTitleRight ? PLOT.right : Y_TITLE.x}
        y={Y_TITLE.y}
        textAnchor={yTitleRight ? "end" : "start"}
        className={TEXT}
      >
        {yTitle}
      </text>

      {grid.map((value, i) =>
        ticks.has(i) ? (
          <text
            key={value}
            data-tick={value}
            x={xs[i]}
            y={TICK_LABEL_Y}
            textAnchor="middle"
            className={sweep.boundary === value ? "mono font-semibold fill-signal-ink" : TEXT}
          >
            {gridValue(sweep, value, false)}
          </text>
        ) : null,
      )}
      <text x={PLOT.left} y={X_TITLE_Y} className={TEXT}>
        {AXIS_COPY[sweep.axis].xTitle(persona)}
      </text>
      <text x={PLOT.right} y={X_TITLE_Y} textAnchor="end" className={TEXT}>
        stricter →
      </text>
    </g>
  );
}

/**
 * The boundary's post and flag, or the stop line and its label. Only the boundary is a post; a
 * stop is a solid `fault` line, since a crash is a fact and dashed means hypothesis.
 */
function MarkDrawing({ mark }: { mark: Mark }) {
  if (mark.kind === "post") {
    return (
      <g>
        <line
          data-mark="post"
          x1={mark.x}
          y1={PLOT.bottom}
          x2={mark.x}
          y2={POST_TOP}
          className="stroke-signal"
          style={{ strokeWidth: "var(--stroke-post)" }}
        />
        <rect
          data-mark="flag"
          x={mark.left}
          y={FLAG.y}
          width={mark.width}
          height={FLAG.height}
          rx={FLAG.radius}
          className="fill-signal"
        />
        <text
          data-mark="flag-text"
          x={round1(mark.left + FLAG.padding)}
          y={FLAG.baseline}
          className="mono font-medium fill-on-signal"
        >
          {mark.label}
        </text>
      </g>
    );
  }
  return (
    <g>
      <line
        data-mark="stop"
        x1={mark.x}
        y1={PLOT.bottom}
        x2={mark.x}
        y2={POST_TOP}
        className="stroke-fault"
        strokeWidth={STROKE}
      />
      <text
        data-mark="stop-label"
        x={mark.labelX}
        y={FLAG.baseline}
        textAnchor={mark.anchor}
        className="mono fill-fault"
      >
        {mark.label}
      </text>
    </g>
  );
}

/**
 * The words inside the plot, drawn over the series with a `surface` halo, so neither the hatch nor
 * a line buries them: "half the seeds", and the note of a sweep with no boundary in range or with
 * nothing measured yet.
 */
function PlotLabels({ sweep, reading }: { sweep: Sweep; reading: SweepReading }) {
  const halo = {
    strokeWidth: HALO,
    strokeLinejoin: "round",
    paintOrder: "stroke",
  } as const;
  // No boundary in range sits in the lower right, where no got-through point can be; nothing
  // measured yet sits centred in the upper half.
  const note =
    reading.kind === "none"
      ? {
          x: NONE_NOTE.x,
          y: NONE_NOTE.y,
          anchor: "end" as const,
          text: `no boundary up to ${gridValue(sweep, reading.last.value)}`,
        }
      : reading.kind === "empty"
        ? {
            x: round1(PLOT.left + PLOT_WIDTH / 2),
            y: yOf(EMPTY_NOTE.share) + EMPTY_NOTE.drop,
            anchor: "middle" as const,
            text: "nothing measured yet",
          }
        : null;
  return (
    <g>
      <text
        x={HALF_LABEL.x}
        y={yOf(0.5) - HALF_LABEL.rise}
        textAnchor="end"
        className={`${TEXT} stroke-surface`}
        {...halo}
      >
        half the seeds
      </text>
      {note === null ? null : (
        <text
          data-mark="note"
          x={note.x}
          y={note.y}
          textAnchor={note.anchor}
          className="mono fill-ink-2 stroke-surface"
          {...halo}
        >
          {note.text}
        </text>
      )}
    </g>
  );
}

/**
 * The reading in words, for the chart's `aria-label`: "Contrast sweep on Vera: route open and got
 * through across 1.5 to 4.5; under half get through, first at 3.0:1". It claims what the chart
 * draws, and names the first value only: the rate can climb back over half past it.
 */
function ariaLabelOf(
  sweep: Sweep,
  reading: SweepReading,
  persona: string,
  claimed: readonly SweepValue[],
  routeDrawn: boolean,
): string {
  const axis = AXIS_COPY[sweep.axis].switchLabel;
  const head = `${axis.charAt(0).toUpperCase()}${axis.slice(1)} sweep on ${persona}`;
  const first = claimed[0];
  const last = claimed.at(-1);
  if (reading.kind === "empty" || first === undefined || last === undefined) {
    return `${head}: nothing measured yet`;
  }
  const series = routeDrawn ? "route open and got through" : "got through";
  const range = `across ${gridValue(sweep, first.value, false)} to ${gridValue(sweep, last.value, false)}`;
  return `${head}: ${series} ${range}; ${claimOf(sweep, reading)}`;
}

/** What a non-empty reading claims, in the chart's words. */
function claimOf(sweep: Sweep, reading: Exclude<SweepReading, { kind: "empty" }>): string {
  switch (reading.kind) {
    case "boundary":
      return `under half get through, first at ${gridValue(sweep, reading.row.value)}`;
    case "none":
      return `no boundary up to ${gridValue(sweep, reading.last.value)}`;
    case "stopped":
      return `the sweep stops at ${gridValue(sweep, reading.row.value)}, where ${erroredRuns(reading.row.errors)}, and claims nothing past it`;
    default:
      return reading satisfies never;
  }
}
