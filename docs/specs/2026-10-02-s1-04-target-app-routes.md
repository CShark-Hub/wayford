# s1-04 — Target app: three routes to the hard goal, and Kai: spec

Task: `tasks/s1-04-target-app-routes.md` · Branch: `feature/s1-04-target-app-routes` · Date: 2026-10-02
Status: approved 2026-10-02

## Goal

The hard goal gets three routes to `/deliveries/archive`, each closed by a different capability dimension (A perception, B knowledge, C vocabulary and attention). A fifth persona, Kai, sees what Ada sees and differs from her only in knowledge, attention and memory.

## Constraints that bind

- "The persona is a filter, not a prompt" (`AGENTS.md`): Kai is thresholds, caps and lists in `kai.yaml`. The description names a bundle, with no diagnosis and no job.
- Route A, `/deliveries`, the hard link and `src/params.ts` stay byte-identical (acceptance box 7). Only `.hard-link` reads the tunable variables. No new tunable parameter.
- The hard goal's success condition and core `tasks.json` stay as they are. Every route ends at `/deliveries/archive`.
- The entrances to B and C measure a `targetPx` from 24 to 31. That closes them for Vera, Milo and Zoya through P4 and leaves them open for Ada and Kai. Each entrance sits directly under its page's `h1`.
- `/settings/data` passes WCAG AA on everything the filter measures: contrast at least 4.5:1, every control's target at least 24 px, and no text-bearing element without a contrast.
- Existing target-app rules (`params.test.ts`, `font.test.ts`, `pages.test.ts`):
  - no fixed box at 32, 44 or 48 px;
  - every fixed font larger than 16 px and not 24;
  - page text is printable ASCII plus "·";
  - no `style` attribute;
  - every input sits in its own label;
  - each sub-page marks its section with `aria-current="location"`;
  - every page has the Quillmere title and the "fictional" footer.
- `target-app` imports nothing from the workspace, and nothing imports it (`biome.json`). Filter tests reach it by path only.
- `docs/RULES.md` is frozen: the PR needs two approvals (task, "Notes for the reviewer").
- The bundle table in RULES is tested (`profile.test.ts:203`, `:207`):
  - rows are in fixture order;
  - every `word number` that opens a cell or a comma item must equal the fixture's value;
  - citations go in parentheses.
- Page text must not contain the substring "kai". `BANNED_ACTOR_WORDS` gains every persona label, and Actor text is checked against that list (`observation.test.ts:513`, `llm-actor.test.ts:177`).
- Out of scope: the rules K1, K2, K4 and A1 themselves (`s1-03`, `s1-05`), axe-core, any change to the easy goal, screens for a fifth persona, softening Zoya.

## Design

### Pages

**`/account` gets the kebab, route B's entrance.** It sits directly under the `h1`, in a `.page-tools` row with the menu it controls:

```html
<div class="page-tools">
  <button id="more-toggle" class="entrance kebab" type="button" aria-label="More options"
          aria-haspopup="menu" aria-expanded="false" aria-controls="more-menu">
    <span class="kebab-icon" aria-hidden="true"></span>
  </button>
  <ul id="more-menu" class="more-menu" role="menu" aria-label="More options">
    <li role="none"><a role="menuitem" href="/deliveries/archive">Past orders</a></li>
    <li role="none"><a role="menuitem" href="/settings">Settings</a></li>
    <li role="none"><button role="menuitem" type="button">Sign out</button></li>
  </ul>
</div>
```

- The button is 28 × 28 px. That is the smaller side of its own box, since no label points at it. The size is fixed, not tunable.
- The icon is three dots drawn with `box-shadow`, the way `.menu-icon` draws its bars. There is no glyph.
- `.more-menu` is `display: none` until it carries the class `open`; it is then an absolute dropdown. While closed, `collect` measures none of its entries.
  - Superseded by decision 27: the open menu sits in normal flow and pushes the content down.
- Menu items are `menuitem` controls, `.more-menu a` and `.more-menu button`, with `min-height: 46px`. With `role="none"` on each `li`, there is no list-item text block.
- "Sign out" is a dead button, like the three that exist. No menu item leads to the easy goal, so the easy goal's routes stay as they are (task, Out of scope).

