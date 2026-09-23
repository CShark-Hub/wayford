# @wayford/target-app

Quillmere, a small, domain-neutral and fictional "my account" shop to walk. It has one easy goal and one hard one, and query parameters tune the hard link, so the filter, the preview and the sweep all have a stable target.

![Deliveries, with the faint Order archive link outlined](docs/screenshots/04b-deliveries-annotated.png)

![The hard link at contrast 2, 3, 4.5 and 7](docs/screenshots/07-contrast-strip.png)

```bash
pnpm --filter @wayford/target-app dev
```

Serves on **http://localhost:5174** (`strictPort`, so it fails rather than moving). `vite preview` uses the same port.

## Pages

The URL contract from `tasks/m0-06-target-app.md`, also defined in `src/pages.ts` as `PAGES`:

| Path | File | What it is |
|---|---|---|
| `/` | `index.html` | home, a big "Your account" link |
| `/account` | `account.html` | obvious, well-labelled section |
| `/account/address` | `account/address.html` | **easy goal page** |
| `/deliveries` | `deliveries.html` | misleadingly labelled section: a big "Delivery address" link, and the low-contrast "Order archive" link at the bottom |
| `/deliveries/archive` | `deliveries/archive.html` | **hard goal page**, linked only from `/deliveries` |
| `/settings` | `settings.html` | a plausible wrong turn ("order history" is mentioned, not linked) |

A path that matches no page or file returns 404 (`appType: "mpa"`), never the home page. The dev server also serves the files themselves (`/deliveries/archive.html` returns the archive page), but the goal globs below match only the extensionless paths, so reaching a `.html` file is not success.

## Goals

Defined in `src/pages.ts` as `GOALS`. Both succeed on URL alone:

| Goal | Sentence | `urlMatches` | Route |
|---|---|---|---|
| easy | you want to know where your next parcel is going | `**/account/address` | Home → Your account → Delivery address, through large links. Or Home → Deliveries (nav item, or the card's small inline link) → Delivery address (large link). Two clicks either way. |
| hard | you want to see what you ordered three months ago | `**/deliveries/archive` | Home → Deliveries → "Order archive", faint and alone at the bottom |

## Parameters

| Parameter | Default | Range | Sets | Effect |
|---|---|---|---|---|
| `contrast` | `2` | 1–21 | `--fg` (against `--bg`) | WCAG contrast of the hard link text. The grey chosen is the lightest one that reaches the ratio, never below it, so the realised ratio snaps up to the next 8-bit grey. |
| `fontPx` | `16` | 6–72 | `--font-size` | font size of the hard link |
| `targetPx` | `36` | 8–96 | `--target-size` | minimum height and width of the hard link's box: its smaller side whenever the font fits in it |

`--bg` is fixed at `#ffffff`. **Only `.hard-link` reads these variables**, so a change moves one element across a threshold and the rest of the page stays put.

With the defaults, the font meets Vera's 16 px exactly (P3 compares with `>=`) and the target clears her 32 px, so **contrast is the only metric that gates her**, and a contrast sweep has a boundary to find. 2:1 sits below her 3:1, inside her softness band, so each run's seed decides whether the link reaches her degraded (name partly masked) or not at all. Milo (target 44) still loses the link on target size; Zoya (7:1, 24 px, 48 px) loses it on all three.

Missing or unparsable values fall back to the defaults, and out-of-range values, infinities included, are clamped.

**Parameters live for the tab.** Put them on the start URL, e.g. `/?contrast=4.5`:

- A URL that sets any parameter decides alone. Parameters it omits take their defaults, and the result is saved to `sessionStorage` under `wayford-target-params`.
- Once saved, the script removes them from the address bar (`history.replaceState`), so the Actor never reads `?contrast=` in a URL. If saving fails they stay, so a reload still renders the same page.
- A URL without parameters uses what the tab saved. So links stay plain paths, goal globs such as `**/deliveries/archive` match after navigation, and the setting survives reloads.
- Because they leave the address bar, after a `goto` that waits for `load` (the default) or `domcontentloaded`, `page.url()` no longer shows the parameters. A harness records the URL it passed to `goto` as the run's parameters.
- Omitted parameters reset to their defaults, not to what the tab saved, so repeat any non-default value you want to keep.
- Saved parameters belong to the tab, not the browser context: a new tab starts from the defaults. Start every run from a URL that carries all three parameters, so no run depends on what its tab saved and the recorded URL is the whole setting.

## Other properties

- No framework, no router. Plain HTML pages, one script (`src/main.ts`) for the parameters and the menu.
- Every link, button and checkbox has a visible text name, and no control is icon-only. Sub-pages mark their section in the nav with `aria-current="location"`.
- At widths up to 640 px the nav collapses behind one "☰ Menu" button (`aria-expanded`, `aria-controls`). This is here for the knowledge dimension.
- Nav items, the Menu button and the buttons are 16 px text in 44 px boxes. That is exactly Vera's font threshold and Milo's target threshold, so they keep them only because the rules compare with `>=`. Big links are 18 px text in 48 px boxes.
- Other elements are below Vera's and Milo's target cuts whatever the parameters: the brand link (about 27 px tall), the plain text links such as "Go to deliveries" and "Back to deliveries" (about 21 px), and the 22 px checkboxes. Both goals stay reachable through the nav and the big links.
- Three buttons ("Change delivery address", "Request a copy of my data", "Close my account") do nothing. Neither goal needs them.
- `target-app` imports nothing from the workspace.
