/**
 * The one bar on every screen (`docs/DESIGN.md`, "Space, shape and layout"): the wordmark, the
 * numbered story nav, which carries the current target, then Runs, and the theme toggle. Nothing in
 * it comes from a screen's data. No sidebar and no command palette.
 */
import { Link, linkOptions } from "@tanstack/react-router";
import type { RaceId } from "@wayford/core";
import { useShownRace } from "../arena/shown-race.js";
import { type TargetLinks, targetLinks, useCurrentTarget } from "../target/current-target.js";
import { ThemeToggle } from "./theme-toggle.js";
import { buttonVariants } from "./ui/button.js";

/** Where Target, Lens, Race and Report lead with no current target, as `targetLinks` gives them. */
const NO_TARGET = targetLinks(undefined);

/**
 * The story's screens, numbered in the order the demo walks them, Target first at 00, where a site
 * and a goal of your own are picked (`docs/adr/0003-any-target.md`). A screen joins once its route
 * exists. Each entry's link is where it leads with no current target, the four that carry one taken
 * from `targetLinks`: Report opens the hard goal's report, the one the demo walks. Once the Target
 * screen has opened a goal, the entries marked `carries` lead to that goal instead
 * (`target/current-target.ts`), and Cast and Boundary stay as they are. Race leads back to the race
 * last opened, once there is one (`arena/shown-race.ts`), and that wins over the goal. Every entry
 * is current wherever its path leads, whatever the search: Boundary on `/boundary/$sweepId` and
 * under a preset, Race on `/race/$raceId`, Target on another goal's view. Runs sits apart, and
 * Events, the m0-07 debug screen, keeps its route but has no entry.
 */
export const STORY_NAV = [
  { number: "00", label: "Target", carries: "target", ...NO_TARGET.target },
  { number: "01", label: "Cast", to: "/cast" },
  { number: "02", label: "Lens", carries: "lens", ...NO_TARGET.lens },
  { number: "03", label: "Race", carries: "race", ...NO_TARGET.race },
  { number: "04", label: "Report", carries: "report", ...NO_TARGET.report },
  { number: "05", label: "Boundary", to: "/boundary" },
] as const;

type StoryEntry = (typeof STORY_NAV)[number];

/**
 * Where an entry leads: Race to the race last opened, if one is shown; an entry that carries the
 * target through `targetLinks`, which gives its own link when there is no target; Cast and Boundary
 * to their own.
 */
function linkOf(entry: StoryEntry, links: TargetLinks, shownRace: RaceId | undefined) {
  if (entry.to === "/race" && shownRace !== undefined) {
    return linkOptions({ to: "/race/$raceId", params: { raceId: shownRace } });
  }
  if ("carries" in entry) return links[entry.carries];
  const { number: _number, label: _label, ...own } = entry;
  return own;
}

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
  const current = useCurrentTarget();
  const links = targetLinks(current);
  // The host with its port, so two targets on one machine read apart.
  const host = current === undefined ? undefined : new URL(current.startUrl).host;
  return (
    <header className="grid h-(--header-h) grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-(--space-6) border-b border-line bg-paper px-(--space-6)">
      <Wordmark />
      {/* On a narrow window the links scroll sideways instead of the page; the padding keeps
          focus outlines inside the scroll box. */}
      <nav aria-label="Story" className="min-w-0 overflow-x-auto p-1">
        <ul className="mx-auto flex w-max items-center gap-1">
          {STORY_NAV.map((entry) => (
            <li key={entry.to}>
              {/* Current on its path whatever the search, so a link that carries the target
                  is still current on its screen under another one, or none. */}
              <Link
                {...linkOf(entry, links, shownRace)}
                activeOptions={{ includeSearch: false }}
                className={NAV_LINK}
              >
                {/* The list gives the order, so the link's name is the screen's name alone,
                    and Target's the host it carries after it. */}
                <span
                  aria-hidden="true"
                  className="font-mono text-ink-3 group-aria-[current=page]:text-ink"
                >
                  {entry.number}
                </span>
                {entry.label}
                {"carries" in entry && entry.carries === "target" && host !== undefined && (
                  <>
                    {" "}
                    {/* A long host is cut, and its title holds the whole of it. */}
                    <span title={host} className="max-w-36 truncate font-mono">
                      {host}
                    </span>
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex items-center gap-2">
        <Link to="/runs" className={buttonVariants({ variant: "ghost" })}>
          Runs
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