**`/settings` gets "Your data", route C's entrance.** It is `<a class="entrance data-entrance" href="/settings/data">Your data</a>`, placed directly under the `h1` and before the lead. It is an inline-flex box with `min-height: 28px`, so its smaller side is 28. Everything else on `/settings` stays, including the unlinked "order history" sentence.

**`/settings/data` is a new page, `settings/data.html`.**
- Its main content is the `h1` "Your data", a lead, an `h2` "What we keep", a `ul.data-list` of seven `li > a`, styled through `.data-list a`, an `h2` "Your rights", a paragraph and a dead button "Request a copy of my data", placed outside any `<p>`. That is 20 controls and text blocks in `main`, within the task's 15 to 20 (decision log row 4).
- The list, in order:
  - Contact details → `/account`
  - **Fulfilment ledger** → `/deliveries/archive`, second, so in the first screenful but not first
  - Saved addresses → `/account/address`
  - Delivery preferences → `/deliveries`
  - Notification choices → `/settings`
  - Sign-in activity → `/account`
  - Marketing choices → `/settings`
- No entry carries a plain label for orders, and the entries carry no descriptions. Decision log row 3 gives the reason.
- `.data-list a`: inline-flex, `min-height: 30px`, accent colour (about 6.4:1 on white). Every control on the page is then at least 24 px.
- The page has no plain inline text link, since those measure 20 px.
- The nav marks `/settings` with `aria-current="location"`.

### Script

- `main.ts` calls `wireMenu(#more-toggle, #more-menu)` a second time. `wireMenu` already takes any toggle plus any element with a `classList`, so no new script logic is needed.
- In `page-script.ts`, the interface `MenuNav` is renamed `MenuPanel`, with its doc comment updated. The kebab's dropdown is not a nav.
- No new `page-script.test.ts` case. The existing `wireMenu` tests already prove that the script opens and closes a panel and flips `aria-expanded` without a browser (box 1). The kebab's wiring in `main.ts` is proven by the browser click test (box 3).

### ROUTES in `src/pages.ts`

```ts
export interface RouteStep {
  /** The page the step is taken on: a path in PAGES. */
  page: string;
  role: "link" | "button" | "menuitem";
  /** Accessible name, as `getByRole` finds it. */
  name: string;
}

export interface Route {
  id: "A" | "B" | "C";
  /** The control only this route passes, and the first one under a persona cut: A's hard link, B's kebab, C's "Your data". */
  entrance: RouteStep;
  /** Home to the archive, in click order. The last step links to the archive. */
  steps: readonly RouteStep[];
  /** The page the route reaches the archive from. Distinct per route, so a run's route can be read off its last page (s2-11). */
  from: string;
}
```

Superseded: `entrance` was removed by decision 25 and `from` by decision 29. Each route is its steps, and the last step's page is the page it reaches the archive from. The interface above and the Entrance and `from` columns below record the design as approved.

The three routes:

| Route | Steps | Entrance | `from` |
|---|---|---|---|
| A | `/` link "Deliveries", then `/deliveries` link "Order archive" | "Order archive" | `/deliveries` |
| B | `/` link "Your account", then `/account` button "More options", then `/account` menuitem "Past orders" | "More options" | `/account` |
| C | `/` link "Settings", then `/settings` link "Your data", then `/settings/data` link "Fulfilment ledger" | "Your data" | `/settings/data` |

`PAGES` gains `{ path: "/settings/data", file: "settings/data.html" }`. The build, the dev server and `dev-server.test.ts` pick it up from there.

### Profiles

**`kai.yaml`**
- `seed` 1027, which gives hue 240 and parts sprout, arch, dots. That hue is 60° or more from every other persona.
- `device: desktop`, `perception: { emulation: none }`.
- `behaviour`: `budgetSeconds` 120, `maxElements` 10, `memorySteps` 2.
- `knowledge`:
  - `knownPatterns: [carousel, fab, infiniteScroll, swipe, search, cart, backLink]`, every pattern Kai knows. Under RULES line 84 a pattern in neither list is known, so listing the seven documents the bundle in full.
  - `unknownPatterns: [hamburger, kebab, breadcrumb, tabs, accordion]`
  - `domainVocabulary`: about 15 everyday shop words (order, orders, delivery, deliveries, parcel, address, account, settings, basket, payment, receipt, refund, return, price, details). It has no "fulfilment" and no "ledger", and no word that contains "meter".
