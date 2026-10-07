/// <reference lib="dom" />
/**
 * The page holds still before it is measured (`tasks/s2-03-actor-loop.md`, Constraints): its fonts
 * are loaded and no animation or transition runs. In the s1-02 review a one-second colour
 * animation measured one key at contrast 1.16, 2.46 and 21 at three delays, so one run seed gave
 * three perception decisions. A measurement that a navigation cuts off is taken again on the new
 * page (`retryOnNavigation`).
 *
 * `settleScript` reaches the page as source, so it is one self-contained function, as
 * `cursor.ts`'s is (`docs/specs/2026-10-01-s2-03-actor-loop.md`, "settle.ts").
 *
 * Off the target app `settle` is lenient (`docs/adr/0003-any-target.md`, D4): a font that failed
 * is noted, since a real person sees the fallback too, and an animation that waiting cannot end is
 * not waited on: one that repeats forever, or one the scroll position drives, such as a reading
 * progress bar. That costs a claim. An element that animates forever is measured at whatever frame
 * it is in, so on such a page the seed no longer fixes that measurement. A scroll-driven one
 * follows the scroll, which the run's own actions set. On the target app `settle` stays strict:
 * the calibration depends on it.
 */
import { WayfordError } from "@wayford/core";
import type { Page } from "playwright";

/**
 * How long a page may take to settle: `font-display: block`'s period, the longest a browser hides
 * text while its font loads. A page still moving then fails the run, since measuring it would
 * decide on a frame picked by timing.
 */
export const SETTLE_TIMEOUT_MS = 3000;

/**
 * How long one attempt of `retryOnNavigation` may take in all, on Node's clock: the settle's own
 * deadline, then room for the measurement or the screenshot after it. A page whose main thread
 * never yields cannot answer at all, so its own deadline never fires, and every call into it waits.
 */
const ATTEMPT_TIMEOUT_MS = SETTLE_TIMEOUT_MS + 5000;

/**
 * Three attempts in all, so a navigation that lands during a measurement is measured on the new
 * page, and a page that keeps navigating still ends the run.
 */
const NAVIGATION_ATTEMPTS = 3;

/**
 * What Playwright and Chromium say when a navigation replaced the document an attempt was
 * evaluating in, or took its frame away.
 */
const NAVIGATED_AWAY =
  /execution context was destroyed|cannot find context with specified id|frame was detached/i;

/** Why the page did not settle, written in the page, after "the page at <url>". */
interface Unsettled {
  code: "page_not_settled" | "font_failed";
  why: string;
}

/** What a lenient `settle` did not wait on. Both lists are empty on the strict path. */
export interface Skipped {
  /** The families of the font faces that failed to load, quoted, as `font_failed` names them. */
  failedFonts: string[];
  /**
   * The animations waiting cannot end, those that repeat forever or that the scroll position
   * drives, as the deadline's message names them.
   */
  endlessAnimations: string[];
}

export interface SettleOptions {
  /**
   * Off the target app: a failed font face, and an animation whose iteration count is infinite
   * or whose timeline is not the document's (a scroll-driven one), are skipped and returned, not
   * errors. Strict when absent.
   */
  lenient?: boolean;
  /** `SETTLE_TIMEOUT_MS` when absent. */
  timeoutMs?: number;
}

/**
 * Waits until the page's document has loaded, its fonts are loaded and no animation or transition
 * runs, for at most `timeoutMs`. Call it before every `collect`, and before the screenshot after
 * an action, inside `retryOnNavigation`, which bounds a page that never answers.
 *
 * A page that cannot settle throws a `WayfordError`: `page_not_settled` for what still runs or
 * loads at the deadline, an animation that never ends included, and `font_failed` for a font face
 * that failed to load, whose text would be measured in a fallback font. Playwright's own errors,
 * such as a destroyed context when the page navigates meanwhile, pass through for
 * `retryOnNavigation`.
 *
 * `lenient` skips the failed faces and the endless animations instead, and returns them for the
 * caller to log. Loading and every other animation keep the deadline.
 */
