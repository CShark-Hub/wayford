/**
 * The target app, built and served for the filter's browser tests and its fixture script.
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
import { build, preview } from "vite";

const root = fileURLToPath(new URL("../../target-app/", import.meta.url));

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

export interface TargetApp {
  /** Like `http://localhost:51234`, with no trailing slash. */
  origin: string;
  close(): Promise<void>;
}

export async function serveTargetApp(options: { port?: number } = {}): Promise<TargetApp> {
  const port = options.port ?? 0;
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
