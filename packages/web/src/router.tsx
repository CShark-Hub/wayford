import { createRoute, createRouter, type RouterHistory, redirect } from "@tanstack/react-router";
import { arenaRoute } from "./screens/arena.js";
import { eventsRoute } from "./screens/events.js";
import { lensRoute } from "./screens/lens.js";
import { personasRoute } from "./screens/personas.js";
import { runDetailRoute } from "./screens/run-detail.js";
import { runsRoute } from "./screens/runs.js";
import { rootRoute } from "./shell.js";

/** `/` has no screen of its own: the app opens where the story starts, the Cast. */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/cast" });
  },
});

// Each screen file exports its own route. A later screen adds its route file and one entry here.
const routeTree = rootRoute.addChildren([
  indexRoute,
  arenaRoute,
  eventsRoute,
  personasRoute,
  lensRoute,
  runsRoute,
  runDetailRoute,
]);

/**
 * The app's router. The page passes no history and gets the browser's; a test passes a memory
 * history to render one path.
 */
export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({ routeTree, ...options });
}

// Registering the router types every `Link`, `redirect` and `useSearch` against the routes above,
// search params included, so a link to a path that does not exist fails the typecheck.
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
