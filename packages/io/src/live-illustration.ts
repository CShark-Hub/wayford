/**
 * The Lens's Illustration view, taken live (s3-06, `docs/PLAN.md` F2 AC4): the target app's
 * `/deliveries` at its default parameters, opened on a persona's device as the preview's
 * measurement opens it (`withOwnContext`), and screenshot under Chrome's own vision emulation,
 * CDP `Emulation.setEmulatedVisionDeficiency`, the call a run makes for its step screenshots
 * (`run-context.ts`, P6). `routes/illustration.ts` keeps what this returns.
 *
 * The picture is an illustration, never a decision: nothing here is measured, and nothing it
 * returns reaches `perceive`, the counts or the drawing.
 *
 * It stays out of io's barrel, as `live-measure.ts` does: it loads agent's runtime and Playwright.
 * Outside its tests, `server.ts` and the capture CLI, `illustration-cli.ts`, are its only importers.
 */
import { startUrlFor, TARGET_APP_DEFAULTS } from "@wayford/agent";
import type { SharedBrowser } from "./chromium.js";
import { withOwnContext } from "./live-measure.js";
import type { IllustrateFn } from "./routes/illustration.js";

/** The one page the Lens pictures (`tasks/s3-06-illustration-view.md`, Out of scope). */
const PICTURED_PATH = "/deliveries";

/**
 * How long a whole capture may take on Node's clock: one page load and one screenshot, the same
 * order of work as a measurement, which gets 15 s.
 */
export const ILLUSTRATE_TIMEOUT_MS = 15_000;

/**
 * Pictures `/deliveries` with a context of its own on the shared browser, closed once the
 * screenshot is taken or the capture runs out of time. Every failure it knows is a `WayfordError`,
 * worded "picturing", which the route answers with a 502: `target_app_unavailable`,
 * `page_not_settled`, `font_failed` and `browser_failed`, as `withOwnContext` has them.
 */
export function liveIllustration({
  browser,
  origin,
}: {
  browser: SharedBrowser;
  /** The target app's origin, like `http://localhost:5174`, with no trailing slash. */
  origin: string;
}): IllustrateFn {
  const url = startUrlFor({ startUrl: `${origin}${PICTURED_PATH}` }, TARGET_APP_DEFAULTS);
  return (device, emulation) =>
    withOwnContext(
      {
        browser,
        device,
        url,
        path: PICTURED_PATH,
        work: "picturing",
        timeoutMs: ILLUSTRATE_TIMEOUT_MS,
      },
      async (page) => {
        // `none` is sent too, so every persona takes one path, as a run sends it. Unlike a run,
        // which sets it before `goto`, this sets it on the loaded page: the emulation is a render
        // effect, and the browser test's byte comparison shows the picture carries it. The
        // session stays attached until the screenshot is taken, since detaching it clears the
        // emulation; it ends with the context.
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setEmulatedVisionDeficiency", { type: emulation });
        // The viewport only, at CSS pixels, as a run's step screenshot is taken.
        return page.screenshot({ scale: "css" });
      },
    );
}
