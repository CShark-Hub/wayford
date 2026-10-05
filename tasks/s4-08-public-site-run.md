# s4-08 — Credibility run on a public site

Stream: s4
Milestone: week 4, optional: last in the cut order before the behaviour stretch
Size: S
Depends on: none

## Context

Read first, in this order:

- `docs/PLAN.md` A5 and F9 AC4 (a sweep varies the persona, never the site)
- `docs/DEMO.md` "Questions to expect", "Does it work on real sites?"
- Issues #124 to #127, #146 and #149 — the collector's known gaps
- `packages/agent/src/run-one.ts` and `packages/io/src/routes/runs.ts` — the two ways to start a run

## Goal

One recorded run set on a real public site, Ada and Vera on the LLM backend, three seeds each, with what the filter did on its pages, so the Q&A answer is a link and not a promise.

## Interface

- In: one public site whose terms allow automated browsing, a `Task` for it with a URL success condition
- Out: the stored runs, their videos, and a short note in `docs/DEMO.md` under that question: the site, the goal, the result per persona, the gaps it hit
- Files expected to change: whatever lets a run take a task that is not a fixture with the least change; `docs/DEMO.md`

## Constraints

- A read-only goal: no form, no login, no purchase, nothing that writes to the site.
- The LLM backend (ADR 0001: the public-site run uses the LLM).
- Report the gaps it hit. Fixing them is out of scope.

## Acceptance

- [ ] Six runs stored, each with its video and trace; the site, task and result per persona in `docs/DEMO.md`
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Fixing collector gaps, Scout on the site, or a sweep on it.
