/// <reference lib="dom" />
/**
 * Acting: one answer of the Actor carried out on the run's page. An action on an element lands
 * inside the box the persona was shown, and the fake cursor gets there first (`docs/PLAN.md` F5
 * AC7), so what the persona clicked is what the video shows. The element is never looked up again
 * by role or name: the name the persona read may be masked, and the box it saw is the one it
 * aimed at.
 *
 * Every action but `giveUp` is watched for a navigation it starts, and the loop waits for the new
 * page to load (`Arrival`) where a failure still records where the action landed. Settling the
 * page, the screenshot and the next observation are the loop's
 * (`docs/specs/2026-10-01-s2-03-actor-loop.md`, "act.ts").
 */
import { clearTimeout, setTimeout } from "node:timers";
import {
  type Action,
  type ActorElement,
  type Bbox,
  type ElementRef,
  type Observation,
  type Viewport,
  WayfordError,
} from "@wayford/core";
import type { Frame, Page, Request } from "playwright";
import { oneLine } from "./history.js";
import type { RunContext } from "./run-context.js";

/**
 * How long an action that shows no sign of navigating is watched for one. Measured during design
 * on the served target app: a link click's navigation request came at most 1.3 ms after
 * `mouse.click` resolved, 4.1 ms with four runs in parallel, and a click on a paragraph gave no
 * sign 20 times in 20. Real time, spent by every action that does not navigate, the same for every
 * persona and seed.
 */
const NAVIGATION_QUIET_MS = 100;

/**
 * How long a page is given to take an action's input, a busy main thread, then to commit a
 * navigation the action started, a server slow to answer, then to load it: each on its own Node
 * timer, since a Playwright wait that expires is written into `trace.zip` as a failed action. Above
 * core's `MAX_WAIT_MS`, so a `wait` the schema allows is never cut.
 */
const ACTION_TIMEOUT_MS = 30_000;

/** A point in the viewport, in CSS px. */
export type Point = { x: number; y: number };

/**
 * Where an action on an element lands: the centre of the part of its box inside the viewport,
 * `[0, width) × [0, height)` in CSS px, unrounded, as `page.mouse` takes it. A box straddling the
 * fold is pressed on the part the persona could see.
 *
 * The filter shows only elements that reach into the viewport (V2, `docs/RULES.md`), so that part
 * is empty only for a box of no width or height. Then the box's centre is clamped into the
 * viewport, to its last whole pixel at most, so the action still lands on the page.
 */
export function actionPoint(box: Bbox, viewport: Viewport): Point {
  const left = Math.max(box.x, 0);
  const right = Math.min(box.x + box.width, viewport.width);
  const top = Math.max(box.y, 0);
  const bottom = Math.min(box.y + box.height, viewport.height);
  if (left < right && top < bottom) return { x: (left + right) / 2, y: (top + bottom) / 2 };
  return {
    x: Math.min(Math.max(box.x + box.width / 2, 0), viewport.width - 1),
    y: Math.min(Math.max(box.y + box.height / 2, 0), viewport.height - 1),
  };
}

/** An action carried out: the navigation it may have started, still to arrive. */
export interface Arrival {
  /**
   * Returns once the navigation the action started has committed and its page has loaded, and at
   * once when it started none, or one whose request failed with nothing committed: a `mailto:` or
   * `tel:` link, a download or a 204. Throws a `page_not_settled` `WayfordError` when it did not
   * commit within the action's timeout, or its page did not load within as long again. Removes
   * the watch's listeners either way. Call it once.
   */
  wait(): Promise<void>;
}

