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
 */
export async function settle(page: Page, timeoutMs = SETTLE_TIMEOUT_MS): Promise<void> {
  const unsettled = await page.evaluate<Unsettled | null>(settleSource(timeoutMs));
  if (unsettled !== null) {
    throw new WayfordError(unsettled.code, `the page at ${page.url()} ${unsettled.why}`);
  }
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
 * `settleScript` called with `timeoutMs`, wrapped to run in the page. `tsx` compiles with
 * `keepNames`, which wraps nested functions in `__name(…)`, a helper its module defines and the
 * page does not, so the shim defines it (`cursor.ts`, the same pattern).
 */
function settleSource(timeoutMs: number): string {
  return `(() => { const __name = (f) => f; return (${SETTLE_SCRIPT})(${JSON.stringify(timeoutMs)}); })()`;
}

/**
 * The in-page half: the document's `load` first, then the fonts, then every running animation
 * until none runs, all against one deadline. `null` once the page holds still, or why it does not.
 * Only running animations count: a paused one does not move. The `load` covers a navigation that
 * no action started, such as a script's after the quiet window: its new document can answer while
 * its images still load and its layout still moves.
 */
async function settleScript(timeoutMs: number): Promise<Unsettled | null> {
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
      if (running.length === 0) {
        // `document.fonts.ready` resolves for a face that failed too, and the set's status still
        // reads `loaded`: only the face's own status tells.
        const failed = new Set<string>();
        document.fonts.forEach((face) => {
          if (face.status === "error") failed.add(face.family);
        });
        if (failed.size === 0) return null;
        const families = [...failed].map((family) => JSON.stringify(family)).join(", ");
        return {
          code: "font_failed",
          why: `could not load ${families}; its text would be measured in a fallback font`,
        };
      }
      if (expired) return late(`still running: ${running.map(label).join(", ")}`);
      // `allSettled`, since a cancelled animation rejects `finished`. An animation that never ends
      // never finishes, so the deadline ends the wait for it.
      await Promise.race([
        Promise.allSettled(running.map((animation) => animation.finished)),
        deadline,
      ]);
      // One frame, so what the ended ones start, such as a transition on `animationend`, shows.
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  } finally {
    window.clearTimeout(timer);
  }
}
