import "./style.css";
import { addressWithoutParams, applyTheme, openStore, wireMenu } from "./page-script.js";
import { resolveParams } from "./params.js";

// Storage blocked: each page renders its own query, or the defaults.
const store = openStore(() => window.sessionStorage);
// Stores the parameters before `addressWithoutParams` checks them.
const params = resolveParams(window.location.search, store);
applyTheme(document.documentElement.style, params);
const address = addressWithoutParams(window.location.href, store, params);
if (address !== undefined) window.history.replaceState(window.history.state, "", address);
wireMenu(
  document.querySelector<HTMLButtonElement>("#menu-toggle"),
  document.querySelector<HTMLElement>("#site-nav"),
);
// The kebab on /account; a no-op on every other page.
wireMenu(
  document.querySelector<HTMLButtonElement>("#more-toggle"),
  document.querySelector<HTMLElement>("#more-menu"),
);