/**
 * Carries out one action on the run's page, and returns as soon as its input is in. The loop then
 * waits for its `Arrival`, so a page that never arrives still records where the action landed. A
 * page that does not take the input within `timeoutMs` throws `page_not_settled`; then no one
 * knows whether it landed.
 *
 * `click`, `doubleClick` and `type` aim at the element whose ref the action names in `shown`, the
 * observation the action answered: the cursor moves to its `actionPoint` and holds there, then the
 * mouse presses at that point. `type` clicks, then types its text on one line, as the history
 * reports it: a line break in it is typed as a space, never pressed as Enter, and the field is not
 * cleared first. `scroll` moves the page by 0.8 of the viewport's height at once, `back` goes back
 * a page, `wait` waits, and `giveUp` does nothing. The run context keeps the pressed point, and
 * the loop puts the real pointer back on it before the next measurement
 * (`RunContext.restorePointer`).
 *
 * A ref that `shown` lacks throws a plain `Error`, since only a bug gets one here: the loop checks
 * every answer's ref with `checkActionRef` before it acts.
 */
export async function performAction(
  run: Pick<RunContext, "page" | "moveCursor">,
  action: Action,
  shown: Observation,
  timeoutMs = ACTION_TIMEOUT_MS,
): Promise<Arrival> {
  if (action.type === "giveUp") return { wait: async () => undefined };
  const { page } = run;
  // Armed before anything reaches the page, since a navigation's request can come before
  // `mouse.click` has resolved.
  const navigation = watchNavigation(page);
  try {
    // Every call into a page whose main thread never yields waits, the mouse's included.
    if (!(await within(carryOut(run, action, shown), timeoutMs))) {
      throw notArrived(page, `did not take the action's input within ${timeoutMs} ms`);
    }
  } catch (error) {
    navigation.stop();
    throw error;
  }
  return {
    async wait() {
      try {
        // `waitForLoadState` straight after a click returns on the old document, which counts as
        // loaded until the new one commits (measured during design, 20 times in 20). So the page
        // first gets a quiet window to show that it is navigating.
        if (!(await navigation.started(NAVIGATION_QUIET_MS))) return;
        const commit = await navigation.committed(timeoutMs);
        if (commit === "failed") return;
        if (commit === "pending") {
          throw notArrived(page, `started a navigation that did not commit within ${timeoutMs} ms`);
        }
        // No Playwright timeout: `within` is the bound.
        if (!(await within(page.waitForLoadState("load", { timeout: 0 }), timeoutMs))) {
          throw notArrived(page, `did not finish loading within ${timeoutMs} ms`);
        }
      } finally {
        navigation.stop();
      }
    },
  };
}

function notArrived(page: Page, what: string): WayfordError {
  return new WayfordError("page_not_settled", `the page at ${page.url()} ${what}`);
}

