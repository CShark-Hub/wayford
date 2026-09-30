/**
 * Regenerates core's `measurementFixture` from `collect`: `/deliveries` at the target app's default
 * parameters, 1280 × 720. The build is served on 5174, so the fixture keeps the URL the other core
 * fixtures use; stop `pnpm dev` first.
 *
 *   pnpm --filter @wayford/filter fixture:measurement
 *
 * It writes plain JSON, and the package script then lays it out with Biome, the formatter
 * `pnpm lint` checks the fixture with.
 *
 * Boxes depend on the browser build (`packages/target-app/README.md`, "Font") and on whether a
 * scrollbar takes space: headless Playwright hides it, and a headed browser on Windows shows a
 * 15 px one. The task file's Outcome records where the committed fixture was measured.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { collect } from "../src/collect.js";
import { serveTargetApp } from "../src/serve-target-app.js";

const FIXTURE = fileURLToPath(new URL("../../core/src/fixtures/measurement.json", import.meta.url));
const PAGE = "/deliveries?contrast=2&fontPx=16&targetPx=36";

const app = await serveTargetApp({ port: 5174 });
try {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(app.origin + PAGE);
    if (!(await page.evaluate(() => document.fonts.check('16px "Inter"')))) {
      throw new Error("the bundled Inter font did not load, so the page is not measured");
    }
    const measurement = await collect(page);
    await writeFile(FIXTURE, JSON.stringify(measurement));
    console.log(`${measurement.elements.length} elements written to ${FIXTURE}`);
  } finally {
    await browser.close();
  }
} finally {
  await app.close();
}