- `description`: the task's example line. It has no quote characters, because the personas card test checks the escaped text.

`constraintCount(Kai)` is 7: two caps plus five unknown patterns.

**`vera.yaml`**: `maxElements` goes from 12 to 20. Nothing else changes.

**`fixtures/index.ts`**: no change. It reads every `*.yaml` sorted by file name, so the order becomes ada, kai, milo, vera, zoya.

### Tests

**`packages/target-app/src/pages.test.ts`**
- "the hard goal is reached only through the one hard link" becomes "the hard link is the only route to the archive without passing an entrance under 32 px".
  - The breadth-first walk skips `.hard-link`, `.entrance`, and the links inside the element an `.entrance` names in `aria-controls`. It must not reach `/deliveries/archive`.
  - The other half: with only the entrances and what they control skipped, and the hard link followed, the walk does reach `/deliveries/archive`.
  - Every `role="menuitem"` sits inside `#more-menu`.
  - Hard links are still exactly the one on `/deliveries`.
  - Exactly two `.entrance` controls exist: the kebab on `/account` and "Your data" on `/settings`.
- New: "ROUTES names three routes, each a walk of real links".
  - Ids are A, B and C. For each route, `from` is the last step's page, and the `from` values are distinct.
  - Each link or menuitem step is an `<a>` with that visible text on its page, and its `href` is the next step's page, or the archive on the last step.
  - The button step on `/account` carries `aria-label` "More options", `aria-haspopup="menu"`, `aria-expanded="false"` and `aria-controls="more-menu"`. The next step is a `role="menuitem"` link inside `#more-menu` on the same page.
  - Each `entrance` is one of the route's steps.
  - Superseded: the `from` checks by decision 29, the `entrance` check by decision 25.
- "every link and button has visible text" becomes "every link and button has a name". That is visible text, or an `aria-label` on the one icon-only control, the kebab, whose content is `aria-hidden` only.
- New: `PAGES` lists `/settings/data`.

**`packages/target-app/src/params.test.ts`**
- New: "`.entrance` declares a box from 24 to 31 px". The CSS side; the measured side is in filter.
  - Superseded by decision 22: removed, the filter browser test measures the box.
- The defaults test is renamed "…so contrast is the only metric that gates her on the hard link".

**New `packages/filter/src/target-app-routes.browser.test.ts`.** It uses the same `serveTargetApp`, Chromium, 1280×720 and Inter check as `collect.browser.test.ts`. It reads the page list from one written-out constant, `TARGET_APP_PATHS`, exported by `serve-target-app.ts` next to the server that serves them. One test keeps that constant equal to the paths in target-app's `src/pages.ts`, reading that file as text the way `goals.test.ts` reads `tasks.json`.
- Box 3, a click test:
  - on `/account`, `getByRole("button", { name: "More options" })` opens the menu, and `aria-expanded` becomes true;
  - clicking `getByRole("menuitem", { name: "Past orders" })` lands on `/deliveries/archive`;
  - on `/settings/data`, `getByRole("link", { name: "Fulfilment ledger" })` lands on `/deliveries/archive`.
- Box 4:
  - `collect` on `/account` and `/settings` gives `targetPx` from 24 to 31 for `main//button:More options` and `main//link:Your data`;
  - on `/settings/data`, every text block and control has `contrast` at least 4.5, every control has `targetPx` at least 24, and every element with `fontPx` has `contrast`.
- Box 5: `collect` every page at the app's defaults (`?contrast=2&fontPx=16&targetPx=36`), then run `perceive` for seeds 1 to 100.
  - Kai: no decision with `stage === "perception"` on any page.
  - Vera: a P4 decision on both entrances, `invisible` (hard cut).
  - The changed calibration row, checked in the same loop: Vera with her contrast made hard (3.0, no softness) has the hard link `invisible` (P1) and both entrances `invisible` (P4) on every seed.

**`packages/filter/src/collect.browser.test.ts`**: its own written-out `PAGES` is replaced by `TARGET_APP_PATHS`. "getByRole finds every measured element" then covers `/settings/data`, and filter keeps one page list behind one drift test.

