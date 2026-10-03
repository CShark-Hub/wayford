# s1-04 — Target app: three routes to the hard goal, and Kai

Stream: s1
Milestone: week 3
Size: M
Depends on: none

## Context

Read first, in this order:

- `AGENTS.md` sections "Persona is a filter, not a prompt" and "A profile is a capability bundle, not a job title"
- `docs/RULES.md` sections "Persona composition" and "Calibration"
- `tasks/m0-06-target-app.md` — the URL contract, the hard link and its follow-ups
- `packages/target-app/` — the pages, `src/pages.ts`, `src/page-script.ts` (`wireMenu`), `src/pages.test.ts` and `README.md`
- `packages/core/src/fixtures/profiles/` and `packages/core/src/profile.test.ts` — the four bundles Kai joins and the tests over them

## Goal

The hard goal ("you want to see what you ordered three months ago") has three routes, each closed by a different capability dimension, and a fifth persona, Kai, who sees everything Ada sees and differs from her only in knowledge, attention and memory.

Why: today every persona differs from Ada only in what perception removed, so the result says how legible a page is, which axe-core can say without an agent. A route closed by an unknown pattern, an unknown word or a crowded page is a question about who the page works for, and only a goal-directed run answers it. For that to hold, the filter must leave Kai a route that is open but hard to read, so whether Kai gets through depends on the agent's choices, not on the filter alone.

## Interface

- In: nothing new
- Out:
  - a page `/settings/data`, an icon-only menu on `/account` and a "Your data" link on `/settings`;
  - `ROUTES` in `src/pages.ts`, naming each route to the hard goal and the page it reaches the archive from;
  - the profile fixture `prof_kai`, and Vera's `maxElements` raised to 20;
  - in `docs/RULES.md`: Kai's row, Vera's new cap, the new sort rule and the calibration rows below.
- Files expected to change:
  - `packages/target-app/**`;
  - `packages/core/src/fixtures/profiles/kai.yaml` and `vera.yaml`, `packages/core/src/fixtures/index.ts`, `packages/core/src/profile.test.ts`;
  - `packages/web/src/avatar/parts.test.ts`, which pins every fixture's avatar;
  - a browser test in `packages/filter/src/`;
  - `docs/RULES.md`;
  - the persona count, names and sort rule in `AGENTS.md` ("Current state" and "English only, no locales").

## Constraints

- Every route ends at `/deliveries/archive`, so the hard goal's success condition and core `tasks.json` stay as they are.
  - **A, perception.** Home → Deliveries → "Order archive". Unchanged. `/deliveries` and the hard link are not touched: s1-01's boxes, s1-03's #89 box and the measurement fixture are written against them.
  - **B, knowledge (K1, K4).** Home → Your account → an icon-only "more" menu → "Past orders". The kebab uses conventional markup:
    - a `button` whose only visible content is an `aria-hidden` icon;
    - accessible name "More options", with `aria-haspopup="menu"` and `aria-expanded`.

    s1-03's detector must find it from role, name and the measured attributes, never from anything special to this app. It opens and closes through page script in the style of `wireMenu`, tested without a browser. A closed menu's entries are `display: none`, so `collect` does not measure them.
  - **C, vocabulary and attention (K2, A1).** Home → Settings → "Your data" → "Fulfilment ledger".
    - `/settings/data` lists what the shop keeps, with about 15 to 20 controls and text blocks, as many as a real data page. The other entries carry plain labels for other data (contact details, saved addresses and the like), never a plain label for orders.
    - "Fulfilment ledger" is its only link to the archive, styled like its neighbours. It is in the first screenful, but not first.
- **The entrances to B and C close for Vera, not for Kai.** Decided on 2026-10-01, so that the contrast sweep on Vera still measures one route:
  - The kebab and the "Your data" link each measure a target between 24 and 31 px: `targetPx`, the smaller side of the area a click activates.
  - That passes WCAG 2.5.8 AA (24 px). It falls below Vera's hard 32 px P4 cut, and below Milo's and Zoya's.
  - So Vera reaches the archive only through route A, at every contrast threshold. Ada and Kai, who have no target cut, keep B and C.
