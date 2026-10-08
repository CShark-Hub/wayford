/// <reference lib="dom" />
/**
 * The fake cursor of `docs/PLAN.md` F5 AC7: a dot the page draws where the next click lands, so
 * it appears in the video and the step screenshots. A headless browser draws no pointer.
 *
 * It stays out of the collector and the accessibility tree. It hangs off `<html>`, outside the
 * `body *` the collector walks, and carries `aria-hidden`, which the collector skips. It has no
 * role, no `tabindex` and no `id`, since the collector resolves `aria-labelledby` referents by id.
 * Clicks pass through it. It never moves smoothly or pulses: s2-03 settles a page on
 * `document.getAnimations()` being empty, over the whole document.
 *
 * `cursorScript` reaches the page as source, so it is one self-contained function
 * (`docs/specs/2026-09-30-s2-02-evidence-capture.md`, "cursor.ts").
 */
import type { BrowserContext, Page } from "playwright";

/**
 * How long a move holds the cursor before the click: about six frames of Playwright's 25 fps
 * video, so the webm shows the cursor before the click lands. It is no seeded decision. It adds
 * 250 ms per move to the run's wall clock, which `durationMs` measures, the same for every persona
 * and seed. B3 does not budget it: B3 reads the simulated clock (`simulated-time.ts`), which times
 * the move by Fitts's law.
 */
export const CURSOR_HOLD_MS = 250;

/**
 * Registers the cursor on every document the context opens, before the page's own scripts. It
 * stays hidden until `showCursor` places it.
 */
export async function installCursor(context: BrowserContext): Promise<void> {
  await context.addInitScript({ content: cursorSource(null) });
}

/**
 * Puts the cursor's centre on a viewport point. It makes the cursor when the document holds none
 * yet, as before DOMContentLoaded, while the init script still waits for it.
 */
export async function showCursor(page: Page, point: { x: number; y: number }): Promise<void> {
  await page.evaluate(cursorSource(point));
}

// The in-page half's source, read once.
const CURSOR_SCRIPT = cursorScript.toString();

/**
 * `cursorScript` called with `point`, wrapped to run in the page. `tsx` compiles with
 * `keepNames`, which wraps nested functions in `__name(…)`, a helper its module defines and the
 * page does not, so the shim defines it (filter's `pageSource`, the same pattern).
 */
function cursorSource(point: { x: number; y: number } | null): string {
  return `(() => { const __name = (f) => f; return (${CURSOR_SCRIPT})(${JSON.stringify(point)}); })()`;
}

/** The in-page half: find or make the cursor, then place it when there is a point. */
function cursorScript(point: { x: number; y: number } | null): void {
  // Null while an init script runs: the parser has not made `<html>` yet. The whole call waits
  // for it, so a cursor is only ever made where it is appended, and a document holds one.
  const root: HTMLElement | null = document.documentElement;
  if (root === null) {
    document.addEventListener("DOMContentLoaded", () => cursorScript(point), { once: true });
    return;
  }
  let cursor = root.querySelector<HTMLElement>(":scope > [data-wayford-cursor]");
  if (cursor === null) {
    cursor = document.createElement("div");
    cursor.setAttribute("data-wayford-cursor", "");
    cursor.setAttribute("aria-hidden", "true");
    // Inline and `!important`, so no page style reaches it. A translucent red fill, a white ring
    // and a dark hairline show on any background. No transition and no animation.
    cursor.style.cssText = [
      "position: fixed",
      "left: 0",
      "top: 0",
      "display: none",
      "box-sizing: border-box",
      "width: 24px",
      "height: 24px",
      "margin: 0",
      "border: 2px solid #ffffff",
      "border-radius: 50%",
      "background: rgba(220, 38, 38, 0.6)",
      "box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.7)",
      "pointer-events: none",
      "z-index: 2147483647",
      "transform: none",
      "transition: none",
      "animation: none",
    ]
      .map((declaration) => `${declaration} !important;`)
      .join(" ");
    root.append(cursor);
  }
  if (point === null) return;
  // Half the 24 px box: `left` and `top` put its centre on the point.
  const HALF = 12;
  cursor.style.setProperty("left", `${point.x - HALF}px`, "important");
  cursor.style.setProperty("top", `${point.y - HALF}px`, "important");
  cursor.style.setProperty("display", "block", "important");
}
