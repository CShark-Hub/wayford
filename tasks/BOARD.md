# BOARD

Status: `todo` | `doing` | `review` | `done`. Put your name in Owner when you grab a task. Commit this file directly to `main`.

`done` means merged **and** every acceptance box ticked in the task file. Anyone picking up a task reads the row here and the boxes there; if the two disagree, the boxes are the truth.

## Week 1 — M0

| Task | Title | Size | Depends on | Owner | Status |
|---|---|---|---|---|---|
| m0-01 | Repository skeleton | M | — | Tomasz | done |
| m0-00 | Shared primitives | S | m0-01 | Tomasz | done |
| m0-02 | Profile schema and fixtures | M | m0-01 | Tomasz | done |
| m0-03 | Observation and Action schemas | L | m0-01 | Dawid | done |
| m0-04 | Task and Finding schemas | M | m0-01 | Marcin | done |
| m0-05 | RunEvent and RunResult schemas | M | m0-03 | Grzegorz | done |
| m0-06 | Demo target app | L | m0-01 | Dawid | done |
| m0-07 | API and web skeleton with SSE echo | M | m0-01, m0-05 | Dawid | review |
| m0-08 | Week 2 backlog and owners | M | m0-02..05 | Tomasz | review |

`m0-00` lands before wave 1: it holds every name two of the wave-1 tasks would otherwise both invent.

Wave 1, all four start at once (see `docs/KICKOFF.md`): `m0-03` Dev 1, `m0-02` Dev 2, `m0-06` Dev 3, `m0-04` Dev 4.
Wave 2, after wave 1 merges: `m0-05` Dev 2, `m0-07` Dev 3 (web) and Dev 4 (API), `m0-08` Dev 1 with Dev 4.

## Week 2 — M1 filter standalone, M2 preview on fixtures

Monday 2026-09-28 to Sunday 2026-10-04. Plan assumes `m0-01` … `m0-07` merged, and before Monday: the critical review issues #13 to #16, `rng` and `hash` from #26, and `pnpm lint` green on `main` (#55).

| Task | Title | Size | Depends on | Slot | Owner | Status |
|---|---|---|---|---|---|---|
| s1-01 | Perceive: the page measurement, thresholds, soft bands and the seed | L | #16, PR #71 | Dev 1 | Dawid | done |
| s2-01 | LLM adapter | M | m0-07 | Dev 4 | | todo |
| s2-02 | Run context and evidence capture | L | — | Dev 2 | | todo |
| s3-02 | Persona cards and procedural avatars | M | m0-07, PR #71 | Dev 3 | | todo |
| s1-02 | DOM metrics collector and the seed test on the target app | L | s1-01 | Dev 1 | Grzegorz | doing |
| s3-01 | Preview screen on the measurement fixture | L | s1-01, s3-02 | Dev 3 | | todo |
| s4-01 | Extractor | M | s2-01 | Dev 4 | | todo |
| s4-02 | Database: runs and tasks | S | m0-07, #13, #14, #15 | Dev 2 | | todo |
| s2-05 | Jev decision call in the adapter | S | s2-01 | Dev 4 | | todo |

`#n` in Depends on is a GitHub issue on `CShark-Hub/promptozaury` that has to be fixed first, and `PR #n` a pull request that has to be merged. Fixes live in those issues, not in task files.

**Slots are a suggested split, not ownership.** Streams are areas of the code, not people: nobody has to continue what they did in week 1. A slot is two tasks sized to about 4 h of human time, ordered so each person has something to start on Monday. Take any unowned task whose dependencies are merged, write your name in Owner, and go.

**Waves.** Nothing starts on a task whose dependencies are not merged.

1. Monday: `s1-01`, `s2-01`, `s2-02`, `s3-02`, and `s4-02` once #13 to #15 are merged.
2. After `s1-01`: `s1-02`, and `s3-01` once `s3-02` is in too. After `s2-01`: `s2-05`, then `s4-01`. `s2-05` goes first while the adapter code is fresh; it is the Jev half of the adapter (`docs/adr/0001-jev-actor-backend.md`).

Critical path: #16 → `s1-01` → `s1-02` and `s3-01`. Review those first. Dev 1 carries two L tasks in a row on that path, so `s1-02` goes to whoever frees up first once `s1-01` merges; Dev 2 is the natural pick, since `s2-02` already starts the target app from its tests.

**If the week runs short**, `s2-05` moves to week 3 first, into Dev 4's free Monday: only `s2-06` waits on it, and `s2-06` also waits on `s2-03`. Then `s4-01`: the Actor can run on the task fixtures until it lands, and nothing else waits on it.

**Reviews.** `s1-01` changes the filter contract: two reviewers within 48 h. Everything else: one reviewer who did not work on the task.

## Week 3 — M3 the product exists

Monday 2026-10-05 to Sunday 2026-10-11. Written in `m0-08` and cut to what the demo needs; check each task's Context against what week 2 actually merged before starting it.

| Task | Title | Size | Depends on | Slot | Owner | Status |
|---|---|---|---|---|---|---|
| s2-03 | Actor loop | L | s1-02, s2-01, s2-02, #19, #31 | Dev 2 | | todo |
| s3-05 | Live preview on the target app | S | s1-02, s2-02, s3-01 | Dev 3 | | todo |
| s2-04 | Scout: ground truth per task | S | s2-03 | Dev 1 | | todo |
| s4-03 | Runs API: start, stream, store, list | L | s2-03, s4-01, s4-02 | Dev 4 | | todo |
| s3-03 | Ring: several personas on one task, live | L | s3-02 (s4-03 for the real-key box) | Dev 3 | | todo |
| s3-04 | Dashboard and run detail | L | s3-02, #15 (s4-03 for the `pnpm dev` box) | Dev 1 | | todo |
| s2-06 | Jev Actor backend | L | s2-03, s2-05 | Dev 2 | | todo |

**Waves.**

1. Monday: `s2-03`, `s3-05`, `s3-04`, and anything left over from week 2. `s3-03` follows `s3-05` in the Dev 3 slot.
2. After `s2-03`: `s2-04`, `s4-03`, and `s2-06` in the Dev 2 slot.
3. After `s4-03`: the real-run acceptance boxes of `s3-03` and `s3-04`.

`s3-03` and `s3-04` build against the routes `s4-03` describes, with stubbed responses, and wait for its merge only for their real-run checks. That keeps three L tasks from running in series.

Critical path: `s2-03` → `s4-03` → the real runs in the ring. That chain is the week 3 meeting point, so review those first. Dev 4 starts the week free on purpose: that is the room for week 2 slips and for reviewing `s2-03`. `s2-06` is off the critical path: nothing waits on it, and its gate decides whether week 4 runs on Jev.

**Cut order, from `docs/ROADMAP.md`.** `s2-06` first: it slips to week 4 or drops, and the LLM backend stays. Then `s2-04`: a hand-written ground truth per task replaces Scout. Then the ring's animation.

## Week 4 — M4 report and sweep, M5 demo

Task files are written at the end of week 3. Stretch already written: `s1-03`, the knowledge and attention stages of the filter.