**`packages/filter/src/serve-target-app.ts`**: exports `TARGET_APP_PATHS`, the target app's pages written out (filter may not import it).

**`packages/core/src/profile.test.ts`**
- "there are four of them" becomes five, with `prof_kai` second.
- The sort test becomes "fixtures sort by name, from Ada, who switches nothing on, to Zoya, who switches on the most": labels in alphabetical order, Ada's count 0, Zoya's the unique maximum.
- New: "Kai sees what Ada sees". Kai's `perception` and `device` equal Ada's, and Kai's `domainVocabulary` holds neither "fulfilment" nor "ledger".

**`packages/web/src/avatar/parts.test.ts`**: a pinned `Kai: { hue: 240, tuft: "sprout", brows: "arch", pattern: "dots" }`, and "the five fixtures get five different hues".

**Outside the task's file list, and failing the moment `kai.yaml` exists:**
- `packages/filter/src/perceive.test.ts`: `PERSONA_IDS` gains `prof_kai`.
- `packages/web/src/router.test.tsx`: "/personas shows the five cards in order".

### Docs

**`docs/RULES.md`**
- "Persona composition":
  - "Five hackathon personas".
  - Kai's row, second.
  - Vera's `maxElements` 20.
  - The sort paragraph rewritten: Ada first, Zoya last, alphabetical in between. The initial names the dimension: K for knowledge. Order no longer follows the constraint count.
  - The middles sentence names Kai.
  - The sweep paragraph: "on route A contrast is the only metric that gates her; P4 closes B and C at every contrast".
- "Calibration":
  - the three new rows;
  - the "hard contrast cut" row rewritten for Vera, hard at 3.0;
  - the "Sweep on contrast" row limited to a persona whose B and C entrances P4 closes, such as Vera: for any other persona the hard link is no longer the only route, so its success bound does not hold;
  - the route table under a `| Route |` header, after the calibration table.
- Kai's row: `| Kai | none | unknown: hamburger, kebab, breadcrumb, tabs, accordion (folk), everyday shop words only (folk) | `maxElements` 10, `memorySteps` 2 (PIAAC level 1, Cowan 2001) | budget 120 s |`. The vocabulary sits in the Knowledge cell as words, with no `word number`.

**`AGENTS.md`**
- Line 18: "the five persona bundles".
- Line 78: "Ada, Kai, Milo, Vera, Zoya". Ada is the control persona and Zoya the boundary; the initial names each one's dimension.

**`packages/target-app/README.md`**
- Pages: a `/settings/data` row; the archive is now linked from three pages; `/settings` holds C's entrance.
- Goals: the three routes.
- "contrast is the only metric that gates her" is limited to the hard link.
- The menu line and the icon-only line become "one icon-only control, the kebab, on purpose".
- The sizes paragraph gains the 28 px entrances and the 30 px data links.
- "seven HTML pages".

**`docs/PLAN.md` F9 AC5**:
- "for a goal reachable only through one link, such as the target app's hard goal" becomes "for a persona with one route to a goal, such as Vera on the hard goal, whose B and C entrances P4 closes".
- The Kai sentence becomes per route: "On `maxElements` (Kai) the bound holds per route: A1 shows a prefix of one salience order, so for a fixed seed a smaller cap never shows an entrance a larger one hid, and successes through a route never exceed the seeds where A1 shows its entrance."

## Files

