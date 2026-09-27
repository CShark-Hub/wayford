# m0-06 — Demo target app

Stream: m0
Milestone: week 1
Size: L
Depends on: m0-01

## Context

Read first, in this order:

- `docs/PLAN.md` assumption A5, F2, F9
- `KONCEPCJA.md` section "Przykład działania" for the flavour of goals, ignoring the energy domain
- `AGENTS.md` rejected item "Domain context"

## Goal

A small static web app with a handful of pages and one intentional wayfinding problem, whose contrast, font size and target size are driven by CSS variables set from the URL, so the filter, the preview and the sweep have a stable, tunable target.

## Interface

- In: query parameters `contrast`, `fontPx`, `targetPx` (optional, with defaults)
- Out: a Vite vanilla app in `packages/target-app` served on a fixed port
- Files expected to change: `packages/target-app/**`

## Constraints

- Domain neutral. A generic "my account" style app: home, two top-level sections, one settings page, one page holding the goal. No energy, no billing jargon.
- Two goals reachable: one easy (two clicks, large obvious link), one hard (the link is small, low contrast, placed in a section with a misleading label). The hard goal is the one the sweep breaks.
- Success for each goal is detectable by URL alone, so `urlMatches` works.
- CSS variables `--fg`, `--bg`, `--font-size`, `--target-size` computed from query parameters. Changing `contrast` changes only the low-contrast link, not the whole page, so the boundary is sharp.
- No framework, no router library. Plain HTML pages, one small script for the query parameters.
- Every interactive element has an accessible name. Do not use icon-only controls.
- One hamburger menu on mobile width only, for the knowledge dimension later.

## Acceptance

- [x] `pnpm --filter @wayford/target-app dev` serves the app on the documented port — 5174, `strictPort`
- [x] Opening `/?contrast=2` renders the hard link with a contrast ratio near 2:1 and `/?contrast=7` near 7:1, verified by a vitest test that computes contrast from the CSS variables — `params.test.ts`; measured in the browser at 2.006 and 7.005
- [x] Every path in the URL contract below resolves, and the two goal pages are reachable. This task does not need the task fixtures to exist. — `pages.test.ts`; all six return 200 from the dev server, unknown paths 404
- [x] A short `README.md` in the package lists pages, goals and parameters


## Target app URL contract (fixed here, do not invent)

Both this task and its counterpart are written against this list. Neither waits for the other.

| Path | What it is |
|---|---|
| `/` | home |
| `/account` | obvious, well-labelled section |
| `/account/address` | **easy goal page** |
| `/deliveries` | misleadingly labelled section; holds the low-contrast link to the archive |
| `/deliveries/archive` | **hard goal page**, reached only through the low-contrast link |
| `/settings` | a plausible wrong turn |

Success conditions, both `urlMatches`:

- easy goal: `**/account/address`
- hard goal: `**/deliveries/archive`

Goal sentences, already free of path words:

- easy: `you want to know where your next parcel is going`
- hard: `you want to see what you ordered three months ago`

## Out of scope

- Playwright, filter, anything from other packages.
- Visual polish. It should look like a plausible ordinary app, not a design piece.

## Notes for the reviewer

- Open it with `?contrast=3` and check that you personally struggle to notice the hard link. If you do not, it is not low enough.

## Outcome

What shipped, for the next reader. The full usage guide is `packages/target-app/README.md`.

