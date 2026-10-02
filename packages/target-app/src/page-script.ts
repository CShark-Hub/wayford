/**
 * What `main.ts` does on every page, as functions a test can call without a browser: the
 * parameters it applies, when it strips them from the address bar, and the menu toggle.
 */
import {
  hasParams,
  PARAM_NAMES,
  type ParamStore,
  STORAGE_KEY,
  type TargetParams,
  themeVariables,
} from "./params.js";

/** The tab's storage, or `undefined` when reading it throws (storage blocked). */
export function openStore(open: () => ParamStore): ParamStore | undefined {
  try {
    return open();
  } catch {
    return undefined;
  }
}

/** Sets the hard link's CSS variables on the root element's style. */
export function applyTheme(
  style: Pick<CSSStyleDeclaration, "setProperty">,
  params: TargetParams,
): void {
  for (const [name, value] of Object.entries(themeVariables(params))) {
    style.setProperty(name, value);
  }
}

/** True when the store holds exactly `params`, so a reload without the query renders the same. */
export function isStored(store: ParamStore | undefined, params: TargetParams): boolean {
  try {
    return store?.getItem(STORAGE_KEY) === JSON.stringify(params);
  } catch {
    return false;
  }
}

/**
 * The address to show in place of `href` once the parameters are stored: path, other query
 * and hash kept, the parameters gone. `undefined` when there is nothing to strip or storing
 * failed.
 *
 * Once stored, the parameters leave the address bar, so the Actor never reads `?contrast=` in a
 * URL. If storing failed they stay, so a reload still renders the same page.
 */
export function addressWithoutParams(
  href: string,
  store: ParamStore | undefined,
  params: TargetParams,
): string | undefined {
  const url = new URL(href);
  if (!hasParams(url.search) || !isStored(store, params)) return undefined;
  for (const name of PARAM_NAMES) url.searchParams.delete(name);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The part of a toggle button, the Menu button or the kebab, that `wireMenu` uses. */
export interface MenuToggle {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  addEventListener(type: "click", listener: () => void): void;
}

/** The part of the panel a toggle opens, the nav or the kebab's menu, that `wireMenu` uses. */
export interface MenuPanel {
  readonly classList: Pick<DOMTokenList, "toggle">;
}

/**
 * Each click flips `aria-expanded` and the panel's `open` class together. No-op when either is
 * missing.
 */
export function wireMenu(toggle: MenuToggle | null, panel: MenuPanel | null): void {
  if (!toggle || !panel) return;
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    panel.classList.toggle("open", open);
  });
}