| File | Why |
|---|---|
| `packages/target-app/account.html` | the kebab and its menu (route B) |
| `packages/target-app/settings.html` | "Your data" (route C entrance) |
| `packages/target-app/settings/data.html` | new page (route C) |
| `packages/target-app/src/pages.ts` | `/settings/data` in `PAGES`; `ROUTES` |
| `packages/target-app/src/style.css` | `.page-tools`, `.kebab`, `.kebab-icon`, `.more-menu`, `.entrance`, `.data-list` (with `.plain-list`) |
| `packages/target-app/src/main.ts` | wire the kebab |
| `packages/target-app/src/page-script.ts` | rename `MenuNav` to `MenuPanel` and its comment, so the kebab's dropdown is not called a nav |
| `packages/target-app/src/pages.test.ts`, `params.test.ts` | boxes 1, 2; the CSS side of 4 (removed later, decision 22) |
| `packages/target-app/src/page-script.test.ts` | follows the `MenuNav` → `MenuPanel` rename; no new case |
| `packages/target-app/README.md` | box 8 and the stale lines |
| `packages/core/src/fixtures/profiles/kai.yaml` (new), `vera.yaml` | Kai; Vera's cap |
| `packages/core/src/profile.test.ts` | five personas, the sort rule |
| `packages/web/src/avatar/parts.test.ts` | Kai's pinned parts, five hues |
| `packages/web/src/router.test.tsx` | **outside the list**: pins four persona cards and fails with Kai |
| `packages/filter/src/perceive.test.ts` | **outside the list**: pins four persona ids and fails with Kai |
| `packages/filter/src/target-app-routes.browser.test.ts` (new) | boxes 3, 4, 5 |
| `packages/filter/src/collect.browser.test.ts` | uses `TARGET_APP_PATHS` instead of its own list |
| `packages/filter/src/serve-target-app.ts` | exports `TARGET_APP_PATHS`, filter's one written-out page list |
| `docs/RULES.md`, `AGENTS.md` | box 8 |
| `docs/PLAN.md` | **outside the list**: F9 AC5 becomes false without a one-line fix |

`fixtures/index.ts` is in the task's list but needs no change: it globs `profiles/*.yaml`. `packages/filter/scripts/bench-perceive.ts` hard-codes four ids for timing only, and is left as is (decision log).

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| target-app tests pass and show `/settings/data` in `PAGES`, three `ROUTES`, B and C links resolving, and the menu script toggling without a browser | `pnpm --filter @wayford/target-app test`: "PAGES lists /settings/data", "ROUTES names three routes, each a walk of real links", and the existing `wireMenu` tests ("each click flips aria-expanded and the nav's open class together") |
| the hard-link test becomes "only route without passing an entrance under 32 px" | `pages.test.ts` "the hard link is the only route to the archive without passing an entrance under 32 px"; `target-app-routes.browser.test.ts` "the entrances measure a target from 24 to 31 px" |
| browser test: kebab opens the menu, Past orders and Fulfilment ledger reach the archive | `target-app-routes.browser.test.ts` "route B …" and "route C …" |
| filter browser test: entrances measured 24 to 31; `/settings/data` AA, and no text without contrast | `target-app-routes.browser.test.ts` "the entrances measure a target from 24 to 31 px" and "/settings/data passes AA on every measured metric" |
| `perceive` seeds 1 to 100: Kai has no perception decision; Vera has P4 on both entrances | `target-app-routes.browser.test.ts` "Kai: no perception decision …" and "Vera: P4 on both entrances …" |
| `kai.yaml` validates and round-trips, `profileFixture("prof_kai")` works, persona-iterating tests cover five, five hues differ | `profile.test.ts` "there are five of them …" and "each one round-trips through YAML"; `parts.test.ts` "the five fixtures get five different hues" |
| `deliveries.html` and `params.ts` unchanged | `git diff origin/main -- packages/target-app/deliveries.html packages/target-app/src/params.ts` is empty |
| RULES has Kai, Vera's cap 20, the sort rule and the calibration rows; AGENTS names five; README Goals lists three routes | `profile.test.ts:203`, `:207` (the bundle table against the fixtures), plus reading the diff |
| lint, typecheck and test pass at the root | `pnpm lint && pnpm typecheck && pnpm test` |

## Decision log

