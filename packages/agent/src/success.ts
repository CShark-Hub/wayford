/**
 * A task's success, decided by the browser and never by asking the model
 * (`tasks/s2-03-actor-loop.md`, Constraints). The loop refuses a condition no run could meet
 * before its first step, arms a watch once the start page has loaded, and asks it after every
 * action (`docs/specs/2026-10-01-s2-03-actor-loop.md`, "success.ts and url-glob.ts").
 *
 * URL patterns are url-glob's dialect, Playwright 1.63's. `success.browser.test.ts` checks it
 * against Playwright's own matcher, row for row, so an upgrade that reads a glob otherwise fails
 * there.
 */
import { type SuccessCondition, WayfordError } from "@wayford/core";
import type { BrowserContext, Page, Request } from "playwright";
import { globToRegExp } from "./url-glob.js";

/**
 * How a pattern that can match a page's URL starts: with a star, which covers any scheme and
 * origin, or with the scheme of a page the loop can observe. Case counts: the browser reports a
 * scheme in lower case, and url-glob compares as written.
 */
const MATCHABLE_START = /^(?:\*|https?:\/\/)/;

/**
 * Refuses a success condition no run could meet. The loop calls it before the first step and ends
 * such a run `runFailed`, since a run that could never succeed would read as a persona who never
 * got there.
 *
 * A `urlMatches` or `requestObserved` pattern is compared with a whole absolute URL, so it must
 * start with `*`, `http://` or `https://`. Playwright resolves a relative pattern such as
 * `/account/address` against the context's `baseURL`; a run's contexts set none, so the pattern
 * would stay as written and never match. A glob that opens with a brace is refused too, even when
 * each of its alternatives starts with a star: the stars can always come first, before the
 * braces. The pattern must also compile. Either failure throws a `WayfordError` with code
 * `invalid_success_condition` naming the pattern, with url-glob's error as its cause when it did
 * not compile.
 *
 * A `selectorPresent` condition passes: only a page can tell whether its selector parses, and
 * `met` lets the page's error end the run.
 */
export function checkSuccessCondition(condition: SuccessCondition): void {
  if (condition.type === "selectorPresent") return;
  checkPattern(condition.type === "urlMatches" ? condition.pattern : condition.urlPattern);
}

/**
 * Throws when the pattern could never match a page's URL, with the reason in its message, which a
 * run's `error` carries whole.
 */
function checkPattern(pattern: string): void {
  const named = `Invalid success condition: the URL pattern ${JSON.stringify(pattern)}`;
  try {
    globToRegExp(pattern);
  } catch (error) {
    // Only url-glob's own refusal is the pattern's fault. Anything else is a bug, and stays one.
    if (!(error instanceof WayfordError)) throw error;
    throw new WayfordError(
      "invalid_success_condition",
      `${named} does not compile, so it could never match. ${error.message}`,
      { cause: error },
    );
  }
  if (!MATCHABLE_START.test(pattern)) {
    throw new WayfordError(
      "invalid_success_condition",
      `${named} does not start with "*", "http://" or "https://", so it could never match: it is compared with a page's whole URL, and a run has no base URL to resolve it against. Write it as "**/…" to match on any origin.`,
    );
  }
}

/** What the loop asks after every action, and stops at the end of the run. */
export interface SuccessWatch {
  /**
   * Whether the task's condition holds now, on the run's page, after the step whose
   * `actionPerformed.urlAfter` is `urlAfter`.
   */
  met(page: Page, urlAfter: string): Promise<boolean>;
  /** Removes the watch's listener, when it has one. */
  stop(): void;
}

/**
 * Arms a watch for the task's success on the run's context. Call it once the start page has
 * loaded, and after `checkSuccessCondition`: a glob that does not compile throws here, as
 * url-glob's `invalid_url_glob`. A glob is compiled once, here.
 *
 * - `urlMatches`: whether the glob accepts `urlAfter`, never a fresh `page.url()`, so success can
 *   be derived again from the record.
 * - `selectorPresent`: whether `document.querySelector` finds an element in the page now. That is
 *   plain CSS over the top document's light DOM, the collector's scope (`measure-page.ts`, in
 *   filter). `page.locator` would also take Playwright's own `text=`, XPath and `>>` forms, and
 *   pierce open shadow roots. A selector that is not CSS makes `met` reject with the page's
 *   `SyntaxError`, which ends the run.
 * - `requestObserved`: whether the context has sent, since this call, a request with the
 *   condition's method whose whole URL, query included, the glob accepts. Requests sent before it,
 *   the start page's load among them, never count; any request after it does, one a page sends by
 *   itself included, such as a poll or a lazy fetch, even before the first action. So the pattern
 *   must name a request that only an action sends. A popup's requests reach the context's
 *   listener too.
 */
export function watchSuccess(context: BrowserContext, condition: SuccessCondition): SuccessWatch {
  switch (condition.type) {
    case "urlMatches": {
      const glob = globToRegExp(condition.pattern);
      return { met: async (_page, urlAfter) => glob.test(urlAfter), stop() {} };
    }
    case "selectorPresent": {
      // An expression, not a function's source: `tsx` compiles with `keepNames`, whose `__name`
      // wrappers the page does not define (`cursor.ts`). JSON quotes any selector as a string
      // literal.
      const present = `document.querySelector(${JSON.stringify(condition.selector)}) !== null`;
      return { met: (page) => page.evaluate<boolean>(present), stop() {} };
    }
    case "requestObserved": {
      const { method } = condition;
      const glob = globToRegExp(condition.urlPattern);
      let seen = false;
      // Never `request.frame()`: a popup's first request is sent before its frame exists, and
      // reading it throws (measured during the build).
      const onRequest = (request: Request): void => {
        seen ||= request.method() === method && glob.test(request.url());
      };
      context.on("request", onRequest);
      return {
        met: async () => seen,
        stop() {
          context.off("request", onRequest);
        },
      };
    }
  }
}
