import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

// TanStack's Link marks the current page with `data-status="active"` and
// `aria-current="page"`, so the style keys on what a screen reader is told.
// Keyboard focus comes from the `:focus-visible` rule in `index.css`.
const NAV_LINK =
  "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-accent-foreground";

/**
 * The frame around every screen: the wordmark, the main navigation, then the
 * matched route inside the page's one `<main>`, so no screen can leave the
 * landmark out.
 */
export function Shell() {
  return (
    <>
      <header className="flex h-14 items-center gap-6 border-b px-6">
        <Link to="/" className="rounded-md font-semibold tracking-tight">
          Wayford
        </Link>
        <nav aria-label="Main">
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
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}

/** The route every screen's route names as its parent. */
export const rootRoute = createRootRoute({ component: Shell });
