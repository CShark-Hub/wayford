# s1-04 — Target app: three routes to the hard goal, and Kai: plan

Spec: `docs/specs/2026-10-02-s1-04-target-app-routes.md`
Status: approved 2026-10-02

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | Routes B and C in the target app | `packages/target-app/account.html`, `settings.html`, `settings/data.html` (new), `src/pages.ts`, `src/style.css`, `src/main.ts`, `src/page-script.ts`, `src/page-script.test.ts`, `src/pages.test.ts`, `src/params.test.ts`, `README.md` | 1, 2, 7; README part of 8 | `pages.test.ts`: "PAGES lists /settings/data", "ROUTES names three routes, each a walk of real links", "the hard link is the only route to the archive without passing an entrance under 32 px", "every link and button has a name"; `params.test.ts`: "`.entrance` declares a box from 24 to 31 px" (removed later, spec decision 22) | `pnpm --filter @wayford/target-app test` and `pnpm --filter @wayford/target-app typecheck` pass; `git diff origin/main -- packages/target-app/deliveries.html packages/target-app/src/params.ts` is empty | 2 |
| 2 | Kai, Vera's cap of 20, and the RULES persona table | `packages/core/src/fixtures/profiles/kai.yaml` (new), `vera.yaml`, `packages/core/src/profile.test.ts`, `packages/web/src/avatar/parts.test.ts`, `packages/web/src/router.test.tsx`, `packages/filter/src/perceive.test.ts`; in `docs/RULES.md` only "Persona composition" | 6; RULES table part of 8 | `profile.test.ts`: "there are five of them …", "fixtures sort by name, from Ada … to Zoya …", "Kai sees what Ada sees"; `parts.test.ts`: Kai's pinned parts and "the five fixtures get five different hues" | `pnpm --filter @wayford/core test`, `pnpm --filter @wayford/web test`, and `pnpm --filter @wayford/filter test -- perceive.test.ts` pass | 1 |
| 3 | Filter browser tests on the routes | `packages/filter/src/serve-target-app.ts`, `collect.browser.test.ts`, `target-app-routes.browser.test.ts` (new) | 3, 4, 5 | the new file's tests: page list equals `pages.ts`; route B and route C click through; entrances 24 to 31; `/settings/data` AA; Kai has no perception decision; Vera has P4 on both entrances; hard-cut Vera loses all three routes | `pnpm --filter @wayford/filter test` passes | 4 (after 1 and 2) |
| 4 | Docs: calibration rows, route table, AGENTS, PLAN | `docs/RULES.md` ("Calibration" and the sweep paragraph only), `AGENTS.md`, `docs/PLAN.md` | 8 | none (docs). `profile.test.ts:203` and `:207` must stay green | `pnpm --filter @wayford/core test` passes; the diff names five personas, Kai's row, Vera's 20, the sort rule and the calibration rows | 3 (after 2) |
| 5 | Verify | none (task file boxes ticked in phase 7) | all | none | `pnpm lint`, `pnpm typecheck`, `pnpm test` pass at the root; every acceptance command in the task file passes | none |

## Notes per step

**Step 1.**
- The kebab, "Your data", the new page and `ROUTES` follow the spec section "Design" exactly: markup, the 28 px entrances, 30 px data links, seven entries with the ledger second, a dead "Sign out" menuitem, and the `MenuNav` → `MenuPanel` rename.
- Page text stays printable ASCII plus "·", and contains no substring "kai".
- README edits are the six listed under spec "Docs".

**Step 2.**
- Edits to `docs/RULES.md` are limited to "Persona composition":
  - "Five hackathon personas";
  - Kai's row, second;
  - Vera's `maxElements` 20;
  - the sort paragraph;
  - the middles sentence;
  - the sweep paragraph.
- Step 4 edits the rest of RULES afterwards, so the two never touch the file at once.
- The bundle table is tested both ways (`profile.test.ts:207`): Kai's row states `maxElements` 10, `memorySteps` 2 and budget 120, with citations in parentheses.

**Step 3.**
- Runs after steps 1 and 2 are committed: it needs `/settings/data` and `kai.yaml`.
- `TARGET_APP_PATHS` replaces the list in `collect.browser.test.ts`.
- Box 5 runs `perceive` for seeds 1 to 100 over every page, collected at `?contrast=2&fontPx=16&targetPx=36`.

**Step 4.**
- Runs after step 2 is committed, since both edit `docs/RULES.md`. It can run while step 3 does.
- Calibration rows:
  - the three new ones;
  - "hard contrast cut" for Vera, hard at 3.0;
  - "Sweep on contrast" limited to a persona whose B and C entrances P4 closes.
- The route table goes under a `| Route |` header, with the cells from spec decision 9.
- `AGENTS.md`: lines 18 and 78.
- `docs/PLAN.md`: F9 AC5, both sentences.

**Order.** Steps 1 and 2 run at once, then steps 3 and 4 at once, then step 5. No step changes `pnpm-lock.yaml`.
