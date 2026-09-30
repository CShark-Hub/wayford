/**
 * The run context on the real target app, run by hand: Vera takes two scripted steps, and the
 * files she leaves are the ones the reviewer opens. The `webm` shows the cursor before each click,
 * and the `trace.zip` opens in `playwright show-trace`. The tests delete theirs.
 *
 * It is no Actor loop: the two links are fixed, and nothing is observed or decided. Each step
 * runs in core's order (the cursor to the link, the click at that point, then the post-action
 * screenshot), since this is the one worked example of the handle.
 *
 * `pnpm --filter @wayford/agent smoke:run [directory]`, a fresh temporary directory by default.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WayfordError } from "@wayford/core";
import { profileFixture, taskFixture } from "@wayford/core/fixtures";
import { serveTargetApp } from "@wayford/filter/serve-target-app";
import { chromium } from "playwright";
import { openRunContext, type RunContext } from "./run-context.js";
import { TARGET_APP_DEFAULTS } from "./start-url.js";

/** Moves the cursor to a link's centre, clicks there, waits for the next page and shoots it. */
async function step(run: RunContext, index: number, name: string): Promise<string> {
  const box = await run.page.getByRole("link", { name, exact: true }).boundingBox();
  if (box === null) throw new Error(`no "${name}" link on ${run.page.url()}`);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await run.moveCursor(point);
  await Promise.all([run.page.waitForEvent("load"), run.page.mouse.click(point.x, point.y)]);
  return run.screenshot(index);
}

const outputDir = process.argv[2]
  ? resolve(process.argv[2])
  : await mkdtemp(join(tmpdir(), "wayford-smoke-run-"));
const app = await serveTargetApp();
try {
  const browser = await chromium.launch().catch((error: unknown) => {
    throw new Error(
      "Chromium did not launch. If it is not installed, run " +
        "`pnpm --filter @wayford/agent exec playwright install --only-shell chromium`.",
      { cause: error },
    );
  });
  try {
    const run = await openRunContext({
      browser,
      profile: profileFixture("prof_vera"),
      task: { ...taskFixture("task_past-order"), startUrl: `${app.origin}/deliveries` },
      seed: 7,
      runId: "run_smoke-1",
      params: TARGET_APP_DEFAULTS,
      outputDir,
    });
    console.log(`start:    ${run.startUrl}`);
    console.log(`step 0:   ${await step(run, 0, "Your account")}`);
    console.log(`step 1:   ${await step(run, 1, "Delivery address")}`);
    const { videoPath, tracePath } = await run.close();
    console.log(`video:    ${videoPath}`);
    console.log(`trace:    ${tracePath}`);
  } finally {
    await browser.close();
  }
} catch (error) {
  // Anything that is not a `WayfordError` is a bug, printed whole with its stack.
  if (error instanceof WayfordError) console.error(`${error.code}: ${error.message}`);
  else console.error(error);
  process.exitCode = 1;
} finally {
  await app.close();
}
