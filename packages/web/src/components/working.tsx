import { cn } from "cn";
import type { ReactNode } from "react";

/**
 * The three posts, tallest first as the wordmark stacks them, each with how far into the turn it
 * starts: a third of a turn behind the one before, so the dip runs left to right.
 */
const POSTS = [
  { height: "h-5", ink: "bg-ink", delay: "0s" },
  { height: "h-4", ink: "bg-ink-2", delay: "-0.8s" },
  { height: "h-3", ink: "bg-ink-3", delay: "-0.4s" },
] as const;

/**
 * A job under way (`docs/DESIGN.md`, "States"), drawn as `.wf-working`: the wordmark's three posts
 * standing in a water line, sinking and rising in turn like a depth gauge, then the line that says
 * what runs. The posts are a picture; the line is what a screen reader hears, so the caller's
 * status region reads the same with or without them. Under reduced motion the posts stand still, a
 * short stack like the wordmark's.
 */
export function Working({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn("flex items-center gap-(--space-3)", className)}>
      <span
        aria-hidden="true"
        data-slot="working"
        className="flex shrink-0 items-end gap-0.75 border-b border-line-strong px-0.5"
      >
        {POSTS.map(({ height, ink, delay }) => (
          <span
            key={height}
            className={cn("w-0.75 origin-bottom animate-working rounded-t-xs", height, ink)}
            style={{ animationDelay: delay }}
          />
        ))}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
