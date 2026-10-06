/**
 * Daylight and Night, and how the app remembers which one a browser chose (`docs/DESIGN.md`,
 * "In code"). CSS keys on `data-theme` on `<html>` and nothing else.
 *
 * `index.html` holds the first half of this contract as an inline script, which sets the attribute
 * before first paint: the stored choice if there is one, else the system's `prefers-color-scheme`.
 * It cannot import this module, so `theme.test.ts` runs that script and checks it reads the key
 * written here.
 */

export type Theme = "light" | "dark";

/** Where the choice is stored, once someone flips the toggle. Until then the system decides. */
export const THEME_STORAGE_KEY = "wayford-theme";

/** Each theme's name as the interface says it. */
export const THEME_NAMES: Record<Theme, string> = { light: "Daylight", dark: "Night" };

/** The theme on `<html>` now; Daylight where there is no document, as in a static render. */
export function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Show `theme` and store it as this browser's choice. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked, in a private window or a sandboxed frame. The theme still flips;
    // the next load follows the system again.
  }
}

/** The theme the toggle flips to. */
export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}
