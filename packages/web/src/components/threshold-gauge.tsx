import { cn } from "cn";
import { type ChangeEvent, type ReactNode, useState } from "react";

/**
 * A range input held at the value it was moved to until its prop catches up. The URL's value
 * arrives after the router's asynchronous load, a task or more after the input event, so an input
 * held to it alone would be set back after each input event until the new value lands. A move is
 * held, then passed to `onMove`; the hold is dropped by a guarded set in render once `value` has it
 * (React's way to adjust state to a prop), or when the input loses focus, before `onRelease`.
 *
 * `shown` is the value drawn, `readout` its `format`, and `input` the props to spread on the
 * `<input type="range">`: its value, `aria-valuetext` and handlers. A readout beside it is an
 * `<output htmlFor aria-live="off">`: an `<output>` is a live region, and the input already says
 * its value through `aria-valuetext`, so the readout stays quiet rather than say it twice.
 */
export function useHeldRange({
  value,
  format,
  onMove,
  onRelease,
}: {
  value: number;
  format: (value: number) => string;
  onMove: (next: number) => void;
  onRelease: () => void;
}) {
  const [moving, setMoving] = useState<number | null>(null);
  if (moving === value) setMoving(null);
  const shown = moving ?? value;
  const readout = format(shown);
  return {
    shown,
    readout,
    input: {
      value: shown,
      "aria-valuetext": readout,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const next = event.currentTarget.valueAsNumber;
        setMoving(next);
        onMove(next);
      },
      onBlur: () => {
        setMoving(null);
        onRelease();
      },
    },
  };
}

/**
 * Where a value written over the gauge's custom properties falls on the ruler, as a share of the
 * track held to its ends: a value past `max` sits at the end, one under `min` at the start. CSS
 * computes it, as components.css's `.wf-gauge__track` does, so the markup carries the numbers.
 */
function along(value: string): string {
  return `clamp(0%, calc((${value} - var(--min)) / (var(--max) - var(--min)) * 100%), 100%)`;
}
const AT_VALUE = along("var(--v)");
/** The softness band's floor, `threshold × (1 − softness)` (docs/RULES.md). */
const AT_FLOOR = along("var(--v) * (1 - var(--soft))");
const AT_WAS = along("var(--was)");

// A native range input, transparent, over the drawn ruler: the drawing is what is seen, the input
// is what pointer, keyboard and screen reader use. Its thumb is the post's width and the track's
// height, so a click lands where the post is drawn, and it draws nothing. Exported for the Lens's
// seed box, which lays the same input over its readout.
export const TRANSPARENT_RANGE = [
  "absolute inset-0 m-0 size-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none",
  "[&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:bg-transparent",
  "[&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:w-(--stroke-post) [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-transparent",
  "[&::-moz-range-track]:h-full [&::-moz-range-track]:bg-transparent",
  "[&::-moz-range-thumb]:h-8 [&::-moz-range-thumb]:w-(--stroke-post) [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent",
].join(" ");

// The box a `TRANSPARENT_RANGE` input lies exactly over, the gauge's track or the seed box. The
// host draws the input's focus ring, since the input draws none.
export const RANGE_HOST =
  "relative has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus-ring has-[:focus-visible]:outline-offset-2";

/**
 * One threshold, drawn as `.wf-gauge`: a ruler on sunken paper with the persona's fill (`--p`) to
 * the value, the `signal` post at it, and the softness band below the post, from `value × (1 −
 * softness)` up to the value. `was`, the persona's own threshold, is a dashed ghost on the ruler
 * and a "was …" before the readout, given only when the value moved off it. The ruler's lowest
 * position, `min`, is off: the value drawn there, as a drag passes it too, draws no fill, post or
 * band, and its readout turns ink-3. The `<output>` reads exactly the input's `aria-valuetext`.
 * `children` is the row under the tags, the softness slider on the Lens.
 */
export function ThresholdGauge({
  id,
  label,
  value,
  min,
  max,
  step,
  ticks,
  softness,
  format,
  was,
  tags,
  onMove,
  onRelease,
  children,
}: {
  /** The range input's id, such as `preview-contrast`. */
  id: string;
  label: string;
  /** The threshold as the URL resolves it. */
  value: number;
  /** The ruler's start, which is off. */
  min: number;
  max: number;
  step: number;
  /** The ruler's intervals. */
  ticks: number;
  softness: number;
  /** The readout and the input's `aria-valuetext`. */
  format: (value: number) => string;
  was?: number;
  /** The rule and provenance tags. */
  tags: ReactNode;
  onMove: (next: number) => void;
  onRelease: () => void;
  children?: ReactNode;
}) {
  const { shown, readout, input } = useHeldRange({ value, format, onMove, onRelease });
  const off = shown <= min;
  return (
    <div
      data-slot="threshold-gauge"
      className="grid gap-2"
      style={{
        "--min": min,
        "--max": max,
        "--v": shown,
        "--soft": softness,
        ...(was === undefined ? {} : { "--was": was }),
      }}
    >
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="me-auto label text-ink">
          {label}
        </label>
        {/* Before the readout, on the head row, so a moved threshold costs the rail no line. */}
        {was === undefined ? null : (
          <span className="mono-label font-normal text-ink-3">{`was ${format(was)}`}</span>
        )}
        <output
          htmlFor={id}
          aria-live="off"
          className={cn("mono-label", off ? "text-ink-3" : "text-ink")}
        >
          {readout}
        </output>
      </div>
      <div
        data-slot="gauge-track"
        className={cn(RANGE_HOST, "h-8 rounded-xs bg-paper-sunken ring-1 ring-line ring-inset")}
      >
        <div className="absolute inset-x-0 bottom-0 flex h-2 justify-between">
          {Array.from({ length: ticks + 1 }, (_, tick) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the ticks are identical marks, so their place is their identity
            <span key={tick} data-slot="gauge-tick" className="w-px bg-line-strong" />
          ))}
        </div>
        {off ? null : (
          <div
            data-slot="gauge-fill"
            className="absolute top-2.75 left-0 h-1.5 rounded-r-full bg-(--p)"
            style={{ width: AT_VALUE }}
          />
        )}
        {off || softness === 0 ? null : (
          <div
            data-slot="gauge-band"
            className="absolute inset-y-0.5 rounded-xs bg-signal-soft hatch [--hatch-line:var(--signal)]"
            style={{ left: AT_FLOOR, width: `calc(${AT_VALUE} - ${AT_FLOOR})` }}
          />
        )}
        {was === undefined ? null : (
          <div
            data-slot="gauge-was"
            className="absolute -inset-y-1 w-0 -translate-x-1/2 border-l-2 border-dashed border-ink-3"
            style={{ left: AT_WAS }}
          />
        )}
        {off ? null : (
          <div
            data-slot="gauge-post"
            className="absolute -inset-y-1 w-(--stroke-post) -translate-x-1/2 rounded-xs bg-signal after:absolute after:-top-0.5 after:left-1/2 after:size-3.25 after:-translate-x-1/2 after:rounded-full after:border-(length:--stroke-post) after:border-signal after:bg-surface"
            style={{ left: AT_VALUE }}
          />
        )}
        <input
          type="range"
          className={TRANSPARENT_RANGE}
          id={id}
          min={min}
          max={max}
          step={step}
          {...input}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{tags}</div>
      {children}
    </div>
  );
}