export async function settle(page: Page, options: SettleOptions = {}): Promise<Skipped> {
  const { lenient = false, timeoutMs = SETTLE_TIMEOUT_MS } = options;
  const settled = await page.evaluate<Unsettled | Skipped>(settleSource(timeoutMs, lenient));
  if ("code" in settled) {
    throw new WayfordError(settled.code, `the page at ${page.url()} ${settled.why}`);
  }
  return settled;
}

/**
 * Runs `attempt`, and runs it again on the new page when a navigation came in the middle of it:
 * one that lands after the action's quiet window (`act.ts`). Every measurement then comes from one
 * document, settled before it was read. Three attempts in all; any other error is rethrown.
 *
 * A navigation shows in one of two ways. It cuts the attempt off, and `settle` or `collect` throws
 * a raw "Execution context was destroyed". Or the new document commits between two of the
 * attempt's calls, after `settle` answered and before `collect` read, and nothing throws: the
 * read then measured a page that never settled. So each attempt notes its document,
 * `performance.timeOrigin`, which every document has of its own, before and after, and a change
 * counts as a navigation too. A third attempt that still sees one throws `page_not_settled`.
 *
 * Before a second or third attempt it waits in the page for `document.readyState` to read
 * `complete`, not with `waitForLoadState`: the destroyed context's error can reach Node before
 * Playwright has seen the navigation, and `waitForLoadState` then answers at once from the old
 * document's `load`. `waitForFunction` polls inside the page and follows it to the new document.
 *
 * Each attempt, that wait and both notes included, must answer within `timeoutMs` on Node's clock,
 * or it throws `page_not_settled`: every call into a page whose main thread never yields waits, and
 * so does one into a page whose navigation has not committed yet.
 */
export async function retryOnNavigation<T>(
  page: Page,
  attempt: () => Promise<T>,
  timeoutMs = ATTEMPT_TIMEOUT_MS,
): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      const measured = await answered(page, timeoutMs, async () => {
        if (n > 1) {
          // No Playwright timeout: the race around it is the bound, and a Playwright wait that
          // expires is written into the trace as a failed action.
          await page.waitForFunction("document.readyState === 'complete'", undefined, {
            timeout: 0,
          });
        }
        const before = await documentOf(page);
        const result = await attempt();
        return { result, navigated: (await documentOf(page)) !== before };
      });
      if (!measured.navigated) return measured.result;
      if (n === NAVIGATION_ATTEMPTS) {
        throw new WayfordError(
          "page_not_settled",
          `the page at ${page.url()} kept navigating while it was measured`,
        );
      }
    } catch (error) {
      if (n === NAVIGATION_ATTEMPTS || !navigatedAway(error)) throw error;
    }
  }
}

/**
 * What `work` gives, or a `page_not_settled` error once `ms` have passed on Node's clock, whichever
 * comes first. Its result or error after that reaches only this race, which is over by then and
 * drops it. The work itself is not cancelled: it runs on until the run's context closes, and an
 * abandoned post-action attempt may still write the step's screenshot, which the record does not
 * name.
 */
