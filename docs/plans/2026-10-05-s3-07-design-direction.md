# s3-07 — Design direction, tokens and the self-check: plan

Spec: `docs/specs/2026-10-05-s3-07-design-direction.md`
Status: approved 2026-10-05

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | The self-check: `shortfalls`, `checkScreen`, the screen list, the CLI, the lint override | `packages/web/scripts/self-check.ts`, `check-self.ts`, `self-check.browser.test.ts`; `packages/web/package.json`, `tsconfig.json`; `pnpm-lock.yaml`; `biome.json`; `docs/STACK.md` | 2, 4 | `self-check.browser.test.ts`: the 3:1 text and 20 px button page fails on exactly those two; an unanswered `/api` path rejects with `self_check_unanswered`; text on a background image is `"unmeasured"`; every listed screen passes and measured something. The last stays red until step 3; the others go green here | The three tests that do not depend on the look pass. `pnpm --filter @wayford/web check:self` runs and prints the personas screen's current shortfalls (the 12 px badges). A lint probe: `import "@wayford/filter/routes"` in `scripts/` fails lint, `import { collect } from "@wayford/filter"` passes, and the same `@wayford/filter` import in `src/` still fails | 2 |
| 2 | The direction and the look: `DESIGN.md`, the dark tokens and `--text-xs`, the restyled shell and personas screen, the button's `xs` size checked | `docs/DESIGN.md`, `packages/web/src/index.css`, `shell.tsx`, `screens/personas.tsx`, `components/ui/button.tsx` (only if `xs` needs it) | 1, 2 | none new. Every existing web test is the guard: names, roles and markup shape stay | `pnpm --filter @wayford/web test` green. The personas screen renders at 1440 × 900 and 1280 × 720 with no horizontal scroll | 1 |
| 3 | Together: run the check on the new look and fix any shortfall in step 2's files, then take the "after" screenshots | step 2's files only | 1, 2 | step 1's "every listed screen passes" test | That test is green, and `check:self` exits 0. Four PNGs are in `runs/s3-07/` (the "before" ones already exist) | — |
| 4 | Verify and tick | `tasks/s3-07-design-direction.md` | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test` and `check:self` pass, with the real output read. Boxes are ticked with evidence, and an Outcome is written if anything differs | — |

Notes:

- **Steps 1 and 2** touch disjoint files, and only step 1 changes `pnpm-lock.yaml` (adding `tsx`).
- **Step 2 is one agent,** not two. The tokens, the shell and the personas screen are one look and are judged together.
- **Step 3 runs after both.** It is the only place the check meets the look.
- **Throwaways.** `packages/web/shots.tmp.ts` (the screenshot script) and `runs/` stay uncommitted. The script is deleted after step 3.