- **Defaults: `contrast` 2, `fontPx` 16, `targetPx` 36.** Font and target meet Vera's 16 px and 32 px cuts, so contrast is the only metric that gates her and a contrast sweep has a boundary to find. By eye at 13 px, `?contrast=3` was findable, which by the note above is not low enough, while 2:1 was hard to notice, so the default is 2:1. That check predates the move to 16 px / 36 px. At 16 px the 2:1 link is still faint but more legible, so repeat it at the defaults by comparing `/deliveries?contrast=2` with `/deliveries?contrast=3`.
- **Deviation, "the link is small".** At the defaults the hard link is 16 px text, a pixel under the body copy (17 px since #32), in a 103 × 36 box (95 × 36 in the system font before #32), faint and alone at the bottom of `/deliveries`. A smaller font or box would gate Vera before contrast. `?fontPx=13&targetPx=20` gives the tiny version.
- **Addition.** `/deliveries` has a large "Delivery address" link, a second two-click route to the easy goal, because the goal sentence says "parcel".
- **`src/main.ts` also runs the mobile menu**, so the one script does slightly more than apply query parameters.
- **Parameter contract** for the harness, preview and sweep:
  - Start every run from a URL that carries all three parameters. A URL with any parameter decides alone: omitted ones reset to their defaults. `Task.startUrl` in the core fixtures is the bare `http://localhost:5174/`, so the harness appends them.
  - The page saves them to `sessionStorage` (`wayford-target-params`) for the tab and removes them from the address bar. Links stay plain paths, the `urlMatches` globs match after navigation, and the Actor never reads `?contrast=`.
  - Record the URL passed to `goto` as the run's parameters, not `page.url()`.
  - Only `.hard-link` reads the variables, and a test enforces it.
- **Core fixtures are illustrative, not a snapshot of this app.** `packages/core/src/fixtures/observation.json`, and the run and finding fixtures built on it, show `/deliveries` with other labels and measurements: the hard link is "Archive" (key `main//link:Archive`) at 2.1:1, where the app renders "Order archive" at 2.006:1, and "Account" has a 36 px target, where the app's "Your account" nav link is 46 px (44 px before #32). Only the URL contract and the goal sentences are shared on purpose. Check the filter's output on the running app against the app, not against these fixtures.

## Follow-ups

Found while building and reviewing this task. None block it. The first two were open decisions in `docs/KICKOFF.md` until `m0-08` decided them (issue #23).

- **Resolved in #23: Zoya cannot reach either goal.** `m0-08` kept her as she is: the calibration table in `docs/RULES.md` expects her at 0/10 on both goals at the target app's defaults, the far end of the scale rather than a broken engine, and the contrast sweep runs on Vera. Her 24 px font cut, with no softness, is above the text of every link and button in the app (17 px since #32; 18 px for the brand and the large links; the hard link's 16 px at its defaults). Only the page headings clear it. So she loses every route off the home page, easy path included, and no parameter brings one back: `fontPx=24&targetPx=48` makes the hard link big enough for her, but every route to `/deliveries` is a 17 px link. A softness of 0.3, like her contrast rule, would not be enough: the band floor would be 24 × 0.7 = 16.8 px, so the 17 and 18 px links would reach her degraded in only about 3% and 17% of runs.
  **Contrast gates her easy path too** (issue #32). The accent `#0b57d0` and the muted `#57606a` are 6.39:1 on white, inside her soft contrast band (4.9 to 7). With the font cut lifted, each big link (white on the accent, 50 px, clear of her 48 px target cut) would still reach her degraded in about seven runs in ten and not at all in the rest, never whole. The nav links clear her contrast cut (13.3:1 or more), but their 46 px boxes miss her 48 px target cut.
- **Resolved in #23: the `docs/RULES.md` calibration row that expects "0/10 on the hard goal"** assumed a hard contrast cut without naming it. Vera's cut is soft (3.0, softness 0.5) and the default 2:1 link sits in her band (1.5 to 3.0), so each run's seed decides whether the link reaches her degraded or not at all, and 0/10 is no longer guaranteed. The band floor, threshold × (1 − softness), was defined only in `packages/core/src/finding.test.ts`, and RULES was ambiguous about what the in-band roll picks between. `m0-08` wrote both into RULES, "Thresholds, bands and the roll": in the band an element is degraded when its roll falls below its position in the band and invisible otherwise, and a hard cut never degrades. The row now names a hard cut, and a Vera row states the soft case: the link reaches her degraded in about one seed in three and never whole, and her hard-goal successes never exceed those seeds.
- **Resolved in #32: nav links, buttons and the Menu toggle sat exactly on two cuts.** Nav links, the three `.button` buttons and the mobile Menu toggle were 16 px text in 44 px boxes: exactly Vera's font cut and Milo's target cut, kept only because the rules compare with `>=`. On mobile the toggle is Milo's only way into the nav. Text is now 17 px and those controls are 46 px tall; the large easy-path links, 48 px before, are 50 px, clear of Zoya's 48 px cut too. A test keeps every fixed size in `style.css` off the cuts.
- **Elements below target cuts whatever the parameters:** the brand link (about 27 px), plain text links such as "Go to deliveries" (about 20 px), 22 px checkboxes. Both goals stay reachable without them.
- **Three buttons do nothing** ("Change delivery address", "Request a copy of my data", "Close my account"). Check whether dead clicks produce noisy findings once the Actor runs.
- **The hamburger never triggers K1.** Milo, the only mobile persona, knows the pattern. Vera and Zoya don't, but they run on desktop, where the menu button is hidden.
- **Stale comment in `packages/core/src/fixtures/index.ts`.** It lists `target-app` among packages that typecheck the core barrel without node types. `target-app` does not depend on core and now has node types, so it should come off the list. A `packages/core` change, so two reviewers.
