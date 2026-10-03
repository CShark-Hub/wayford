# s1-03 — Filter: knowledge and attention stages: spec

Task: `tasks/s1-03-knowledge-attention.md` · Branch: `feature/s1-03-knowledge-attention`, stacked on `fix/124-text-block-own-text` (PR #147) · Date: 2026-10-03
Status: approved 2026-10-03

## Goal

`perceive` applies K1 and K4 (a persona that does not know a pattern reads a bare role) and A1 (a persona with a cap sees the most salient elements first, and only as many as it can hold).

## Constraints that bind

- "The persona is a filter, not a prompt" (`AGENTS.md`). Stages 4 and 5 change what the Actor reads; nothing goes into a prompt.
- Stage 4 is "Deterministic. No dice. The persona either knows a pattern or does not" (`docs/RULES.md` stage 4). A pattern is unknown only when the profile lists it; `knownPatterns` changes nothing in the filter.
- Detection is heuristics on role, name, position and measured attributes; each detector is a pure function with a page where it fires and one where it must not. "Wrong detection is a bug, not a finding" (task).
- A renamed element reads its bare role in `renamedName` (the #16 field), "never as partly legible"; its perception state stays (task, `RULES.md:43`).
- A1: salience from size, contrast and position, written into RULES stage 5 before the code; then truncation to `maxElements`. Cut elements stay in the evidence as `invisible` with an A1 decision and count in `hiddenCount` (task).
- Salience is defined for an element with no text metrics "by what it has", never a default that puts it first or last (task).
- Kai's routes B and C stay open in the filter; if they do not survive his cap "under a formula that makes sense to a person", raise the cap in RULES and the fixture and say so in the PR. "Never tune the formula to the target app" (task).
- A1 never reads the perception state; it must not cut Vera's "Order archive" or nav "Deliveries" where perception shows them (#89).
- Pipeline order: viewport, perception, knowledge, attention. Monotone in the cap: a smaller `maxElements` shows a subset (F9 relies on it). A3 is cut: RULES says A1 alone shows a prefix of one salience order.
- `@wayford/filter/perceive` stays browser-safe and under 5 ms on `measurementFixture`.
- Out of scope: K2 (`s1-05`), K3, A3, M1, behaviour dice, preview sliders for the caps.
- RULES is frozen and `measurement.ts` is the filter's input contract: two approvals.

## Design

### Stage 4: knowledge (K1, K4)

**Two measured facts.** `MeasuredElement` (`packages/core/src/measurement.ts`) gains two optional fields, written only when present and only on controls (a refine rejects them on a text block, as `targetPx` is refined today). Neither is in the key, so no roll moves.

```ts
export const PopupKind = z.enum(["menu", "listbox", "tree", "grid", "dialog"]);
// on MeasuredElement:
hasPopup: PopupKind.optional(),   // aria-haspopup, trimmed and lowercased; "true" is "menu" (ARIA 1.2); "false" or unknown left out
controls: AriaRole.optional(),    // role of the first aria-controls id that exists, hidden or not; left out unless /^[a-z]+$/
```

`measure-page.ts` reads both raw inside `measurePage` for controls only; `collect.ts` cleans them after the metrics with core's own `PopupKind` and `AriaRole` (build). On the target app only the kebab (`main//button:More options`, `{hasPopup: menu, controls: menu}`, metrics `{targetPx: 28}`) and the phone toggle (`banner//button:Menu`, `{controls: navigation}`) carry either. `measurement.json` (`/deliveries`) gains nothing and is not regenerated.

**Icon-only is derived**, not measured: a control with no `fontPx`. `collect` sets `fontPx` exactly when the element draws text, and core already says "an icon has no font size".

**Detectors** (new `packages/filter/src/knowledge.ts`, pure, core types only):

| Pattern | Fires on | Source |
|---|---|---|
| `hamburger` | a `button` whose outermost landmark (the key's leading run) is none, `banner` or `navigation`, and whose `controls` is `navigation` | WAI-ARIA APG disclosure navigation |
| `kebab` | a `button` that draws no text, whose `hasPopup` is `menu`, and whose name starts with More, Options or Actions | WAI-ARIA APG menu button |

`detectPattern(element)` returns the first that fires (an element matches at most one pattern). `knowledgeDecisions(element, unknownPatterns)` returns `[]` unless that pattern is unknown and the control draws no text, else `[K1, K4]` (review: a control that draws its word is read by it). Every decision names its `pattern`. The other ten pattern ids get no detector: none occurs on the target app, so none could be tested where it fires. RULES says they never fire, so a run is not evidence about them. Kai's breadcrumb, tabs and accordion change nothing.

**Effect.** `renamedName = element.role`: Kai reads `button "button"` where Ada reads `button "More options"`. K1 and K4 are decided on every element, also those V2 or perception made invisible (as P already runs on V2-cut elements). A renamed element keeps its state and carries no `maskedName`. The Actor reads it as visible (`toActorObservation`), and the preview does not draw it muted.

### Stage 5: attention (A1)

New `packages/filter/src/attention.ts`, pure: `salience(element, viewport)` and `salienceOrder(elements, viewport)`.

**Salience.** Three terms, each 0 to 1. It reads only the element's bbox, metrics and the page viewport, never a state, threshold, profile or seed:

| Term | Value | Anchor |
|---|---|---|
| size `S` | `min(1, s / 24)`, `s` the font size; for an element that draws no text, the smaller side of its box ÷ 1.5 | 24 px large-scale text (WCAG 2.2, 1.4.3); line height 1.5 (1.4.12) |
| contrast `C` | `min(1, (c − 1) / 3.5)`, `c` the measured ratio; absent when none was measured | 4.5:1, AA for text (1.4.3) |
| position `P` | `1 − y × (1 + x) / 2`, `x`, `y` the box's top-left as a share of the viewport, each clamped to 0..1 | F-pattern (NN/g 2006) |

Salience is the mean of the terms present: `(S + C + P) / 3`, or `(S + P) / 2` with no contrast. Only `+ − × ÷ min max`, so every engine, browser preview or Node, gives the same bit. The kebab (28 × 28, no text): `S` 0.778, `P` 0.866, salience 0.822.

**Order and cut.** A1 applies only when the profile sets `maxElements`. Then all elements of the measurement, the removed ones too, are put in one order: higher salience first, equal salience in measurement order. The evidence array follows that order, and shown elements are numbered `e1..eN` down it. The order covers every element, but the cut counts only the elements stages 1 to 3 left shown: of those, the first `maxElements` stay. Each later one gets `{stage: "attention", rule: "A1"}`, becomes invisible and counts in `hiddenCount`. With no cap (Ada), the order is measurement order. Because the order reads no state, a smaller cap always shows a prefix of the same order.

**Results on the target app** (desktop, defaults, scratch runs over the real `collect` output):
- Zoya's real profile leaves her 1 element on `/` (P3), so her cap cuts nothing. With perception off, her first five are: heading "Welcome back, Sam", brand, then the nav links Home, Your account and Deliveries.
- At cap 10, A1 cuts "Fulfilment ledger" (11th of 18 on `/settings/data`), route C's final link. **Kai's cap goes to 11**, the smallest cap that keeps routes B and C open. A1 still cuts on every page but `/account/address`. Route A's "Order archive" is the least salient of 14 on `/deliveries`, so A1 closes route A for Kai.
- What Kai sees at cap 11 (the task's reviewer note asks for these):
  - `/account`, shown in order: heading "Your account", Quillmere, the four nav links, paragraph "Keep your details up to date.", headings "Delivery address" and "Personal details", the kebab as `button "button"`, paragraph "Where your parcels are sent.". Cut: link "Delivery address", the name-and-email paragraph, heading "Recent activity" and its paragraph. The blue "Delivery address" link (0.813) falls just under the paragraph above it (0.816): the formula cannot see a link's colour, only its text contrast.
  - `/settings/data`, shown in order: headings "Your data" and "What we keep", Quillmere, the four nav links, the lead paragraph, heading "Your rights", links "Contact details" and "Fulfilment ledger". Cut: links "Saved addresses", "Delivery preferences", "Notification choices", "Sign-in activity" and "Marketing choices", the "You can ask for a copy" paragraph and the "Request a copy of my data" button.
- Vera (cap 20) has at most 13 shown elements on `/` and `/deliveries`. #89 holds on headroom: 0 cuts in 38,005 shown cases.
- Monotone in the cap: 85,000 cases, 0 violations. Ordering costs about 3 µs on the fixture.

### `perceive`

```ts
export type PerceiveProfile = Pick<Profile, "perception"> & {
  knowledge: Pick<Knowledge, "unknownPatterns">;
  behaviour: Pick<Behaviour, "maxElements">;
};
export function perceive(measurement: PageMeasurement, profile: PerceiveProfile, runSeed: Seed): FullObservation
```

A full `Profile` fits, and the profile seed is still never read. Callers that pass `{ perception }` alone stop compiling, on purpose (F2 AC3).

1. Pass 1, in measurement order: V2, then P1, P3, P4 as today, then `knowledgeDecisions`. `belowFoldCount` is unchanged.
2. Stage 5, when a cap is set: `salienceOrder`, then walk it, skip invisible elements, keep `cap`, and give A1 to the rest.
3. Final pass, over the order: the state, `ref e${n}` for shown elements, `renamedName` where a knowledge decision exists, and `maskedName` only when degraded and not renamed.

`FullObservation`'s schema does not change. `measurement.ts`'s sentence on `e1..eN` (`:9-10`) is reworded: refs follow measurement order, or salience order when the profile sets `maxElements`. That makes `observation.ts:413-414` true.

### Web preview (F2 AC3)

`search.ts`'s `PreviewState` gains `profile: Profile = { ...persona, perception }`, and `preview.tsx:383` passes `state.profile`. `perceived-page.tsx` draws a box muted only when the element is degraded and not renamed. The comment on its keys now says salience reads no threshold, so a slider never moves an element.

### `routes` (no model)

`pnpm --filter @wayford/filter routes` prints persona × route × step: shown, renamed (K1[, K4]), masked (rules) or cut (rules), with the A1 rank `r of n`, and per route `open`, `closed at the <home|entrance|final link> (<rules>)` or `per seed (<rules>)` over seeds 1 to 100.
- `src/route-table.ts` is pure: it gives each step's outcome. When names repeat, the best outcome wins, ties to the one the persona reads first (build). A route closes at its first cut step.
- `src/route-walk.ts` (Node, Playwright) serves the app on port 0 at its defaults and walks each route on each persona's device. A step on the same page as the one before is reached by clicking that step (the kebab, then Past orders). On a phone, a step behind the hamburger toggle is reached through it, and the toggle is recorded as a home step of its own: when the filter cuts it, the route closes there, and when it renames it, the table says so. Milo's toggle measures 46 px against his 44 px cut, so this matters at a 2 px margin.
- `TARGET_APP_ROUTES` (a copy of `pages.ts` `ROUTES`, beside `TARGET_APP_PATHS`) is a copy guarded by a drift test: filter may not import target-app (`docs/STACK.md`). The device descriptors are not copied (review): `DEVICE_DESCRIPTORS` lives in `serve-target-app.ts` and agent's `device.ts` imports it, so the route walk and the Actor emulate the same devices. Agent already imports `serve-target-app`, so `s2-11` can read `TARGET_APP_ROUTES` from there instead of keeping its own.
- `scripts/routes.ts` prints the tables. `routes.browser.test.ts` parses the RULES route table and compares each cell up to its first colon, by header (precedent: `profile.test.ts` `bundleRows`).

### Tests on real pages

The task's desktop boxes go into the existing `target-app-routes.browser.test.ts`, which already collects every page at the defaults at 1280 × 720: Kai on `/account` and `/settings/data`, the kebab firing or not, and #89. One new browser file, `routes.browser.test.ts`, serves the app once for the phone boxes (the hamburger firing or not) and the route table. That keeps the new Chromium work to one served app, against the load flake under Risks.

### RULES changes (frozen: two approvals)

- **"What is measured":** one sentence on `hasPopup` and `controls` (stage 4 only, never in the key), and "a control that draws no text has no font size; stage 4 reads that as icon-only".
- **K1 effect:** "element name replaced by its bare role: where Ada reads `button "More options"`, the persona reads `button "button"`". It drops "button, icon only", which would print the role twice and is false for the text toggle "Menu".
- **K4 input:** "icon-only control, one that draws no text so no font size is measured, whose pattern is in `unknownPatterns`".
- **Detection:** a paragraph replacing `RULES.md:93`. It gives the inputs and "an element matches at most one pattern", then the two-row detector table with where each fires and must not. The other ten ids "have no detector yet, so K1 and K4 never fire for them", with `swipe` and `infiniteScroll` not elements. It lists the known misses, and says K1 and K4 are decided on every element.
- **A1 row and a new "Salience (A1)" block:** the formula above, order and cut (the order covers every element, the cut counts only the shown ones, so it reads with RULES:43's "A1 ranks and cuts only what stages 1 to 3 left shown"), why contrast stops at 4.5:1, why arithmetic only, sources. The shapes, cut-offs, equal weights and leaving a missing term out are `folk`. No new provenance id.
- **Monotone paragraph:** A1 alone ranks and cuts only what stages 1 to 3 left shown, and in its own cap shows a prefix of one salience order. A3 is not built, and whoever builds it fixes its order against A1. "boundary sweep" becomes "contrast sweep".
- **Calibration "Sweep on contrast":** "the attention cap (A1)", with no A3 and no "once `s1-03` lands".
- **Route preamble and table:** the table is what `routes` prints. Columns go in fixture order (Ada, Kai, Milo, Vera, Zoya), and each cell starts with a canonical phrase. Kai A: "closed at the final link (A1)". Kai B: "open: the kebab shown renamed (K1, K4)". Kai C: "open: … `s1-05` masks the term (K2)".
- **Kai's bundle row:** `maxElements` 11, "11 since `s1-03`, the smallest cap that keeps routes B and C open".

## Files

| File | Why |
|---|---|
| `packages/core/src/measurement.ts` | `PopupKind`, `hasPopup`, `controls`, the text-block refine, header doc (the two facts, icon-only, the `e1..eN` sentence) |
| `packages/core/src/measurement.test.ts` | a text block with either field, `hasPopup` "true" or "bogus", `controls` "doc-toc" are rejected; the kebab itself is `kebabElement` in core's fixtures, parsed when they load (build) |
| `packages/core/src/fixtures/profiles/kai.yaml` | `maxElements` 10 → 11 (constraint, "raise Kai's cap in RULES and the fixture") |
| `packages/filter/src/knowledge.ts` (new) | detectors, `detectPattern`, `knowledgeDecisions` |
| `packages/filter/src/attention.ts` (new) | `salience`, `salienceOrder` |
| `packages/filter/src/perceive.ts` | `PerceiveProfile`, stages 4 and 5, the final pass, doc block |
| `packages/filter/src/measure-page.ts`, `collect.ts` | read and copy `hasPopup` and `controls` |
| `packages/filter/src/serve-target-app.ts` | `TARGET_APP_ROUTES` beside `TARGET_APP_PATHS` |
| `packages/filter/src/route-table.ts`, `route-walk.ts` (new); `scripts/routes.ts` (new); `package.json` | the `routes` script |
| `packages/filter/scripts/bench-perceive.ts` | add Kai, the persona A1 cuts on the fixture |
| `packages/filter/src/knowledge.test.ts`, `attention.test.ts` (new) | unit tests named by the task |
| `packages/filter/src/target-app-routes.browser.test.ts` | the desktop boxes, on the pages it already collects |
| `packages/filter/src/routes.browser.test.ts` (new) | the phone boxes, the route table, the routes drift test; one served app |
| `packages/filter/src/perceive.test.ts`, `perceive-imports.test.ts`, `collect.browser.test.ts`, `collect-rules.browser.test.ts` | new signature; the import list; `comparable` and attribute cases |
| `packages/web/src/preview/search.ts`, `screens/preview.tsx`, `preview/perceived-page.tsx` and their tests | whole persona (task: "the preview in `packages/web`") |
| `docs/RULES.md` | as above |
| `docs/specs/2026-10-03-s1-03-knowledge-attention.md` | this spec |

Outside the task's list: `kai.yaml` (the task's own constraint says to raise the cap in the fixture); `serve-target-app.ts` (the routes copy, since filter may not import target-app, and the shared device map) and `agent/src/device.ts` (it imports that map, review); `agent/src/history.test.ts` (its K1 example follows RULES' bare role); `packages/filter/package.json` and `scripts/routes.ts` (the acceptance box names `pnpm --filter @wayford/filter routes`, and scripts live in `scripts/` like `measure-fixture.ts`); `bench-perceive.ts` (the bench must exercise A1).

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| filter tests pass, with `knowledge.test.ts` and `attention.test.ts` | `pnpm --filter @wayford/filter test` |
| mobile: hamburger unknown reads the bare role; Milo reads "Menu" (amended in review: both read "Menu", the toggle draws its word) | `routes.browser.test.ts`: Pixel 7 `/`. Milo and Milo with hamburger unknown both read `button "Menu"`, the second with no knowledge decision; `knowledge.test.ts` pins `[K1, K4]` on an icon-only hamburger |
| desktop `/account`: Kai reads the bare role, Ada "More options" | `target-app-routes.browser.test.ts`: Kai `button "button"`, evidence `[K1 kebab, K4 kebab]`, visible (rank 10 of 15 at cap 11); Ada `button "More options"` |
| each detector fires on one page and not another | hamburger fires on Pixel 7 `/` and not on the kebab (`routes.browser.test.ts`); kebab fires on desktop `/account` and not on `/settings` (`target-app-routes.browser.test.ts`) or Pixel 7 `/`. `knowledge.test.ts` covers every branch with inline elements |
| Zoya on `/`, Kai on `/settings/data`: shown ≤ cap, `hiddenCount` = A1 decisions | `target-app-routes.browser.test.ts`, seeds 1 to 100. Kai 11 shown and 7 hidden. Zoya real (1 shown, vacuous by P3) and with perception off (5 shown and 11 hidden) |
| `routes` table matches RULES for all five personas; output in the PR | `routes.browser.test.ts`; `pnpm --filter @wayford/filter routes` |
| preview equals `perceive` with the whole persona | `search.test.ts`: every persona, seeds 1, 7, 4211. Not vacuous: Kai hides 3 on the fixture |
| same inputs twice give string-equal Actor text | `perceive.test.ts` on the fixture (every persona, seeds 1 to 100, existing) and `attention.test.ts` on the kebab page (every persona, seeds 1 to 20); `perceive` is pure, so real pages add no code path (review) |
| lowering `maxElements` 20 → 1 never adds an element | `attention.test.ts`: every persona, seeds 1 to 100, on the fixture and the kebab variant |
| #89: Vera never loses "Order archive" or nav "Deliveries" to A1 | `target-app-routes.browser.test.ts`: real `/` and `/deliveries`, thresholds 1.0 to 8.0 in steps of 0.25, seeds 1 to 1000, plus a tripwire that each page measures at most 20 elements (the box passes on headroom) |
| `bench:perceive` under 5 ms; `./perceive` import test | `pnpm --filter @wayford/filter bench:perceive`; `perceive-imports.test.ts` lists `knowledge.ts` and `attention.ts` |
| RULES stage 5 states the formula | manual check in the PR; `attention.test.ts` pins the RULES worked values (kebab 0.822, Order archive 0.487, no-contrast mean, ties) |
| root lint, typecheck, test | `pnpm lint`, `pnpm typecheck`, `pnpm test` |

## Decision log

| Question | Taken | Why |
|---|---|---|
| Salience base | Font size, linear contrast to 4.5:1, F-shaped position, mean of the terms present (one of three designs, with grafts) | Box-area size ranks column-wide muted paragraphs over links: "Your data", right under the h1, came last on `/settings`. Rank-means pool removed elements and need integer arithmetic. This one passes the person check the reviewers are told to run. |
| Size term | Font size capped at 24 px; an element that draws no text uses its box's smaller side ÷ 1.5 | Type size is the hierarchy cue; both numbers are WCAG anchors. `targetPx` exists only on controls and takes in a label's box, so it measures what a click reaches, not what the eye sees; box area ranks column-wide text over links. Cost: fill is not measured. |
| Contrast term | `min(1, (c − 1)/3.5)` | No log, so the same bit everywhere. AA is where text stops being hard to read; above it the ratio cannot see fill or hue. A 7:1 cut-off gives the same Kai cap (11), so this is not tuned to the app. |
| Position term | `1 − y(1+x)/2` | The F-pattern RULES already cites; the linear shape is folk. |
| Combination, missing contrast | Equal-weight mean of the terms present | Simplest. It never imputes first or last; the kebab ranks by size and position. |
| New provenance ids | None; the formula is `folk`, anchors cited | New ids are a core change (`primitives.test.ts`), and "claim less". |
| Kai's `maxElements` | 10 → 11 in `kai.yaml` and RULES; said in the PR | At 10, A1 cuts route C's final link (11th of 18). The task says to raise the cap, not tune the formula. 11 is the smallest that keeps B and C. |
| Does A1 reorder | Yes, when a cap is set: one salience order over all elements, refs down it | The goal, RULES:101 and `observation.ts:413-414` say so; refs must ascend in array order. Reading no state keeps the shown set a prefix. |
| Uncapped persona | Measurement order (Ada) | A1's input is `maxElements`, like an absent threshold. Milo and Vera (cap 20) read salience order though nothing is cut. |
| Rank on `AttentionDecision` | No field; `observation.ts` unchanged | The rank is the place in the evidence, and salience is recomputable from the stored bbox, metrics and viewport. |
| Which patterns get detectors | hamburger, kebab | The boxes name them; they are the only element patterns on the target app. The other ten never fire, said in RULES. |
| Icon-only | Derived: a control with no `fontPx` | One field fewer in the contract; cost is a glyph "⋮" kebab. |
| Measured fields | `hasPopup`, `controls`; no `aria-expanded` | Exactly what the detectors read, normalised so `collect` never throws on an exotic role. Rejected: s1-04's no-contract option, detecting by role, name and the missing font size alone. It works for the kebab but not the hamburger, which draws the text "Menu": detecting it by name fires on a footer "Menu" link or a restaurant's menu button. Wrong detection is a bug (task), so the two-approval change to the input contract is worth it. |
| K1/K4 on removed elements | Decided on every element | RULES:43 records every rule an element fails; P already runs on V2-cut elements. |
| Renamed text | `renamedName = role` (`button "button"`); RULES' "button, icon only" example fixed | "Bare role" is the task's wording; core pins `link "link"`. |
| Renamed and degraded | Evidence keeps degraded, no mask; Actor reads visible; preview not muted | Constraint 33 and the schema (a mask beside a rename fails). |
| `perceive`'s profile type | `PerceiveProfile` | It documents what perceive reads; `Pick<Profile, "behaviour">` would require `budgetSeconds` in every test literal. |
| Fixtures | `measurement.json` unchanged; tests use inline elements | No `/deliveries` control carries the new fields; boxes differ across OSes. |
| `routes` duplicates and labels | Best outcome wins, ties to the one the persona reads first (build: was measurement order); home / entrance / final link | `/` has two "Your account" links; ties must not depend on salience. |
| Exporting `route-table` | Not exported | No consumer yet (F8 AC6 is week 4). |
| (build) Kebab names | "More", "Options" or "Actions" first, alone or after "Show" | The detector's pattern accepts "Show more"; RULES states what the code does. |
| (build) RULES:43, "A1 and A3 rank and cut only what stages 1 to 3 left shown" | "cut only", with A1 still ordering every element | The salience order covers every element; only the cut is limited to shown ones. |
| (build) The preview's caption | "Vera, seed 1" / "Vera, thresholds edited, seed 1" | With caps and patterns applied, "Kai's thresholds" misnamed a page cut by A1. |
| (build) Where `hasPopup` and `controls` are cleaned | In `collect.ts`, with core's `PopupKind` and `AriaRole`; the page returns raw values | Clean-up needs no DOM, and one copy of each rule cannot drift from core (simplify pass). |
| (build) How `routes` finds a step's result | It walks `perceive`'s observation in reading order; a tie between duplicates goes to the one the persona reads first | The CI review's cut: an earlier `perceiveInOrder`, kept only to break ties in measurement order, added a second public export to `./perceive`. The printed table did not change. |
| (build) Shared test helpers | `packages/filter/src/test-support.ts`, outside `./perceive`'s import graph (precedent: `io/src/test-app.ts`) | One cap helper and one copy of the text helpers across the filter tests. |
| (review) K1 on a control that draws its own word | K1 and K4 rename only a control that draws no text; a control that draws its word is read by it | No source supports renaming a readable label (the NN/g sources measure hidden navigation and unlabelled icons); RULES' own "a wrong one invents"; and the pending text patterns (tabs, breadcrumb, accordion, back links) would inherit an erased word. It overrules the task's box on the phone toggle, so both reviewers approve the change explicitly. No shipped persona reaches the toggle; the `routes` output is unchanged. |
| (review) Kai's easy goal under A1 | Accepted: the formula and Kai's cap of 11 stay; RULES gives the `/account` button as the fill blind spot's example; filed as an issue | The task binds A1 to size, contrast and position and forbids tuning to the target app. Kai's easy goal keeps one route (`/deliveries`, its link 11th of 14). Revisit when `seed:demo` picks its personas. |
| (review) The device map | `DEVICE_DESCRIPTORS` in filter's `serve-target-app.ts`, imported by agent's `device.ts`; no copy, no drift test | Agent already imports `serve-target-app`, so the map can be shared instead of copied. `serveTargetApp` now imports Vite when it runs, so agent's and io's main entries, which reach `device.ts`, never load Vite (s2-02's rule that test tooling stays out of main entries). |
| (build) Not done in the simplify pass | core helpers for rule order and "left shown"; #89 proved from the salience order instead of swept | `observation.ts` and `primitives.ts` stay unchanged as decided above; the #89 box asks for the sweep as written. |

## Risks

- **Grzegorz's `s2-11`.** Kai's cap, Kai's and Vera's element order, and the observations themselves change. His Kai row "means something once `s1-03` and `s2-10` are merged". Tell him before merge and agree its timing as for #147.
- **Two two-approval PRs in series.** #147 and this one both edit RULES. This branch rebases if #147 changes in review.
- **Size.** About 15 files, one new browser test file and one extended; the `routes` walker (phone toggle, same-page steps) is the least certain part.
- **The cap margin.** "Fulfilment ledger" is at 0.816 against "Saved addresses" at 0.804 on `/settings/data`. A small change to that page can move route C across Kai's cap; `routes.browser.test.ts` fails loudly if it does.
- **Load flake.** `collect.browser.test.ts`'s fixture test has failed twice in full Windows runs under load; the new browser files may share it.

## Review note

Round 1 (spec-reviewer): ready after fixes, no blocking findings. It checked the numbers against the scratch runs (kebab 0.822, Order archive 0.487, Fulfilment ledger 11th of 18, Zoya's five). All seven findings taken:
1. The phone toggle is now a recorded home step in `routes`, so a cut or renamed toggle shows in the table.
2. The desktop boxes go into `target-app-routes.browser.test.ts`; one new browser file instead of two, against the load flake.
3. Kai's shown and cut lists on `/account` and `/settings/data` added under Results.
4. `package.json`, `scripts/routes.ts` explained; `s2-11` can reuse `TARGET_APP_ROUTES`.
5. The size-term reason corrected: `targetPx` is controls-only and takes in the label's box.
6. Order and cut say the order covers every element and the cut counts only shown ones, matching RULES:43.
7. The rejected no-contract detection option recorded under Measured fields.