async function answered<T>(page: Page, ms: number, work: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const message = `the page at ${page.url()} did not answer within ${ms} ms`;
      reject(new WayfordError("page_not_settled", message));
    }, ms);
  });
  try {
    return await Promise.race([work(), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/** The document the page shows now: its time origin, which no other document shares. */
function documentOf(page: Page): Promise<number> {
  return page.evaluate<number>("performance.timeOrigin");
}

function navigatedAway(error: unknown): boolean {
  return error instanceof Error && NAVIGATED_AWAY.test(error.message);
}

// The in-page half's source, read once.
const SETTLE_SCRIPT = settleScript.toString();

/**
 * `settleScript` called with `timeoutMs` and `lenient`, wrapped to run in the page. `tsx` compiles
 * with `keepNames`, which wraps nested functions in `__name(…)`, a helper its module defines and
 * the page does not, so the shim defines it (`cursor.ts`, the same pattern).
 */
function settleSource(timeoutMs: number, lenient: boolean): string {
  return `(() => { const __name = (f) => f; return (${SETTLE_SCRIPT})(${JSON.stringify(timeoutMs)}, ${JSON.stringify(lenient)}); })()`;
}

/**
 * The in-page half: the document's `load` first, then the fonts, then every running animation
 * until none runs, all against one deadline. What was skipped once the page holds still, or why
 * it does not. Only running animations count: a paused one does not move. The `load` covers a
 * navigation that no action started, such as a script's after the quiet window: its new document
 * can answer while its images still load and its layout still moves. `lenient` sets the endless
 * animations aside and takes failed faces as settled.
 */
async function settleScript(timeoutMs: number, lenient: boolean): Promise<Unsettled | Skipped> {
  let expired = false;
  let timer: number | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = window.setTimeout(() => {
      expired = true;
      resolve();
    }, timeoutMs);
  });
  const late = (what: string): Unsettled => ({
    code: "page_not_settled",
    why: `did not settle within ${timeoutMs} ms: ${what}`,
  });
  // A CSS animation by its name, a transition by its property, any other animation by its id.
  const label = (animation: Animation): string => {
    const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
    const on = target === null ? "" : ` on <${target.localName}>`;
    if (animation instanceof CSSAnimation) {
      return `animation ${JSON.stringify(animation.animationName)}${on}`;
    }
    if (animation instanceof CSSTransition) {
      return `transition of ${JSON.stringify(animation.transitionProperty)}${on}`;
    }
    return animation.id === ""
      ? `an animation with no id${on}`
      : `animation ${JSON.stringify(animation.id)}${on}`;
  };
  // Waiting cannot end it: it repeats forever, or the scroll position drives it, not the clock,
  // so it runs until the page is scrolled to its end. An animation with no effect has no
  // iterations, so only its timeline can make it endless.
  const isEndless = (animation: Animation): boolean =>
    !(animation.timeline instanceof DocumentTimeline) ||
    animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY;
  // Set aside when lenient, and named only at the end.
  const endless = new Set<Animation>();

  try {
    if (document.readyState !== "complete") {
      // Added in the same task as the check, so a `load` cannot slip in between.
      const loaded = new Promise<void>((resolve) => {
        window.addEventListener("load", () => resolve(), { once: true });
      });
      await Promise.race([loaded, deadline]);
      if (expired) return late("it is still loading");
    }
    await Promise.race([document.fonts.ready, deadline]);
    if (expired) return late("its fonts are still loading");
    for (;;) {
      const running = document
        .getAnimations()
        .filter((animation) => animation.playState === "running");
      // What the loop waits on: every running animation when strict, the finite ones when lenient.
      const waited: Animation[] = [];
      for (const animation of running) {
        if (lenient && isEndless(animation)) endless.add(animation);
        else waited.push(animation);
      }
      if (waited.length === 0) {
        // `document.fonts.ready` resolves for a face that failed too, and the set's status still
        // reads `loaded`: only the face's own status tells.
        const failed = new Set<string>();
        document.fonts.forEach((face) => {
          if (face.status === "error") failed.add(face.family);
        });
        const families = [...failed].map((family) => JSON.stringify(family));
        if (failed.size === 0 || lenient) {
          // A label once, however many animations share it.
          const endlessAnimations = [...new Set([...endless].map(label))];
          return { failedFonts: families, endlessAnimations };
        }
        return {
          code: "font_failed",
          why: `could not load ${families.join(", ")}; its text would be measured in a fallback font`,
        };
      }
      if (expired) return late(`still running: ${waited.map(label).join(", ")}`);
      // `allSettled`, since a cancelled animation rejects `finished`. An animation that never ends
      // never finishes, so the deadline ends the wait for it.
      await Promise.race([
        Promise.allSettled(waited.map((animation) => animation.finished)),
        deadline,
      ]);
      // One frame, so what the ended ones start, such as a transition on `animationend`, shows.
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  } finally {
    window.clearTimeout(timer);
  }
}