| # | Question | Taken | Why |
|---|---|---|---|
| 1 | Menu markup for the kebab | `role="menu"`, `li role="none"`, `a role="menuitem"` | `aria-haspopup="menu"` promises a menu, and this is the WAI-ARIA APG menu-button markup. `collect` measures `menuitem` as a control and leaves out list-item duplicates. No arrow-key handling: the Actor clicks, and keyboard navigation is out of scope (`docs/RULES.md`, "What is not in the filter"). |
| 2 | Entrance size | 28 px, fixed, on both entrances | Inside 24 to 31. Away from 24, the AA anchor, and from 32, Vera's cut, so sub-pixel layout cannot flip either check (issue #32). Not on any cut in `params.test.ts`. |
| 3 | `/settings/data` entries | seven links with plain labels, the ledger second; no descriptions | Every link must reach a contract path, so each entry links to an existing page that holds that data. No description, because under #124 a list item is named by all its text: a description would repeat the label, or say "orders" in plain words beside the jargon and open the route by vocabulary. |
| 4 | Element count on `/settings/data` | 20 in `main` (h1, lead, two h2, a paragraph, seven list items, seven links, a button outside any `<p>`) | The task asks for about 15 to 20, as many as a real data page. A button inside a `<p>` would add a paragraph named by its text, so it stands alone. The header adds 5 controls and 4 list items until #124 lands. (Since #124's text-block half, the seven list items in `main` and the header's four are not measured: they draw no text of their own. That leaves 13 in `main` and 18 on the page.) |
| 5 | Where browser tests live | one new filter file, for boxes 3 to 5 | `target-app` has no Playwright and imports nothing; filter already serves the app by path (`serve-target-app.ts`). |
| 6 | How the filter test knows the pages | one written-out `TARGET_APP_PATHS` in `serve-target-app.ts`, checked against `pages.ts` read as text, used by both browser test files | Filter may not import target-app (`biome.json:73`). Reading the file as text follows `goals.test.ts`. |
| 7 | `ROUTES` shape | each route has steps with page, role and name, an `entrance` step, and `from` | s1-03 prints "entrance and final link" per route and s2-11 tells routes apart by `from`. Both come out of one table instead of being reconstructed. Superseded by 25 and 29: each route is its steps. |
| 8 | Kai's seed | 1027, hue 240 | 60° or more from every hue; the scan by the web reader. A face no other persona has. |
| 9 | Route-table cells in RULES | written to the rules as they stand: B for Kai "renamed (K1, K4)"; C for Kai "the term masked as `[unfamiliar term]` (K2) once `s1-05` lands"; Milo "P4" and Zoya "P1, P3, P4, and P3 already at home" | RULES line 84 gives an icon-only unknown control both decisions. K2's effect in RULES is a masked term. Zoya's 24 px font cut removes every link (calibration row). The task marks the table as a proposal to check against. |
| 10 | Stale statements outside the list | fix PLAN F9 AC5 and the README lines; leave `tasks/m0-06-target-app.md` | A false sentence in a living doc misleads the next agent. A week 1 task file records what was decided then and is not rewritten. |
| 11 | `bench-perceive.ts` four ids | leave | A timing script, not a test. Kai's numbers equal Ada's in `perceive` today. |
| 12 | `knownPatterns` for Kai | all seven patterns not in `unknownPatterns` | It changes nothing in the filter (RULES line 84). Listing every known pattern documents the bundle in full (review finding 6). |
| 13 | A copy of `ROUTES` for s1-03 and s2-11 | not in this task | They cannot import target-app. Each copies `ROUTES` with a drift test, as core does with `GOALS`, when it needs the table. Named as a follow-up. |
| 14 | `role="menu"` on a `ul` fails Biome's `noNoninteractiveElementToInteractiveRole` (build) | keep the spec's markup, `biome-ignore` on that `ul` | Same suppression as `web/src/preview/perceived-page.tsx`; `pages.test.ts` strips comments. |
| 15 | Stale comments outside the list (build) | fix `pages.ts` and README "URL contract" lines, and the `constraintCount` comment in `core/src/profile.ts` | They described the four-persona, six-page state. One-line comment edits. |
| 16 | Hard-contrast Vera in the browser test (build) | Vera with `contrast` rebuilt without `softness`, other thresholds unchanged | That is "softness 0" in the profile schema. |
| 17 | Route C click test start (build) | starts on `/settings` and clicks "Your data" first | Covers the whole C path from the entrance on. |
| 18 | Closed-menu check (build) | "the closed menu's entries are not measured" and "Past orders" hidden before the click | The step check found the task's "`display: none`, so `collect` does not measure them" untested. |
| 19 | Route table columns (build) | Milo and Zoya get a column each; Zoya "closed at home (P3)" on every route | Measured: Zoya's 24 px font cut removes every link on `/`, so per-entrance rules said less than the truth. |
| 20 | "Sweep on contrast" wording (build) | "the bound is not guaranteed" for other personas | Claim less: nothing shows it broken for Ada or Kai. |
| 21 | `closedBy` on `Route` (build, branch review) | removed | It said K1 and K4 close route B, which RULES contradicts (they rename), and nothing reads it. The RULES route table and the README say which dimension each route tests. |
| 22 | CSS-side `.entrance` test (build, branch review) | removed, with the unused `data-entrance` class | The filter browser test measures the box, as the reviewer note asks; a 34 px entrance fails it. |
| 23 | Where the copy of `ROUTES` goes (build, branch review) | one copy beside `TARGET_APP_PATHS`, made by whichever of `s1-03` and `s2-11` needs it first | Agent already imports `serve-target-app`, so one copy and one drift test serve both. |
| 24 | Kai's caps cited to PIAAC and Cowan (build, branch review) | marked folk, set against those references | Neither source gives 10 or 2. Claim less. |
| 25 | `Route.entrance` (PR #143 review) | removed; steps inline in `ROUTES` | Nothing in this task reads it; the only check compared it with itself. `s1-03` adds it when it copies `ROUTES`. |
| 26 | Kai's description (PR #143 review) | "does not know several common interface patterns" instead of the task's "knows few" | Kai knows 7 of the 12 patterns; the card must not claim more than the bundle holds. |
| 27 | Kebab menu placement (PR #143 review) | in normal flow, pushing the content down, instead of an absolute overlay | The open overlay covered elements `collect` still measures, and a click at the centre of a covered paragraph landed on a menu item. `collect` has no check for covered elements. |
| 28 | "Fulfilment ledger is its only link to the archive" (PR #143 review) | a guard that the only links to the archive, across all pages, are the last steps of `ROUTES` | Nothing tested it: a plain "Your orders" link on `/settings/data` left every test green, and it is what makes C a vocabulary route. |
| 29 | `Route.from` (PR #143 review) | removed; the last step's page is the from-page | It always equalled the last step's page, the same reasoning as decision 25. |
| 30 | Finding an entrance in `pages.test.ts` (PR #143 review) | one way, through the controls of a page's markup | A second regex for `.entrance` duplicated what the controls filter already found. |
| 31 | Docs nits (PR #143 review) | RULES says K2 vocabulary is the one dimension Zoya does not set; Kai's description says "knows only everyday shop words"; the README's route wording; `pages.ts` says the steps are in desktop click order | Each line claimed more than the bundle or the routes hold. |

## Risks

- **A1 on `/settings/data` and `/account`.** Kai's cap of 10 leaves about five slots after the header. With the ledger second, it may still fall to A1 under `s1-03`'s salience. If A1 cuts a B or C step at Kai's cap, `s1-03` raises the cap (its constraints); the route table keeps B and C open.
- **Sub-pixel layout.** The entrances sit 4 px from either cut. Glyph drift is about 1/64 px, so they are safe.
- **#125 is open.** "No text-bearing element without contrast" cannot see a partly unmeasured element. The target app has no background image and no colour scheme, so every run is measurable; the risk is only that a future CSS change hides a gap.
- **Two-approval review on RULES.** Reviewers should be asked when the PR opens, not after.

## Review note

Spec review, round 1: ready after fixes, no blocking findings. Every finding was taken.

- (should) The "Sweep on contrast" row in RULES is limited to a persona whose B and C entrances P4 closes.
- (should) PLAN F9 AC5's Kai sentence is rewritten as a bound per route.
- (should) The walk in `pages.test.ts`:
  - skips only what an entrance controls, not every menuitem;
  - asserts that every menuitem sits in `#more-menu`;
  - gains the other half of the claim: following the hard link reaches the archive.
- (nit) No new `page-script.test.ts` case; box 1 maps to the existing `wireMenu` tests.
- (nit) A "Kai sees what Ada sees" unit test is added.
- (nit) Kai lists all seven known patterns, and both lists are marked folk.
- (nit) The kebab menu's "Delivery address" item is replaced by a dead "Sign out" button, so the easy goal gains no route.
- (nit) Filter keeps one page list, `TARGET_APP_PATHS`, behind one drift test.
- (nit) The accent contrast is corrected to about 6.4:1. `closedBy` now holds RULES stage names.