/** What the action does in the page, short of waiting for a navigation it starts. */
async function carryOut(
  run: Pick<RunContext, "page" | "moveCursor">,
  action: Exclude<Action, { type: "giveUp" }>,
  shown: Observation,
): Promise<void> {
  const { page } = run;
  switch (action.type) {
    case "click":
    case "doubleClick":
    case "type": {
      const point = actionPoint(targetOf(shown, action.ref).bbox, shown.viewport);
      await run.moveCursor(point);
      if (action.type === "doubleClick") await page.mouse.dblclick(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      if (action.type === "type") await page.keyboard.type(oneLine(action.text));
      return;
    }
    case "scroll":
      // A function with nothing nested in it, so `tsx`'s `keepNames` leaves its body alone and it
      // needs none of the `__name` shim `cursor.ts` explains.
      await page.evaluate(scrollBy, action.direction);
      return;
    case "back":
      // Up to the commit only, with no Playwright timeout: the `Arrival` waits for `load` and
      // `within` bounds the input, each on a timer of ours. Not `history.back()` in the page,
      // whose navigation can destroy the evaluate's context before its answer comes back (3 runs
      // in 60 under load on Linux). `null`, and the page stays where it is, when there is no page
      // before this one.
      await page.goBack({ waitUntil: "commit", timeout: 0 });
      return;
    case "wait":
      await page.waitForTimeout(action.ms);
      return;
  }
}

/** The element the action aims at, in the observation the action answered. */
function targetOf(shown: Observation, ref: ElementRef): ActorElement {
  const element = shown.elements.find((candidate) => candidate.ref === ref);
  if (element === undefined) {
    throw new Error(`the action names ${ref}, which step ${shown.stepIndex}'s observation lacks`);
  }
  return element;
}

/**
 * The scroll, in the page. No wheel and no smooth scroll: `mouse.wheel` moved `scrollY` 16 to 37 ms
 * after it resolved (measured during design), and a smooth scroll is not in
 * `document.getAnimations()`, so the settle could wait for neither. An `instant` scroll lands in
 * the same tick. A fifth of the old view stays on screen, for context.
 */
function scrollBy(direction: "up" | "down"): void {
  const distance = Math.round(0.8 * window.innerHeight);
  window.scrollBy({ top: direction === "down" ? distance : -distance, behavior: "instant" });
}

/** The signs of the main frame navigating, watched from before an action's input. */
interface NavigationWatch {
  /** Whether a navigation has started, waiting up to `ms` for one when none has yet. */
  started(ms: number): Promise<boolean>;
  /**
   * Whether the navigation has committed, waiting up to `ms` for it when it has not yet:
   * `committed`, `failed` when its request failed with no commit within the quiet window after it,
   * or `pending` when it is still on its way at `ms`. A `failed` one is over at once: a `mailto:` or
   * `tel:` link, a download or a 204 fails its request within about 20 ms and never commits
   * (measured in the branch review), while a network error's own error page commits about 25 ms
   * after its failure.
   */
  committed(ms: number): Promise<"committed" | "failed" | "pending">;
  /** Removes the listeners. */
  stop(): void;
}

/**
 * Watches the page's main frame for a navigation: its request, which comes first and also comes
 * for a 204 or a download that never commits, its failure, and its commit (`framenavigated`),
 * which a same-document navigation fires without a request. A request or a commit means a
 * navigation has started.
 */
function watchNavigation(page: Page): NavigationWatch {
  // Each is resolved once by a listener. The executors run at once, so all are set before use.
  let start = () => {};
  const startedSign = new Promise<void>((resolve) => {
    start = resolve;
  });
  let commit = () => {};
  const committedSign = new Promise<void>((resolve) => {
    commit = resolve;
  });
  let fail = () => {};
  const failedSign = new Promise<void>((resolve) => {
    fail = resolve;
  });

  /** A navigation request of this page's main frame. */
  const navigates = (request: Request): boolean => {
    if (!request.isNavigationRequest()) return false;
    try {
      return request.frame() === page.mainFrame();
    } catch {
      // A request sent before its frame exists, as a popup's first one is, has no frame to read.
      // It is not this page navigating.
      return false;
    }
  };
  const onRequest = (request: Request): void => {
    if (navigates(request)) start();
  };
  const onRequestFailed = (request: Request): void => {
    if (navigates(request)) fail();
  };
  const onFrameNavigated = (frame: Frame): void => {
    if (frame !== page.mainFrame()) return;
    start();
    commit();
  };
  page.on("request", onRequest);
  page.on("requestfailed", onRequestFailed);
  page.on("framenavigated", onFrameNavigated);

  return {
    started: (ms) => within(startedSign, ms),
    committed: (ms) =>
      new Promise((resolve) => {
        // Every timer is cleared on the first answer, so none outlives the wait.
        let quiet: NodeJS.Timeout | undefined;
        const answer = (commit: "committed" | "failed" | "pending"): void => {
          clearTimeout(timeout);
          clearTimeout(quiet);
          resolve(commit);
        };
        const timeout = setTimeout(() => answer("pending"), ms);
        void committedSign.then(() => answer("committed"));
        void failedSign.then(() => {
          quiet ??= setTimeout(() => answer("failed"), NAVIGATION_QUIET_MS);
        });
      }),
    stop() {
      page.off("request", onRequest);
      page.off("requestfailed", onRequestFailed);
      page.off("framenavigated", onFrameNavigated);
    },
  };
}

/**
 * Whether `sign` resolves within `ms`, on a Node timer cleared either way: at once when it already
 * has, false when the time runs out first.
 */
async function within(sign: Promise<void>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([sign.then(() => true), expired]);
  } finally {
    clearTimeout(timer);
  }
}
