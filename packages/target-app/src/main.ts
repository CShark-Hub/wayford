import "./style.css";
import { hasParams, parseParams, type TargetParams, themeVariables } from "./params.js";

// Parameters set on the first page are kept for the rest of the tab, so links stay plain
// paths and `urlMatches` globs like `**/deliveries/archive` still match after navigation.
const STORAGE_KEY = "wayford-target-params";

function storedParams(): Partial<TargetParams> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<TargetParams>) : {};
  } catch {
    return {};
  }
}

const params = parseParams(window.location.search, storedParams());
if (hasParams(window.location.search)) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // Storage blocked: the parameters still apply to this page.
  }
}

for (const [name, value] of Object.entries(themeVariables(params))) {
  document.documentElement.style.setProperty(name, value);
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
