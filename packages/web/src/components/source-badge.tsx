import { cn } from "cn";
import type { ReactNode } from "react";

/**
 * Where the numbers on screen come from, drawn as `.wf-source`: live is a signal dot on a solid
 * border, stored a hollow dot on a dashed one. The label defaults to the source word.
 */
export function SourceBadge({
  source,
  children,
}: {
  source: "live" | "stored";
  children?: ReactNode;
}) {
  return (
    <span
      data-source={source}
      className={cn(
        "inline-flex min-h-8 items-center gap-2 rounded-sm border border-line-strong px-2.5 mono-label text-ink-2",
        source === "stored" && "border-dashed",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          source === "live" ? "bg-signal ring-3 ring-signal-soft" : "ring-2 ring-inset ring-ink-2",
        )}
      />
      {children ?? source}
    </span>
  );
}
