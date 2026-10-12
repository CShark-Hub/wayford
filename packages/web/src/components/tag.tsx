import { isUnsourced, type ProvenanceId } from "@wayford/core";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ReactNode } from "react";
import { provenanceHint } from "./provenance-words.js";
import { Hint } from "./ui/tooltip.js";

// `.wf-tag` and its modifiers in docs/design/components.css.
const tagVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs border border-line-strong bg-surface px-1.75 py-0.5 mono-label text-ink-2",
  {
    variants: {
      variant: {
        default: "",
        soft: "border-2 border-dotted px-1.5 py-px text-ink-3",
        cut: "border-signal bg-signal text-on-signal",
        rule: "border-current bg-transparent text-signal-ink",
        plain: "border-transparent bg-paper-sunken",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/** A small mono label: a rule id, a source, a certainty. `soft` is dotted, for what is unsourced. */
export function Tag({
  variant = "default",
  children,
}: VariantProps<typeof tagVariants> & { children: ReactNode }) {
  return <span className={cn(tagVariants({ variant }))}>{children}</span>;
}

/**
 * A rule's source id, the face of a Hint that says what the source is, what it anchors in Wayford
 * and its citation (#243). An id without a citation (folk, llm) is drawn soft and says so; `bare`
 * leaves "no source" to a legend that says what dotted means, as the Cast's matrix does.
 */
export function ProvenanceTag({
  provenance,
  bare = false,
}: {
  provenance: ProvenanceId;
  bare?: boolean;
}) {
  const unsourced = isUnsourced(provenance);
  const text = unsourced && !bare ? `${provenance} · no source` : provenance;
  return (
    <Hint
      label={`Explain ${text}`}
      hint={provenanceHint(provenance)}
      face={<Tag variant={unsourced ? "soft" : "default"}>{text}</Tag>}
    />
  );
}
