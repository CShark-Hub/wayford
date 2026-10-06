import { useHeldRange } from "../components/threshold-gauge.js";
import { SOFTNESS_SLIDER } from "./search.js";

/**
 * A threshold's softness row on the Lens: one 32 px row holding the label, a native range input on
 * `SOFTNESS_SLIDER` in the persona colour through `accent-color`, and the readout. Native, not
 * Radix's slider: its value is in a static render, and it is accessible on its own. `metricLabel`
 * is said but not shown, so the row reads "softness" under its gauge and is announced "Contrast
 * softness". `onRelease` runs when the slider loses focus, as the pointer or the keyboard moves on.
 */
export function SearchSlider({
  id,
  metricLabel,
  value,
  disabled,
  onMove,
  onRelease,
}: {
  id: string;
  metricLabel: string;
  value: number;
  disabled: boolean;
  onMove: (next: number) => void;
  onRelease: () => void;
}) {
  const { readout, input } = useHeldRange({ value, format: String, onMove, onRelease });
  return (
    <div className="flex h-8 items-center gap-3">
      <label htmlFor={id} className="mono-label text-ink-2">
        <span className="sr-only">{`${metricLabel} `}</span>softness
      </label>
      <input
        type="range"
        className="h-8 min-w-0 flex-1 cursor-pointer accent-(--p) disabled:cursor-not-allowed disabled:opacity-40"
        id={id}
        min={SOFTNESS_SLIDER.min}
        max={SOFTNESS_SLIDER.max}
        step={SOFTNESS_SLIDER.step}
        disabled={disabled}
        {...input}
      />
      {/* Four figures wide, so the slider keeps its length as the readout changes. */}
      <output
        htmlFor={id}
        aria-live="off"
        className="min-w-[4ch] text-end mono-label text-ink-2 tabular-nums"
      >
        {readout}
      </output>
    </div>
  );
}
