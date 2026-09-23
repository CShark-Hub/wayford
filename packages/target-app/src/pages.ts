/**
 * The URL contract from `tasks/m0-06-target-app.md`. Paths are fixed; the task fixtures in
 * `@wayford/core` are written against them.
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
];

export interface Goal {
  id: "easy" | "hard";
  /** Documentation only: the goal sentence from the contract, mirrored in core `tasks.json`. */
  sentence: string;
  /** Playwright glob for `urlMatches`. */
  pattern: string;
  path: string;
}

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
