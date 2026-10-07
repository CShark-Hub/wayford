/**
 * What a data screen draws when it has no data (`docs/DESIGN.md`, "States"), as `.wf-empty`: a
 * mono label, one sentence in `display-m`, one line of body, and one action.
 */
import type { ReactNode } from "react";

export function EmptyState({
  label,
  sentence,
  line,
  action,
}: {
  label: string;
  sentence: string;
  line: string;
  action: ReactNode;
}) {
  return (
    <div className="grid max-w-140 justify-items-start gap-(--space-3) px-(--space-6) py-(--space-7)">
      <p className="mono-label text-ink-2">{label}</p>
      <h2 className="display-m text-balance text-ink">{sentence}</h2>
      <p className="body text-pretty text-ink-2">{line}</p>
      {action}
    </div>
  );
}
