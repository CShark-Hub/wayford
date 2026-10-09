# s4-08 — Rehearsal on our site: every screen, from the Target screen

Stream: s4
Milestone: week 4, any target (finals). Rewritten on 2026-10-06 (`docs/adr/0003-any-target.md`). It was "Credibility run on a public site", one recorded run set for the Q&A.
Size: M
Depends on: s1-07, s4-09, s4-10, s3-15, s3-16, s3-17

## Context

Read first, in this order:

- `AGENTS.md`
- `docs/adr/0003-any-target.md` — what works on a foreign site, and what is out
- `docs/DEMO.md` — "Finals: any target", with our pick, its goals and the gaps `s1-07` found
- `docs/PLAN.md` F9 AC4 — a sweep varies the persona, never the site
- Issues #124 to #127, #146 and #149 — the collector's known gaps

## Goal

Our pick, the site `s1-07` chose and ran first through the API, runs through every story screen from the Target screen, rehearsed. Any gap the UI hits that `s1-07` did not is listed, blocking or not.

## Interface

- **In:** our pick and its two read-only goals, from `s1-07`.
- **Out:**
  - for each goal, from the Target screen: Scout, the Lens on three of its pages for all five personas, a race with Ada, Kai and Vera, and ten seeds per persona with a report;
  - one sweep on one goal, prepared with the sweep CLI and opened on the Boundary;
  - in `docs/DEMO.md` "Finals: any target": the results per persona, and any new gap;
  - each gap noted as blocking a screen or not, with its issue number. A new issue for a gap no issue covers.
- Files expected to change: `docs/DEMO.md`; code only for a fix under S size that unblocks a screen. Bigger fixes go to `s1-07`.

## Constraints

- A read-only goal: no form that saves, no login, no purchase, nothing that writes to the site.
- Every run on the LLM: the race, the run set, Scout and the sweep (`docs/adr/0003-any-target.md` D9).
- Started from the Target screen, as the finals will be. A step that needs the CLI, other than the sweep, is itself a gap.

## Acceptance

- [x] Both goals through every screen, with the stored runs, reports and the sweep listed in `docs/DEMO.md`. "Our pick: cshark.com", "Rehearsal through the UI, 2026-10-09 (`s4-08`)":
  - G1 and G2 from the Target screen: Scout, ten seeds for Ada, Kai and Vera with the report, run detail from a finding, the Lens for all five personas on three pages between them (see Outcome), and a race. Each set's and race's id is listed, with the report's headline.
  - The sweep `swp_01m4fpr4k7zm5qfvzan619stqj`, Kai's attention cap on G1, opened on the Boundary by its id: the boundary at 5.
  - The nav carried the goal between every screen. Only the sweep needed the CLI.
- [x] Every new gap listed in `docs/DEMO.md` with its issue, blocking or not. "Gaps the rehearsal hit": two new issues.
  - #227, not blocking: the Report names a goal from the Target screen by its task id.
  - #228, blocking the Boundary in demo beat 6, fixed in this PR: the presets opened the newest sweep of any task, so a cshark sweep could take beat 6's place.
  - Hit again: #224 and #225.
- [x] Wall time and cost from URL to report, ten seeds, in `docs/DEMO.md`. "Wall time and cost, from URL to report":
  - G1: 6 min 36 s, $0.0183.
  - G2: 13 min 44 s, $0.0314.
  - Each split into the check, Scout, the set and the Analyst.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. After #228's fix and the review fixes: lint clean on 451 files, typecheck clean.
  - `pnpm test` ran 182 files: 3003 tests passed and 3 skipped, none failed.
  - An earlier full run hit one load flake, filter's `collect-rules.browser.test.ts` on a 5 s timeout, which passed alone (63 of 63).
  - #228's tests are in web's `screens/boundary.test.tsx` (59 tests). Both new ones fail without the fix: with the line reverted to `sweeps.data[0]`, 2 failed and 57 passed.

## Out of scope

- Fixing a gap larger than S: it goes back to `s1-07`'s list, or is cut.
- A route table for the site.

## Outcome

Spec `docs/specs/2026-10-09-s4-08-rehearsal.md`, plan `docs/plans/2026-10-09-s4-08-rehearsal.md`. Where this differs from the task as written:

- **The two goals are `s1-07`'s G1 and G2.** G2 now counts the listing as well as the offer, since the listing's card states the rate. G3, "Apply for …", is not rehearsed: its sentence asks for a write.
- **The run set is Ada, Kai and Vera** on ten seeds each: 30 runs per goal, the finals' cast. Milo and Zoya are in the Lens only.
- **The Lens ran on three pages between the two goals, not three per goal:** the start page and `/about/` for G1, and `/careers/job-offers/` for G2. Both goals start on the same page, and each goal adds the page it ends on.
- **One fix under S, #228's, found blocking by the branch review**, in `packages/web/src/boundary/axis.ts` and `screens/boundary.tsx`. Why it blocks: `docs/DEMO.md`, "Gaps the rehearsal hit". #227's fix is about S too, but it unblocks no screen, so it is a follow-up.
- **No write guard; the watch from `s1-07` instead.** It followed every race's events through `GET /races`.
  - Node's `fetch` dropped the streams of queued runs that stayed silent for 5 min, so 13 of G2's set went unwatched after that point. The watch was fixed to follow such a run again.
  - All 97 runs were read for a `type` action afterwards: none.
- **The data stays in the worktree that ran it.** `docs/DEMO.md`, "Before the finals", says to prepare it again on the presenting machine, after `pnpm seed:demo`.
