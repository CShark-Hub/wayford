/**
 * The URL contract from `tasks/m0-06-target-app.md`, extended by `tasks/s1-04-target-app-routes.md`.
 * Paths are fixed; the task fixtures in `@wayford/core` are written against them.
 */

export interface Page {
  path: string;
  /** HTML file, relative to the package root, that Vite serves for `path`. */
  file: string;
}

export const PAGES: readonly Page[] = [
  { path: "/", file: "index.html" },
  { path: "/account", file: "account.html" },
  { path: "/account/address", file: "account/address.html" },
  { path: "/deliveries", file: "deliveries.html" },
  { path: "/deliveries/archive", file: "deliveries/archive.html" },
  { path: "/settings", file: "settings.html" },
  { path: "/settings/data", file: "settings/data.html" },
];

export interface Goal {
  id: "easy" | "hard";
  /** Documentation only: the goal sentence from the contract, mirrored in core `tasks.json`. */
  sentence: string;
  /** Playwright glob for `urlMatches`. */
  pattern: string;
  path: string;
}

/** A copy of the two tasks in core `tasks.json`, easy first. `goals.test.ts` keeps them equal. */
export const GOALS: readonly Goal[] = [
  {
    id: "easy",
    sentence: "you want to know where your next parcel is going",
    pattern: "**/account/address",
    path: "/account/address",
  },
  {
    id: "hard",
    sentence: "you want to see what you ordered three months ago",
    pattern: "**/deliveries/archive",
    path: "/deliveries/archive",
  },
];

export interface RouteStep {
  /** The page the step is taken on: a path in PAGES. */
  page: string;
  role: "link" | "button" | "menuitem";
  /** Accessible name, as `getByRole` finds it. */
  name: string;
}

export interface Route {
  id: "A" | "B" | "C";
  /**
   * Home to the archive, in click order at desktop width. On a phone the nav sits behind the
   * Menu toggle, so routes A and C start with it there. The last step links to the archive, and
   * its page is the one the route reaches the archive from: distinct per route, so s2-11 reads a
   * run's route off it.
   */
  steps: readonly RouteStep[];
}

/**
 * The three routes to the hard goal, each testing a different dimension (docs/RULES.md, route
 * table). Each route's last step names the page it reaches the archive from. `pages.test.ts`
 * walks them.
 */
export const ROUTES: readonly Route[] = [
  {
    id: "A",
    steps: [
      { page: "/", role: "link", name: "Deliveries" },
      { page: "/deliveries", role: "link", name: "Order archive" },
    ],
  },
  {
    id: "B",
    steps: [
      { page: "/", role: "link", name: "Your account" },
      { page: "/account", role: "button", name: "More options" },
      { page: "/account", role: "menuitem", name: "Past orders" },
    ],
  },
  {
    id: "C",
    steps: [
      { page: "/", role: "link", name: "Settings" },
      { page: "/settings", role: "link", name: "Your data" },
      { page: "/settings/data", role: "link", name: "Fulfilment ledger" },
    ],
  },
];