- **Each entrance sits in the first screenful of main content, directly under the page heading**, so a persona with an attention cap reaches it before the page's later content. Route A's faint link stays where it is, at the bottom.
- `/settings/data` passes WCAG AA on everything this filter measures:
  - every text block and control at contrast 4.5:1 or more;
  - every control at a target of 24 px or more;
  - every element that carries text has a measured contrast, none left out for an unknown background (issue #125).

  That page is what lets the report say "no WCAG failure here, and Kai still did not get through".
- No new tunable parameter. Only the hard link reads the CSS variables (`src/params.ts`).
- **Vera's `maxElements` goes from 12 to 20, decided on 2026-10-01.** On `/deliveries` she is shown 18 elements (13 since #124's text-block half, still one over a cap of 12), and "Order archive" is the least salient on contrast, font size and position, so at 12 the attention cut always removes it when perception shows it (#89). At 20 the contrast sweep measures perception, as it is meant to.
- **The sort rule changes, decided on 2026-10-01.** The persona keeps the name Kai.
  - Alphabetical order no longer has to follow the number of constraints a persona switches on: with this bundle Kai has 7, against Milo's 3. Ada stays first, the control persona with nothing switched on, and Zoya stays last, with the most.
  - Change the test "alphabetical order is the order of how much filter each persona switches on" (`profile.test.ts:295`) to that, and update the RULES paragraph under the persona table and the `AGENTS.md` line that say otherwise. The initial still names the dimension: K for knowledge.
- Kai's bundle, a proposal for review in this task's PR, written into `docs/RULES.md` "Persona composition":
  - Perception: none. Device `desktop`, emulation `none`.
  - Knowledge: unknown `hamburger`, `kebab`, `breadcrumb`, `tabs` and `accordion`. `domainVocabulary`: a short list of everyday shop words, without "fulfilment" or "ledger". K2 reads it once `s1-05` lands.
  - Attention and memory: `maxElements` 10, `memorySteps` 2.
    - A cap the page header alone fills tests the header, not the routes: five elements on every page after #124. s1-03 may still raise the cap; see its constraints.
    - Reference points in the row: PIAAC level 1 and Cowan 2001, as for the other bundles. The caps carry no provenance field in `Profile`, so the row names its sources, and the pattern and vocabulary lists are `folk`.
  - Behaviour: `budgetSeconds` 120.
  - `description`: one line naming the bundle, with no diagnosis and no job. For example: "Sees the page clearly on a desktop, knows few interface patterns and little shop vocabulary, takes in a handful of things at a time and keeps only the last couple of steps in mind."
  - `seed`: chosen so that Kai's avatar hue differs from the other four (`parts.test.ts`).
- Calibration rows in `docs/RULES.md`:
  - New: Kai at the target app's defaults has no perception decision on any page, so every difference between Kai's runs and Ada's comes from stages 4 to 6.
  - New: `/settings/data` has no element failing P1 or P4 at the WCAG AA anchors (4.5:1, 24 px), and no text-bearing element without a measured contrast.
  - Changed: the "hard contrast cut" row becomes Vera with her contrast cut made hard (3.0, softness 0). She gets 0/10 on the hard goal, because P1 removes route A and P4 removes the entrances to B and C.
  - New: what the filter is expected to leave on each route, written before s1-03 and s1-05 implement it. They are checked against it.

    | Route | Ada | Kai | Vera | Milo, Zoya |
    |---|---|---|---|---|
    | A | open | may be cut by A1 | P1 decides per seed: degraded or cut | closed (P4, and font for Zoya) |
    | B | open | open: the kebab shown renamed (K4) | closed at the entrance (P4) | closed at the entrance (P4) |
    | C | open | open: "Your data" shown, "Fulfilment ledger" masked once `s1-05` lands | closed at the entrance (P4) | closed at the entrance (P4) |
- Ada's row stays: route A is still her shortest. Zoya stays as `m0-08` decided (issue #23).

## Acceptance

- [x] `pnpm --filter @wayford/target-app test` passes, and its tests show: 6 files, 142 tests. "PAGES lists /settings/data" and "ROUTES names three routes, each a walk of real links" walk every step of A, B and C against the markup: each link's text, its href to the next step's page and the archive on the last. The menu's script is `wireMenu`, unchanged, so the existing "each click flips aria-expanded and the nav's open class together" covers it without a browser; the kebab's wiring in `main.ts` is proven in the browser (box 3).
  - `PAGES` lists `/settings/data`, and `ROUTES` names three routes to the hard goal;
  - every link on routes B and C resolves to a page in `PAGES`;
  - the menu's script opens and closes it and flips `aria-expanded`, without a browser.
- [x] `pages.test.ts` "the hard goal is reached only through the one hard link" becomes a test that the hard link is the only route to the archive without passing an entrance under 32 px "the hard link is the only route to the archive without passing an entrance under 32 px": skipping the hard link, the two `.entrance` controls and what they open, the walk misses the archive; following the hard link it reaches it. "Under 32 px" is measured, not read from CSS: "the entrances measure a target from 24 to 31 px" in filter (box 4), as the reviewer note asks.
- [x] A browser test on the served target app: `getByRole("button", { name: "More options" })` on `/account` opens the menu, "Past orders" then navigates to `/deliveries/archive`, and "Fulfilment ledger" on `/settings/data` does too `packages/filter/src/target-app-routes.browser.test.ts`: "route B: the kebab opens its menu, and Past orders reaches the archive" (the item is hidden before the click and shown after, `aria-expanded` false then true) and "route C: Your data, then Fulfilment ledger, reaches the archive". The tests live in filter, which already serves the app; target-app has no Playwright.
- [x] A browser test in `packages/filter`: "the entrances measure a target from 24 to 31 px" (kebab 28, "Your data" 28) and "/settings/data passes AA on every measured metric" (lowest contrast 6.386, smallest control 27 px, every element with `fontPx` has `contrast`; the test also requires controls, text blocks and the ledger on the page). "the closed menu's entries are not measured" checks no `menuitem` on `/account` while the menu is closed.
  - `collect` measures the kebab and the "Your data" link at a `targetPx` from 24 to 31;
  - on `/settings/data` every text block and control measures contrast 4.5 or more, every control `targetPx` 24 or more, and no text-bearing element lacks `contrast`.
- [x] `perceive` on the collected measurement of every target-app page, run seeds 1 to 100: Kai's evidence carries no perception decision, and Vera's carries a P4 decision on both entrances "Kai: no perception decision on any page, seeds 1 to 100", "Vera: P4 on both entrances, invisible, seeds 1 to 100", and the changed calibration row in "Vera with a hard contrast cut of 3.0 loses all three routes, seeds 1 to 100". The seven pages come from `TARGET_APP_PATHS` in `serve-target-app.ts`, kept equal to `PAGES` by "TARGET_APP_PATHS equals the paths in target-app's PAGES".
- [x] `kai.yaml` validates against `Profile` and round-trips through YAML unchanged; `profileFixture("prof_kai")` returns it; the fixture tests that iterate over personas cover all five, and the five avatar hues differ "there are five of them and each one validates", "each one round-trips through YAML", "Kai sees what Ada sees" (which calls `profileFixture("prof_kai")`), and `parts.test.ts` "the five fixtures get five different hues": Kai's seed 1027 gives hue 240, 60 degrees from Vera and Zoya. `perceive.test.ts` and `web/src/router.test.tsx` pinned four personas and now pin five.
- [x] `git diff origin/main -- packages/target-app/deliveries.html packages/target-app/src/params.ts` is empty Empty.
- [x] `docs/RULES.md` has Kai's row, Vera's cap of 20, the sort rule and the calibration rows; `AGENTS.md` names five personas; `packages/target-app/README.md` "Goals" lists the three routes `profile.test.ts` checks the bundle table against the fixtures both ways (Kai second, Vera 20). The sort paragraph, three new calibration rows, the rewritten "hard contrast cut" and "Sweep on contrast" rows, and the route table are in "Calibration"; AGENTS lines 18 and 78 name five; README "Goals" has the route table.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root 60 files, 998 tests (974 in 59 on `main` before).

## Outcome

Built as `docs/specs/2026-10-02-s1-04-target-app-routes.md` says; its decision log has every choice, the ones taken during the build marked "(build)". What a reader of this file should know:

- **Files outside the expected list.** `packages/filter/src/perceive.test.ts` and `packages/web/src/router.test.tsx` pinned four personas and failed once `kai.yaml` existed. `packages/filter/src/serve-target-app.ts` now exports `TARGET_APP_PATHS`, filter's one written-out page list. `docs/PLAN.md` F9 AC5 said the hard goal had one route; it now says so only for a persona whose B and C entrances P4 closes. The `constraintCount` comment in `packages/core/src/profile.ts` no longer claims the count orders the fixtures.
- **The kebab's menu** is the ARIA menu-button markup (`role="menu"`, `li role="none"`, `menuitem` entries), with a third entry, a dead "Sign out" button, so no entry leads to the easy goal. Biome's `noNoninteractiveElementToInteractiveRole` is suppressed on that one `ul`.
- **The open menu sits in normal flow** and pushes the content down, the way the mobile nav does. As an overlay it covered elements `collect` still measures, and a click on a covered paragraph landed on a menu item. A filter browser test now guards that the open menu covers nothing measured.
- **`ROUTES`** has no entrance and no from field: each route is its steps, and the last step's page is where it reaches the archive from. Nothing in this task reads an entrance; `s1-03` adds it when it copies `ROUTES` and prints each route's entrance. A test guards that the only links to the archive are the last steps of `ROUTES`. Kai's `description` says "does not know several common interface patterns" rather than the example's "knows few", since Kai knows seven of the twelve, and "knows only everyday shop words" rather than "little shop vocabulary", since Kai lacks only the jargon. Which dimension each route tests is in the RULES route table and the README, not in code: nothing reads it, and K1 and K4 rename rather than close.
- **The route table cells** follow the rules as they stand: Kai's kebab carries K1 and K4, K2 masks the term, and Zoya is stopped at home by P3 on every route. Milo and Zoya have a column each.
- **`fixtures/index.ts`** needed no change: it reads every profile file.
- **Follow-ups.** `ROUTES` cannot be imported by `s1-03` or `s2-11` (filter and agent may not import target-app). The first of them to need it puts one copy beside `TARGET_APP_PATHS` in `packages/filter/src/serve-target-app.ts`, behind one drift test like the one that guards the page list; agent already imports that module, so both use the one copy. `collect` does not measure `aria-haspopup` or `aria-expanded`, so `s1-03` detects the kebab from its role, its name and its missing text metrics, or extends `collect`. Whether Kai's cap of 10 leaves the B and C steps shown is `s1-03`'s to settle, as its constraints say. `tasks/m0-06-target-app.md` still says "Do not use icon-only controls" and lists six pages: it records week 1 and is not rewritten.

## Out of scope

- The rules themselves: K1, K4 and A1 are `s1-03`, K2 is `s1-05`.
- axe-core. The sidecar is week 4 (F10); this task checks WCAG AA with the filter's own measurement.
- A second hard goal, or any change to the easy goal.
- Preview, ring or dashboard screens for a fifth persona; only the avatar test that pins every fixture changes.
- Softening Zoya.

## Notes for the reviewer

- Two reviewers: the task changes `docs/RULES.md`.
- Read Kai's `description` and RULES row as someone outside the team would: a bundle of capabilities, no diagnosis, no "impaired".
- Check the kebab is markup a real site would use, so detecting it in `s1-03` proves something beyond this app.
- Check route C reads like a real data page and not like a trap: one jargon label among plain ones, not a page built so that nobody can pass.
- Check the entrance sizes in the browser test, not in CSS: the target is the measured click area.
