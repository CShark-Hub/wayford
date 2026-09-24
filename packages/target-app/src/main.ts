import "./style.css";
import {
  hasParams,
  PARAM_NAMES,
  type ParamStore,
  resolveParams,
  STORAGE_KEY,
  themeVariables,
} from "./params.js";

let store: ParamStore | undefined;
try {
  store = window.sessionStorage;
} catch {
  // Storage blocked: each page renders its own query, or the defaults.
}

const params = resolveParams(window.location.search, store);
for (const [name, value] of Object.entries(themeVariables(params))) {
  document.documentElement.style.setProperty(name, value);
}

// Once stored, the parameters leave the address bar, so the Actor never reads `?contrast=` in a
// URL. If storing failed they stay, so a reload still renders the same page.
function stored(): boolean {
  try {
    return store?.getItem(STORAGE_KEY) === JSON.stringify(params);
  } catch {
    return false;
  }
}

if (hasParams(window.location.search) && stored()) {
  const url = new URL(window.location.href);
  for (const name of PARAM_NAMES) url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

const toggle = document.querySelector<HTMLButtonElement>("#menu-toggle");
const nav = document.querySelector<HTMLElement>("#site-nav");
if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("open", open);
  });
}
