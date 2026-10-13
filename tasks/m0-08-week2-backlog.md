# m0-08 — Week 2 backlog and stream owners

Stream: m0
Milestone: week 1
Size: M (human task, agent assists)
Depends on: m0-02, m0-03, m0-04, m0-05

## Context

Read first, in this order:

- `docs/ROADMAP.md` week 2 exit criteria
- `tasks/m0-06-target-app.md` section Follow-ups, and the items raised by `m0-06` under "Open decisions that need the team" in `docs/KICKOFF.md`: week 1 carry-overs that need a week 2 task or a team decision
- `tasks/TEMPLATE.md` and `tasks/README.md`
- All merged schemas in `packages/core`

## Goal

Eight task files for week 2, one owner per stream, so nobody waits on Monday of week 2.

## Interface

- In: frozen schemas
- Out: `tasks/s1-*.md`, `tasks/s2-*.md`, `tasks/s3-*.md`, `tasks/s4-*.md`, updated `tasks/BOARD.md`
- Files expected to change: `tasks/**`

## Constraints

- Split by the four streams in `tasks/KONCEPCJA.md`. Stream 1 gets the strongest deliverer.
- Each task follows `TEMPLATE.md`, sized S to L, with acceptance commands.
- Total week 2 tasks: 8, roughly two per person.
- Suggested set: s1-01 DOM metrics collector, s1-02 contrast and threshold decisions with seed, s2-01 LLM adapter, s2-02 fake cursor and evidence capture, s3-01 preview screen on fixtures, s3-02 procedural avatar, s4-01 Extractor, s4-02 Drizzle schema for all tables.

## Acceptance

- [x] Eight task files exist and each has a non-empty Out of scope section — `s1-01`, `s1-02`, `s2-01`, `s2-02`, `s3-01`, `s3-02`, `s4-01`, `s4-02`, each with three or four Out of scope items, at most five Context entries, and an Acceptance list of commands, tests or described clicks
- [x] `tasks/BOARD.md` lists them with owners — as four suggested slots, Dev 1 to Dev 4, two tasks each, with the Owner column left for whoever claims a task. Decided with Tomasz: streams are areas, not people.
- [x] Every task's dependencies are merged or listed — each is a week 1 task, another week 2 task on the board, or a GitHub issue named by number. `m0-07` (PR #53) is merged.

## Out of scope

- Writing any code for week 2.

## Notes for the reviewer

- Read the acceptance sections only. If any cannot be run as a command or performed as a described click, send it back.

## Outcome

What shipped, for the next reader.

- **The suggested set, with three changes.**
  - `s1-01` is the pure `perceive` function plus the `PageMeasurement` contract it reads, and `s1-02` is the Playwright collector with the end-to-end seed test. The pure half needs no browser, is the core of the defence, and is what the preview needs, so it goes first.
  - `s2-02` covers the whole browser side of a run (device, vision emulation, fake cursor, screenshot, video, trace), not only the cursor.
  - `s3-02` sets up the router and the dark shell, so it can start on Monday and the preview adds a route to it.
- **Fixes are not tasks.** The week 1 repository review filed its findings as issues #13 to #51. The critical ones (#13 to #16) are fixed before week 2 starts. A task that needs an issue fixed first names it under "Depends on"; nothing in a task file duplicates an issue.
- **New work no issue covers**, placed in the task that needs it first: the `PageMeasurement` schema and fixture (`s1-01`), the browser-safe `@wayford/filter/perceive` entry (`s1-01`), the `test:unit` split (`s1-02` or `s2-02`, whichever lands first), the id generator (`s4-01`), the router and browser-side fixtures (`s3-02`).
- **Slots, not owners.** Tomasz decided that nobody has to continue their week 1 area. `tasks/BOARD.md` offers four slots of about 4 h each; the Owner column stays empty until someone claims a task.
- **Scope widened on request.** Beyond `tasks/**` this task updated `AGENTS.md`, `docs/PLAN.md`, `docs/RULES.md`, `docs/ROADMAP.md`, `docs/STACK.md` and `docs/KICKOFF.md`, only where a week 2 task relies on the text: current state, week 2 plan, and the decisions below. Stale statements the review found elsewhere stay with their issues.
- **Decisions taken here**, open to objection on this PR:
  - Soft band: floor `threshold × (1 − softness)`; in the band, degraded when the roll is below the position in the band, invisible otherwise; a hard cut never degrades; several failing rules, worst state wins. (#23)
  - Zoya is kept and expected at 0/10 on both goals; Vera is the sweep persona. (#23)
  - The run seed drives perception and dice; the profile seed draws the avatar. (#22)
  - The sweep moves a profile threshold, never an app parameter; the boundary is the first value under a 50% success rate. (#18)
  - Text blocks are measured, and P1 and P3 apply to them. (#49)
  - The preview runs `perceive` in the browser through `@wayford/filter/perceive`. (F2 AC3)
  - Structured LLM output uses zod 4's `z.toJSONSchema()`, and ids are lowercase. (`docs/STACK.md`, needed by `s2-01` and `s4-01`)

### Fix before week 2 starts

Only as much of each issue as the demo needs. The other review issues are hardening a hackathon can live without; they stay open for after it.

| Issue | Scope for now | Blocks | Order |
|---|---|---|---|
| #16 | an element records several decisions, and a decision can come from a rule without a metric or threshold (V2 now; A1 and K1 in `s1-03`) | `s1-01`, and through it `s1-02` and `s3-01` | first: the run fixtures embed observations |
| #13 | the last step of a crashed or timed-out run may be incomplete | `s4-02` | after #16, with #14 and #15 in one PR |
| #14 | `startUrl` on the run; no profile snapshot, no browser version | `s4-02` | same PR |
| #15 | each dice roll (rule, probability, rolled value, fired) and the action the model proposed | `s4-02` | same PR |
| #26 | `rng(seed)` and `hash(seed, key)` in core only | `s1-01`, `s3-02` | independent; a new file |
| #55 | `pnpm lint` green on `main` | the lint box of every week 2 task | independent |

### MVP cut

Applied after the backlog was first written, to keep the project hackathon-sized:

- `s4-02` stores runs and tasks as JSON documents with a few filter columns, like `profiles`; no steps or findings tables.
- Week 3 has six tasks: the read API and the job runner are one task (`s4-03`), one event stream per run instead of multiplexing, Scout without a cache, the live preview on `/deliveries` only.
- Live video is cut (`docs/PLAN.md` A7, F6 AC4). The knowledge and attention stages (`s1-03`) move to week 4 as a stretch.
- Two reviewers only for the filter contract (`observation.ts`, `measurement.ts`, `docs/RULES.md`); one for everything else.

### Week 3

Six task files, written here so week 3 can start without another planning pass: `s2-03`, `s2-04`, `s3-03`, `s3-04`, `s3-05`, `s4-03`, plus `s1-03` as a week 4 stretch. Before week 3 starts `s2-03` needs #19 and #31 fixed; see `docs/ROADMAP.md`, week 3.
