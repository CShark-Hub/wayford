import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

// TanStack's Link marks the current page with `data-status="active"` and
// `aria-current="page"`, so the style keys on what a screen reader is told.
// Keyboard focus comes from the `:focus-visible` rule in `index.css`.
const NAV_LINK =
  "inline-flex h-9 items-center rounded-md px-3 font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-accent-foreground";

/**
 * The frame around every screen: the wordmark, the main navigation, then the
 * matched route inside the page's one `<main>`, so no screen can leave the
 * landmark out.
 */
export function Shell() {
  return (
    <>
      {/* The border runs edge to edge; the content keeps to the page column, `max-w-7xl`
          (`docs/DESIGN.md`, "Spacing, radius, motion"). */}
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-6 sm:gap-8">
          <Link
            to="/"
            className="inline-flex h-10 items-center rounded-md text-lg font-bold tracking-tight"
          >
            Wayford
          </Link>
          {/* On a phone the links scroll sideways instead of the page; the padding keeps focus
              outlines inside the scroll box. */}
          <nav aria-label="Main" className="-mx-1 min-w-0 overflow-x-auto px-1 py-2">
            <ul className="flex items-center gap-1 text-sm">
              <li>
                <Link to="/personas" className={NAV_LINK}>
                  Personas
                </Link>
              </li>
              <li>
                <Link to="/preview" className={NAV_LINK}>
                  Preview
                </Link>
              </li>
              <li>
                <Link to="/arena" className={NAV_LINK}>
                  Arena
                </Link>
              </li>
              <li>
                <Link to="/runs" className={NAV_LINK}>
                  Runs
                </Link>
              </li>
              <li>
                <Link to="/events" className={NAV_LINK}>
                  Events
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}

/** The route every screen's route names as its parent. */
export const rootRoute = createRootRoute({ component: Shell });
