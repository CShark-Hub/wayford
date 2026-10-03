/**
 * The target app, built and served for the filter's browser tests and its scripts.
 *
 * A production build, not the dev server: seeded runs use a build (`docs/STACK.md`, "Target
 * app"), since Vite's dev client can restyle or reload a page in the middle of a run. Port 0 lets
 * the OS pick a free port, so a test never collides with a developer's `pnpm dev` on 5174. Any
 * other port is strict, so a taken 5174 fails instead of moving.
 *
 * The app is found by path and never imported: no package may import `target-app` (`biome.json`).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DeviceKind } from "@wayford/core";

const root = fileURLToPath(new URL("../../target-app/", import.meta.url));

/** The Playwright descriptor each device kind is emulated with (rule V1, `docs/RULES.md`). */
export const DEVICE_DESCRIPTORS = {
  desktop: "Desktop Chrome",
  tablet: "Galaxy Tab S4",
  mobile: "Pixel 7",
} as const satisfies Record<DeviceKind, string>;

/**
 * The target app's page paths, in the order of `PAGES` in its `src/pages.ts`, written out: filter
 * may not import target-app. `target-app-routes.browser.test.ts` keeps the two equal.
 */
export const TARGET_APP_PATHS: readonly string[] = [
  "/",
  "/account",
  "/account/address",
  "/deliveries",
  "/deliveries/archive",
  "/settings",
  "/settings/data",
];

/** The app's defaults as a query (`packages/target-app/README.md`, "Parameters"). */
export const TARGET_APP_DEFAULT_QUERY = "?contrast=2&fontPx=16&targetPx=36";

/** One step of a route: the page it is taken on and the control taken there, by role and name. */
export interface TargetAppRouteStep {
  /** A path in `TARGET_APP_PATHS`. */
  page: string;
  role: "link" | "button" | "menuitem";
  /** Accessible name, as `getByRole` finds it. */
  name: string;
}

export interface TargetAppRoute {
  id: "A" | "B" | "C";
  /** Home to the archive, in click order at desktop width. */
  steps: readonly TargetAppRouteStep[];
}

/**
 * The three routes to the hard goal, a copy of `ROUTES` in target-app's `src/pages.ts`: filter may
 * not import target-app. `routes.browser.test.ts` keeps the two equal. On a phone the nav sits
 * behind the Menu toggle, which the walk in `route-walk.ts` goes through; the copy, like its
 * source, leaves the toggle out.
 */
export const TARGET_APP_ROUTES: readonly TargetAppRoute[] = [
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

export interface TargetApp {
  /** Like `http://localhost:51234`, with no trailing slash. */
  origin: string;
  close(): Promise<void>;
}

export async function serveTargetApp(options: { port?: number } = {}): Promise<TargetApp> {
  const port = options.port ?? 0;
  // Loaded here, not at the top: agent's main entry imports `DEVICE_DESCRIPTORS` from this file,
  // and Vite, a devDependency, stays out of it and out of io's server.
  const { build, preview } = await import("vite");
  // A fresh directory per call, so the build never writes into packages/target-app. Vite reads
  // the app's own `vite.config.ts` from `root`.
  const outDir = await mkdtemp(join(tmpdir(), "wayford-target-app-"));
  const config = { root, logLevel: "silent" as const, build: { outDir } };
  const removeBuild = () => rm(outDir, { recursive: true, force: true });
  try {
    await build(config);
    // Vite never reads `strictPort` for port 0.
    const server = await preview({ ...config, preview: { port, strictPort: true } });
    const url = server.resolvedUrls?.local[0];
    if (url === undefined) {
      await server.close();
      throw new Error("the target app's preview server reported no local URL");
    }
    return {
      origin: url.replace(/\/$/, ""),
      close: async () => {
        await server.close();
        await removeBuild();
      },
    };
  } catch (error) {
    await removeBuild();
    throw error;
  }
}
