# s1-07 — Our pick through the API, and the gaps it hits

Stream: s1
Milestone: week 4, any target (finals)
Size: M for the run set and the list. Each blocking gap is sized when found, and split out when it is more than one M.
Depends on: s2-13

## Context

Read first, in this order:

- `AGENTS.md`
- `docs/adr/0003-any-target.md` — D8: the gaps a run on our pick hits are the ones fixed, and no other
- `docs/RULES.md` — "What is measured", the rules a fix must keep
- `docs/DEMO.md` — "Finals: any target"
- Issues #124 to #127, #146 and #149 — the collector's known gaps
- `packages/io/src/routes/tasks.ts`, `routes/runs.ts`, `routes/reports.ts` — the three calls this task drives by hand

## Goal

Our pick for the finals is chosen and run through the engine the day `s2-13` merges, before any screen for it exists, so the collector gaps it hits are found and fixed early. `s4-08` then rehearses the same site through the UI.

## Interface

- **In:**
  - one site whose terms allow automated browsing;
  - no login, and no cookie banner in an iframe;
  - two read-only goals, each with a success condition the team can defend.
- **The run,** through io under `pnpm dev`, by `curl` or a short script:
  - `POST /tasks` for each goal;
  - `POST /runs` with Ada, Kai and Vera on three seeds, on the LLM;
  - `POST /reports/:taskId` with `backend: "llm"`.
- **Out:**
  - in `docs/DEMO.md` "Finals: any target": the site, the goals, the result per persona, and each gap the runs hit, with its issue (a new issue for a gap no issue covers), blocking a screen or not;
  - the fixes for the blocking gaps, with `docs/RULES.md` changed wherever a fix changes what is measured;
  - if a run hits a new tab, `s2-14` taken.
- Files expected to change: `docs/DEMO.md`, `packages/filter/src/` where each gap lives, `docs/RULES.md`

## Constraints

- A read-only goal: no form that saves, no login, no purchase, nothing that writes to the site.
- A change to `docs/RULES.md` or the filter contract is a PR with one approval (`docs/ROADMAP.md`).
- The target app's measurements and the calibration table stay as they are, or the PR says what moved and why.
- Zero LLM in the filter.

## Acceptance

- [x] The site, its goals, the nine runs per goal and their reports listed in `docs/DEMO.md`, each gap with its issue. "Our pick: cshark.com", "First pass, 2026-10-07":
  - the site, three goals (see Outcome), and per goal the nine runs with their ids and the report's headline;
  - two blocking gaps, #190 (new) and #124's control half, with the issues that were not hit.
- [x] `pnpm --filter @wayford/filter test` passes with a fixture page for each gap fixed. 12 files, 289 tests passed, after the branch review.
  - #124: in `collect-rules.browser.test.ts`, the cshark.com card link cut down, a 20 px title over a 14 px description, measured in two parts. In `perceive.test.ts`, the same link under Vera's 16 px cut reads `link "Job Offers"`.
  - #190 lives in agent's `settle`, so its fixture pages are agent's (see Outcome). `pnpm --filter @wayford/agent test`: 25 files, 445 tests passed, `calibration-run.browser.test.ts` rerun alone after a load flake.
    - `settle.browser.test.ts`: "lenient: a finite animation longer than the strict deadline is waited out (#190)" and "the strict bounds stay the target app's, and the lenient ones are longer (#190)".
    - `actor-loop.browser.test.ts`:
      - "a page that holds its main thread past the strict bound still reaches the outcome (#190)", the landing;
      - "a page that holds its main thread past the strict bound is still observed (#190)", the observation, added in the branch review;
      - "with params, the same page fails page_not_settled at the strict bound (#190)".
- [x] The run set re-run after the fixes hits none of the blocking gaps, recorded in `docs/DEMO.md`. "Second pass, 2026-10-07, after the fixes":
  - 0 of 27 runs ended `error`, against 21;
  - on all three G2 seeds, Vera's evidence shows "Job Offers" shown as `shownName` "Job Offers", its 14 px part cut by P3, where the first pass cut the whole link.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. After PR #193's review round and a merge of `main`, lint is clean on 427 files and typecheck is clean. `pnpm test` ran 169 files: 2689 tests passed and 3 skipped. Two files failed under the full suite's load and passed when rerun alone: web's `self-check.browser.test.ts`, where the Cast page took over 30 s to load (53 of 53 alone), and io's `runs.browser.test.ts`, which hit a Windows `lstat 'C:\'` error (1 of 1 alone).

## Out of scope

- Gaps the runs did not hit.
- iframes and shadow DOM (`docs/adr/0003-any-target.md`), unless the site cannot be swapped.
- The UI rehearsal: `s4-08`.

## Outcome

Spec `docs/specs/2026-10-07-s1-07-our-pick-gaps.md`, plan `docs/plans/2026-10-07-s1-07-our-pick-gaps.md` with its amendment after the triage. Where this differs from the task as written:

- **Three goals, not two.** The team picked cshark.com and three goals: the board's names, the salary of the Senior Performance Test Engineer role, and applying for it. That makes 27 runs per pass instead of 18.
- **"Apply" stops at the form.**
  - Submitting would write to the site, which the Constraints rule out.
  - It would send made-up candidate data to real recruiters, behind a reCAPTCHA, with a CV upload the Actor cannot do.
  - So G3 succeeds when the application form loads, and the run ends there.
- **No write guard; a watch instead.** The engine does not stop a run from submitting a form on a live site, and the team chose to run without a guard. A script followed every run's events and would have stopped io on the first `type` action. No run of the 54 typed anything.
- **#190's fix and fixture live in agent, not the filter.** That gap is `settle`'s, in `packages/agent/src/settle.ts` and `actor-loop.ts`, files outside "Files expected to change". Off the target app `settle` now waits up to 10 s and an attempt is bounded at 30 s. The target app keeps 3 s and 8 s.
- **#124's fix changes the filter contract.** It touches core's `measurement.ts`, `observation.ts` and `fixtures/index.ts`, beyond the expected files: `MeasuredElement.parts`, and `ObservedElement.parts` and `shownName`. It also changes `docs/RULES.md`, "What is measured". The target app has no control drawn in parts, so its measurements, route table and calibration did not move: `routes.browser.test.ts` and `target-app-routes.browser.test.ts` pass unedited, and `collect.browser.test.ts` passes with `parts` added to what it compares, so it now guards that too.
- **Left open, recorded in `docs/DEMO.md`:**
  - A1's size term still reads a card link's worst text, so Kai's cap leaves "Job Offers" out. It is the same kind of question as #149.
  - A degraded part beside a visible one is left out of the shown name, not read masked. That understates, where reading it whole would overstate; `docs/RULES.md` says so. Changed in the branch review: the build first let such a part reach the model whole.
- **Changed after PR #193's review and an adversarial check of it.**
  - A control keeps its parts only when their texts, joined by spaces, spell its name and each element's text is one stretch. Otherwise a shown name could read words out of order or split a word; such a control is measured whole, as before #124.
  - Text of only blank glyphs (a zero-width space, a soft hyphen, a Hangul filler, a blank braille pattern) and a video's or canvas's fallback content draw nothing.
  - Stage 4 is back in pass 1.
  - The target-app comparison in `collect.browser.test.ts` now includes `parts`.
- **G2's success is too narrow.** The listing already states the rate, so Ada gave up twice after reading it there. `s4-08` should widen G2's success to the listing; `docs/DEMO.md` gives the glob.
- **Ten seeds for the finals** (ADR 0003 D10) are not run here; this task's run set is three.
