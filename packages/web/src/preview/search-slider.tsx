import { cn } from "cn";
import { useState } from "react";

/**
 * One preview control: a native range input under a row that names it and reads its value out,
 * in the persona colour through `accent-color`. Native, not Radix's slider: its value is in a
 * static render, and it is accessible on its own. `sub` is the smaller, muted row of a threshold's
 * softness, and `onRelease` runs when the slider loses focus, as the pointer or the keyboard moves
 * on. A value past the range, such as a run's seed on the seed slider, puts the thumb at the end,
 * and the readout shows the value itself.
 */
export function SearchSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  format,
  disabled,
  onMove,
  onRelease,
  sub,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  disabled?: boolean;
  onMove: (next: number) => void;
  onRelease?: () => void;
  sub?: boolean;
}) {
  // The URL's value arrives after the router's asynchronous load, a task or more after the input
  // event, so an input held to it alone would be set back after each input event until the new
  // value lands. `moving` holds the value moved to until the URL has it, dropped by a guarded set
  // in render (React's way to adjust state to a prop), or until the slider loses focus.
  const [moving, setMoving] = useState<number | null>(null);
  if (moving === value) setMoving(null);
  const shown = moving ?? value;
  const readout = format(shown);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex items-baseline justify-between gap-3",
          sub ? "text-xs text-muted-foreground" : "text-sm",
        )}
      >
        <label htmlFor={id}>{label}</label>
        {/* An `<output>` is a live region, and the slider already says its value through
            `aria-valuetext`, so the readout stays quiet rather than say it twice. */}
        <output htmlFor={id} aria-live="off" className="font-mono tabular-nums">
          {readout}
        </output>
      </div>
      <input
        type="range"
        className="block w-full cursor-pointer accent-(--persona) disabled:cursor-not-allowed disabled:opacity-40"
        id={id}
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        aria-valuetext={readout}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          setMoving(next);
          onMove(next);
        }}
        onBlur={() => {
          setMoving(null);
          onRelease?.();
        }}
      />
    </div>
  );
}
