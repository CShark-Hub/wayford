# BOARD

Status: `todo` | `doing` | `review` | `done`. Put your name in Owner when you grab a task. Commit this file directly to `main`.

`done` means merged **and** every acceptance box ticked in the task file. Anyone picking up a task reads the row here and the boxes there; if the two disagree, the boxes are the truth.

## Week 1 — M0

| Task | Title | Size | Depends on | Owner | Status |
|---|---|---|---|---|---|
| m0-01 | Repository skeleton | M | — | Tomasz | done |
| m0-00 | Shared primitives | S | m0-01 | Tomasz | done |
| m0-02 | Profile schema and fixtures | M | m0-01 | Tomasz | review |
| m0-03 | Observation and Action schemas | L | m0-01 | | todo |
| m0-04 | Task and Finding schemas | M | m0-01 | Marcin | review |
| m0-05 | RunEvent and RunResult schemas | M | m0-03 | | todo |
| m0-06 | Demo target app | L | m0-01 | | todo |
| m0-07 | API and web skeleton with SSE echo | M | m0-01, m0-05 | | todo |
| m0-08 | Week 2 backlog and owners | M | m0-02..05 | | todo |

`m0-00` lands before wave 1: it holds every name two of the wave-1 tasks would otherwise both invent.

Wave 1, all four start at once (see `docs/KICKOFF.md`): `m0-03` Dev 1, `m0-02` Dev 2, `m0-06` Dev 3, `m0-04` Dev 4.
Wave 2, after wave 1 merges: `m0-05` Dev 2, `m0-07` Dev 3 (web) and Dev 4 (API), `m0-08` Dev 1 with Dev 4.

## Week 2 — M1, M2

Filled by m0-08.
