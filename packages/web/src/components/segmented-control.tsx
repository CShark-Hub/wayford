import { cn } from "cn";
import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";

/**
 * The value a click picks. Radix sends an empty string when the pressed item is clicked again;
 * that keeps the current value, since a segmented control always has one picked.
 */
export function pickedValue<T extends string>(current: T, next: string): T {
  return next === "" ? current : (next as T);
}

/**
 * `.wf-seg`'s well. Exported with `segmentItem` so a row of links, or a tab list, can wear the
 * same look.
 */
export const SEGMENT_GROUP =
  "inline-flex gap-0.5 rounded-sm border border-line bg-paper-sunken p-0.75";

/**
 * A segment's look. Radix marks the picked item `data-state="on"` and the open tab
 * `aria-selected="true"`; a link to the page that is shown is marked `aria-current="page"`. Each is
 * drawn picked the same way, as `.wf-seg`'s picked segment.
 */
export function segmentItem(mono?: boolean): string {
  return cn(
    "inline-flex min-h-8.5 items-center gap-2 rounded-xs px-3.5 text-ink-2 transition-colors hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:ring-1 data-[state=on]:ring-line-strong aria-selected:bg-surface aria-selected:text-ink aria-selected:ring-1 aria-selected:ring-line-strong aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:ring-1 aria-[current=page]:ring-line-strong",
    // Mono items take `mono-label`, the mono face with tabular figures, at regular weight.
    mono ? "mono-label font-normal" : "label",
  );
}

/**
 * One choice out of a few, drawn as `.wf-seg`. Radix `ToggleGroup` gives it arrow-key focus;
 * `label` names the group for assistive technology. `onValueChange` fires only when the value
 * changes. Items are 34 px tall inside a 40 px control, and `mono` sets them in the mono face.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  mono,
}: {
  label: string;
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onValueChange: (value: T) => void;
  mono?: boolean;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        const picked = pickedValue(value, next);
        if (picked !== value) onValueChange(picked);
      }}
      className={SEGMENT_GROUP}
    >
      {options.map((option) => (
        <ToggleGroup.Item key={option.value} value={option.value} className={segmentItem(mono)}>
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
