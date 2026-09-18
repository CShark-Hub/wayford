# m0-08 — Week 2 backlog and stream owners

Stream: m0
Milestone: week 1
Size: M (human task, agent assists)
Depends on: m0-02, m0-03, m0-04, m0-05

## Context

Read first, in this order:

- `docs/ROADMAP.md` week 2 exit criteria
- `tasks/TEMPLATE.md` and `tasks/README.md`
- All merged schemas in `packages/core`

## Goal

Eight task files for week 2, one owner per stream, so nobody waits on Monday of week 2.

## Interface

- In: frozen schemas
- Out: `tasks/s1-*.md`, `tasks/s2-*.md`, `tasks/s3-*.md`, `tasks/s4-*.md`, updated `tasks/BOARD.md`
- Files expected to change: `tasks/**`

## Constraints

- Split by the four streams in `KONCEPCJA.md`. Stream 1 gets the strongest deliverer.
- Each task follows `TEMPLATE.md`, sized S to L, with acceptance commands.
- Total week 2 tasks: 8, roughly two per person.
- Suggested set: s1-01 DOM metrics collector, s1-02 contrast and threshold decisions with seed, s2-01 LLM adapter, s2-02 fake cursor and evidence capture, s3-01 preview screen on fixtures, s3-02 procedural avatar, s4-01 Extractor, s4-02 Drizzle schema for all tables.

## Acceptance

- [ ] Eight task files exist and each has a non-empty Out of scope section
- [ ] `tasks/BOARD.md` lists them with owners
- [ ] Every task's dependencies are merged or listed

## Out of scope

- Writing any code for week 2.

## Notes for the reviewer

- Read the acceptance sections only. If any cannot be run as a command or performed as a described click, send it back.
