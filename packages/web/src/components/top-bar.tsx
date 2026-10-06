/**
 * The one bar on every screen (`docs/DESIGN.md`, "Space, shape and layout"): the wordmark, the
 * numbered story nav, then Runs, a slot for the screen's own source badge and backend tag, and the
 * theme toggle. No sidebar and no command palette.
 */
import { Link } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { ThemeToggle } from "./theme-toggle.js";
import { buttonVariants } from "./ui/button.js";

/**
 * The story's screens, numbered in the order the demo walks them. A screen joins once its route
 * exists: `s3-08` adds `04 Report` and `s3-09` adds `05 Boundary`. Runs sits apart, and Events, the
 * m0-07 debug screen, keeps its route but has no entry.
 */
export const STORY_NAV = [
  { number: "01", label: "Cast", to: "/cast" },
  { number: "02", label: "Lens", to: "/lens" },
  { number: "03", label: "Race", to: "/race" },
] as const;

// TanStack's Link marks the current page with `aria-current="page"`, so the style keys on what a
// screen reader is told. The bottom border is always 2 px, transparent until current, so the label
// does not move when it turns ink.
const NAV_LINK =
  "group inline-flex min-h-9 items-center gap-1.5 rounded-sm border-b-2 border-transparent px-3 label text-ink-2 transition-colors hover:bg-paper-sunken hover:text-ink aria-[current=page]:border-ink aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:ring-1 aria-[current=page]:ring-line";

/** The element a screen's badge and tag are drawn into, and its setter for the bar's ref. */
type Slot = { element: HTMLElement | null; setElement: (element: HTMLElement | null) => void };

const SlotContext = createContext<Slot>({ element: null, setElement: () => {} });

/** Holds the top bar's slot element, so a screen anywhere under the shell can fill it. */
export function TopBarProvider({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  return <SlotContext.Provider value={{ element, setElement }}>{children}</SlotContext.Provider>;
}

/**
 * A screen's source badge and backend tag, drawn in the top bar. They come from the screen's own
 * data, so the bar never says where data came from on its own. Nothing is drawn until the bar's
 * slot element exists: a static render draws nothing here and never calls `createPortal`.
 */
export function TopBarSlot({ children }: { children: ReactNode }) {
  const { element } = useContext(SlotContext);
  return element ? createPortal(children, element) : null;
}

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

/** The bar. Its slot element is registered with the provider through its ref. */
export function TopBar() {
  const { setElement } = useContext(SlotContext);
  return (
    <header className="grid h-(--header-h) grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-(--space-6) border-b border-line bg-paper px-(--space-6)">
      <Wordmark />
      {/* On a narrow window the links scroll sideways instead of the page; the padding keeps
          focus outlines inside the scroll box. */}
      <nav aria-label="Story" className="min-w-0 overflow-x-auto p-1">
        <ul className="mx-auto flex w-max items-center gap-1">
          {STORY_NAV.map(({ number, label, to }) => (
            <li key={to}>
              <Link to={to} className={NAV_LINK}>
                {/* The list gives the order, so the link's name is the screen's name alone. */}
                <span
                  aria-hidden="true"
                  className="font-mono text-ink-3 group-aria-[current=page]:text-ink"
                >
                  {number}
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex items-center gap-2">
        <Link to="/runs" className={buttonVariants({ variant: "ghost" })}>
          Runs
        </Link>
        <div ref={setElement} data-slot="top-bar-slot" className="flex items-center gap-2" />
        <ThemeToggle />
      </div>
    </header>
  );
}
