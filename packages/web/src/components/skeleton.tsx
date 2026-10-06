import { cn } from "cn";

/**
 * A loading block, drawn as `.wf-skel`: sunken paper with a shimmer sweeping across it. The
 * caller sizes it through `className`.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-xs bg-paper-sunken after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer after:bg-linear-to-r after:from-transparent after:via-surface/70 after:to-transparent",
        className,
      )}
    />
  );
}
