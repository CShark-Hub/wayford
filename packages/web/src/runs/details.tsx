/**
 * The run detail's shared pieces: term and description pairs, and the classes of its notes and
 * tables. A leaf module, so the step replay and the decision panel it draws both import it.
 */
import type { ReactNode } from "react";

export const NOTE = "text-xs text-muted-foreground";
export const TABLE = "w-full border-collapse text-left text-xs";
export const TH = "border-b px-2 py-1 font-medium text-muted-foreground";
export const TD = "border-b px-2 py-1 align-top";

/** Term and description pairs, one per row, each a `Detail`. */
export function Details({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {children}
    </dl>
  );
}

/** One term of `Details` and its description. */
export function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
