/**
 * The one bar on every screen (`docs/DESIGN.md`, "Space, shape and layout"): the wordmark, the
 * numbered story nav, then Target and Runs, and the theme toggle. Nothing in it comes from a
 * screen's data. No sidebar and no command palette.
 */
import { Link } from "@tanstack/react-router";
import { DEMO_GOAL } from "../arena/panel-state.js";
import { useShownRace } from "../arena/shown-race.js";
import { ThemeToggle } from "./theme-toggle.js";
import { buttonVariants } from "./ui/button.js";

/**
 * The story's screens, numbered in the order the demo walks them. A screen joins once its route
 * exists. Report opens the hard goal's report, the one the demo walks. Boundary stays current on
 * `/boundary/$sweepId` and under a search, as a link is current wherever its path leads, and Race
 * on `/race/$raceId` the same way. Race leads back to the race last opened, once there is one
 * (`arena/shown-race.ts`). Runs sits apart, and Events, the m0-07 debug screen, keeps its route but
 * has no entry.
 */
export const STORY_NAV = [
  { number: "01", label: "Cast", to: "/cast" },
  { number: "02", label: "Lens", to: "/lens" },
  { number: "03", label: "Race", to: "/race" },
  { number: "04", label: "Report", to: "/report/$taskId", params: { taskId: DEMO_GOAL } },
  { number: "05", label: "Boundary", to: "/boundary" },
] as const;

// TanStack's Link marks the current page with `aria-current="page"`, so the style keys on what a
// screen reader is told. The bottom border is always 2 px, transparent until current, so the label
// does not move when it turns ink.
const NAV_LINK =
  "group inline-flex min-h-9 items-center gap-1.5 rounded-sm border-b-2 border-transparent px-3 label text-ink-2 transition-colors hover:bg-paper-sunken hover:text-ink aria-[current=page]:border-ink aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:ring-1 aria-[current=page]:ring-line";

/** "Wayford" led by a short stack of posts, one signal and two ink steps, drawn in CSS. */
function Wordmark() {
  return (
    <Link
      to="/cast"
      className="inline-flex min-h-9 items-center gap-2.5 font-display text-2xl font-bold tracking-tight text-ink"
    >
      <span aria-hidden="true" className="relative h-5.5 w-0.75 rounded-xs bg-signal">
        <span className="absolute top-1.5 left-1.25 h-5.25 w-0.5 bg-ink" />
        <span className="absolute top-3 left-2.5 h-5 w-px bg-ink-3" />
      </span>
      Wayford
    </Link>
  );
}

/** The bar. */
export function TopBar() {
  const shownRace = useShownRace();
  return (
    <header className="grid h-(--header-h) grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-(--space-6) border-b border-line bg-paper px-(--space-6)">
      <Wordmark />
      {/* On a narrow window the links scroll sideways instead of the page; the padding keeps
          focus outlines inside the scroll box. */}
      <nav aria-label="Story" className="min-w-0 overflow-x-auto p-1">
        <ul className="mx-auto flex w-max items-center gap-1">
          {STORY_NAV.map(({ number, label, ...target }) => {
            const name = (
              <>
                {/* The list gives the order, so the link's name is the screen's name alone. */}
                <span
                  aria-hidden="true"
                  className="font-mono text-ink-3 group-aria-[current=page]:text-ink"
                >
                  {number}
                </span>
                {label}
              </>
            );
            return (
              <li key={target.to}>
                {target.to === "/race" && shownRace !== undefined ? (
                  <Link to="/race/$raceId" params={{ raceId: shownRace }} className={NAV_LINK}>
                    {name}
                  </Link>
                ) : (
                  <Link {...target} className={NAV_LINK}>
                    {name}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex items-center gap-2">
        {/* A site and a goal of your own (`docs/adr/0003-any-target.md`, D6): off the story path. */}
        <Link to="/target" className={buttonVariants({ variant: "ghost" })}>
          Target
        </Link>
        <Link to="/runs" className={buttonVariants({ variant: "ghost" })}>
          Runs
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
