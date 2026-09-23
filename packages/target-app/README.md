# @wayford/target-app

A small, domain-neutral "my account" app to walk. It has one easy goal and one hard one, and query parameters tune the hard link, so the filter, the preview and the sweep all have a stable target.

```bash
pnpm --filter @wayford/target-app dev
```

Serves on **http://localhost:5174** (`strictPort`, so it fails rather than moving). `vite preview` uses the same port.

## Pages

The URL contract from `tasks/m0-06-target-app.md` is also exported as `PAGES`:

| Path | File | What it is |
|---|---|---|
| `/` | `index.html` | home, a big "Your account" link |
| `/account` | `account.html` | obvious, well-labelled section |
| `/account/address` | `account/address.html` | **easy goal page** |
| `/deliveries` | `deliveries.html` | misleadingly labelled section, holds the low-contrast "Order archive" link |
| `/deliveries/archive` | `deliveries/archive.html` | **hard goal page**, linked only from `/deliveries` |
| `/settings` | `settings.html` | a plausible wrong turn ("order history" is mentioned, not linked) |

Any other path returns 404 (`appType: "mpa"`), never the home page.

## Goals

These are exported as `GOALS`. Both succeed on URL alone:

| Goal | Sentence | `urlMatches` | Path |
|---|---|---|---|
| easy | you want to know where your next parcel is going | `**/account/address` | Home → Your account → Delivery address (two clicks, large links) |
| hard | you want to see what you ordered three months ago | `**/deliveries/archive` | Home → Deliveries → "Order archive" (small, low contrast, at the bottom) |

## Parameters

| Parameter | Default | Range | Sets | Effect |
|---|---|---|---|---|
| `contrast` | `2` | 1–21 | `--fg` (against `--bg`) | WCAG contrast of the hard link text. The grey chosen is the lightest one that reaches the ratio, never below it. |
| `fontPx` | `13` | 6–72 | `--font-size` | font size of the hard link |
| `targetPx` | `20` | 8–96 | `--target-size` | height of the hard link's box, its smaller side |

`--bg` is fixed at `#ffffff`. **Only `.hard-link` reads these variables**, so a change moves one element across a threshold and the rest of the page stays put. The defaults sit below Vera's 3:1, 16 px and 32 px thresholds, so the hard link fails for her out of the box.

Missing or unparsable values fall back to the defaults, and out-of-range values are clamped.

**Parameters persist for the tab.** Set them once on the start URL, e.g. `/?contrast=4.5`. The script saves them to `sessionStorage` and applies them on every later page, so links stay plain paths and `**/deliveries/archive` still matches after navigation. A fresh browser context starts from the defaults.

## Other properties

- No framework, no router. Plain HTML pages, one script (`src/main.ts`) for the parameters and the menu.
- Every link, button and checkbox has a visible text name, and no control is icon-only.
- At widths up to 640 px the nav collapses behind one "☰ Menu" button (`aria-expanded`, `aria-controls`). This is here for the knowledge dimension.
- `target-app` imports nothing from the workspace.
