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
| m0-07 | API and web skeleton with SSE echo | M | m0-01, m0-05 | Dawid | done |
| m0-08 | Week 2 backlog and owners | M | m0-02..05 | Tomasz | done |

`m0-00` lands before wave 1: it holds every name two of the wave-1 tasks would otherwise both invent.

Wave 1, all four start at once (see `docs/KICKOFF.md`): `m0-03` Dev 1, `m0-02` Dev 2, `m0-06` Dev 3, `m0-04` Dev 4.
Wave 2, after wave 1 merges: `m0-05` Dev 2, `m0-07` Dev 3 (web) and Dev 4 (API), `m0-08` Dev 1 with Dev 4.

## Week 2 — M1 filter standalone, M2 preview on fixtures

Monday 2026-09-28 to Sunday 2026-10-04. Plan assumes `m0-01` … `m0-07` merged, and before Monday: the critical review issues #13 to #16, `rng` and `hash` from #26, and `pnpm lint` green on `main` (#55).

| Task | Title | Size | Depends on | Slot | Owner | Status |
|---|---|---|---|---|---|---|
| s1-01 | Perceive: the page measurement, thresholds, soft bands and the seed | L | #16, PR #71 | Dev 1 | Dawid | done |
| s2-01 | LLM adapter | M | m0-07 | Dev 4 | Dawid | done |
| s2-02 | Run context and evidence capture | L | — | Dev 2 | Dawid | done |
| s3-02 | Persona cards and procedural avatars | M | m0-07, PR #71 | Dev 3 | Tomasz | done |
| s1-02 | DOM metrics collector and the seed test on the target app | L | s1-01 | Dev 1 | Grzegorz | done |
| s3-01 | Preview screen on the measurement fixture | L | s1-01, s3-02 | Dev 3 | Tomasz | done |
| s4-01 | Extractor | M | s2-01 | Dev 4 | Dawid | done |
| s4-02 | Database: runs and tasks | S | m0-07, #13, #14, #15 | Dev 2 | Dawid | done |
| s2-05 | Jev decision call in the adapter | S | s2-01 | Dev 4 | Marcin | done |

`#n` in Depends on is a GitHub issue on `CShark-Hub/promptozaury` that has to be fixed first, and `PR #n` a pull request that has to be merged. Fixes live in those issues, not in task files.

**Slots are a suggested split, not ownership.** Streams are areas of the code, not people: nobody has to continue what they did in week 1. A slot is two tasks sized to about 4 h of human time, ordered so each person has something to start on Monday. Take any unowned task whose dependencies are merged, write your name in Owner, and go.

**Waves.** Nothing starts on a task whose dependencies are not merged.

1. Monday: `s1-01`, `s2-01`, `s2-02`, `s3-02`, and `s4-02` once #13 to #15 are merged.
2. After `s1-01`: `s1-02`, and `s3-01` once `s3-02` is in too. After `s2-01`: `s2-05`, then `s4-01`. `s2-05` goes first while the adapter code is fresh; it is the Jev half of the adapter (`docs/adr/0001-jev-actor-backend.md`).

Critical path: #16 → `s1-01` → `s1-02` and `s3-01`. Review those first. Dev 1 carries two L tasks in a row on that path, so `s1-02` goes to whoever frees up first once `s1-01` merges; Dev 2 is the natural pick, since `s2-02` already starts the target app from its tests.

**If the week runs short**, `s2-05` moves to week 3 first, into Dev 4's free Monday: only `s2-06` waits on it, and `s2-06` also waits on `s2-03`. Then `s4-01`: the Actor can run on the task fixtures until it lands, and nothing else waits on it.

**Reviews.** `s1-01` changes the filter contract: two reviewers within 48 h. Everything else: one reviewer who did not work on the task.

## Week 3 — M3 the product exists

Planned for Monday 2026-10-05 to Sunday 2026-10-11 and built early, from 2026-10-01 to 2026-10-04. Written in `m0-08` and cut to what the demo needs; check each task's Context against what week 2 actually merged before starting it.

Widened on 2026-10-01 with `s1-04` and `s1-03`, so personas differ in what they know and take in, not only in what they see (`docs/ROADMAP.md`, week 3). To fit, `s1-03` drops A3 and the ring drops its motion (`s3-03`, now M). After a review of the plan the same day, the Actor loop is split in two (`s2-03`, `s2-10`) so the runs API can start on the bare loop, and a calibration run on the real model (`s2-11`) is the week's go/no-go.

**Function first.** Week 3 screens use the shell's existing tokens and components and spend no time on the look: week 4 reworks the design of every demo screen (`docs/ROADMAP.md`, week 4). A screen is done when its acceptance boxes pass, not when it looks finished.

| Task | Title | Size | Depends on | Owner | Status |
|---|---|---|---|---|---|
| s2-03 | Actor loop: observe, act, record | M | s1-02, s2-01, s2-02 | Grzegorz | done |
| s1-04 | Target app: three routes to the hard goal, and Kai | M | — | Grzegorz | done |
| s3-03 | Ring: several personas on one task, live | M | s3-02 (s4-03 and s1-04 for the real-key box) | Marcin | done |
| s3-04 | Dashboard and run detail | L | s3-02 (s4-03 for the `pnpm dev` box) | Tomasz | done |
| s2-10 | Actor loop: memory, behaviour dice and budget | M | s2-03 | Marcin | done |
| s2-11 | Calibration run on the real model | S | s2-03, s1-04 | Grzegorz | done |
| s4-03 | Runs API: start, stream, store, list | L | s2-03, s4-01, s4-02 | Marcin | done |
| s2-04 | Scout: ground truth per task | S | s2-03 (s1-04 for the real-key box) | Tomasz | done |
| s1-03 | Filter: knowledge and attention stages | L | s1-01, s1-02, s1-04, #124 | Dawid | done |
| s3-05 | Live preview on the target app | S | s1-02, s2-02, s3-01 (s1-04 for the new pages) | Tomasz | done |
| s2-06 | Jev Actor backend | L | s2-03, s2-05, s2-10, s2-11 | Dawid | done |

**Week 3 is done.** `s3-03` merged in PR #151 and `s2-06` in PR #158, both on 2026-10-05. Jev passed its gate in PR #158, so the sweep and `seed:demo` run on Jev (`docs/adr/0001-jev-actor-backend.md`). The demo-script decision moved into week 4's table.

## Week 4 — M4 report and sweep, M5 demo

Monday 2026-10-05 to Friday 2026-10-16, two calendar weeks, since week 3 finished a week early. Anything not merged by Friday 2026-10-16 does not exist for the demo.

**Scope, agreed 2026-10-04.** What `docs/DEMO.md` shows, each piece in the simplest form that serves its beat, made to look finished. The requirement set and what was cut are in `docs/PLAN.md`, "Hackathon scope". A task that grows past its beat is cut back, not widened.

**Process from week 4.** One reviewer for every PR, `docs/RULES.md` and the filter contract included. An S task needs no spec (`docs/CONVENTIONS.md`). The `start-task` and `pr-review` skills catch up in #159; until then, skip the spec step by hand for an S task.

| Task | Title | Size | Depends on | Owner | Status |
|---|---|---|---|---|---|
| s3-07 | Design direction, tokens and the self-check | M | — | | todo |
| s1-06 | Route-open share per persona and seed set | S | — | Marcin | doing |
| s4-06 | axe-core sidecar | M | — | | todo |
| s1-05 | Filter: vocabulary (K2) | M | — | Grzegorz | done |
| s2-12 | io runs a run set on the chosen Actor backend | S | s2-06 | | todo |
| s3-10 | Jev decisions in run detail | S | s2-06 | | todo |
| s4-04 | Analyst and the report API | L | s1-06 (s4-06 for axe findings) | | todo |
| s4-05 | Sweep: the boundary value on one capability axis | L | s1-06 (s2-12 for the Jev box) | | todo |
| s3-11 | Design pass: the preview | M | s3-07 | | todo |
| s3-12 | Design pass: the arena and run detail | M | s3-07, s3-03 | | todo |
| s3-08 | Report screen | M | s4-04, s3-07 | | todo |
| s3-09 | Sweep screen | M | s4-05, s3-07 | | todo |
| s4-07 | `seed:demo`: the demo's data in one command | M | s4-04, s4-05, s2-12 | | todo |
| demo-1 | Agree the 90-second script, `docs/DEMO.md`, and rehearse beats 1 to 4 | — | by Friday 2026-10-09 | team | todo |
| demo-2 | Rehearse the full demo twice and record the backup video | — | s4-07, every must task | team | todo |

Optional, taken only once every task above is taken:

| Task | Title | Size | Depends on | Owner | Status |
|---|---|---|---|---|---|
| s3-06 | Illustration view: the page under the persona's vision emulation | M | s3-05, s2-02, s3-07 | | todo |
| s4-08 | Credibility run on a public site | S | — | | todo |
| s2-07 | B2: scroll when stuck | S | s2-10 | | todo |
| s2-08 | B4: misclick on small targets | M | s2-10 | | todo |
| s2-09 | Simulated time: click speed and the budget | L | s2-10, after s2-08 | | todo |

**What can start after what.** The dependency map in `docs/ROADMAP.md` shows the same as a graph.

1. Monday: `s3-07`, `s1-06`, `s4-06`, `s2-12`, `s3-10`. `s1-05` merged in PR #162.
2. After `s1-06`: `s4-04` and `s4-05`. After `s3-07`: `s3-11` and `s3-12`.
3. After `s4-04`: `s3-08`. After `s4-05`: `s3-09`. After `s4-04`, `s4-05` and `s2-12`: `s4-07`.
4. After `s4-07`: `demo-2`.

**Critical path:** `s1-06` → `s4-05` → `s3-09` and `s4-07` → `demo-2`. `s1-06` is small and blocks both L tasks: take it first on Monday and review it the same day. `s3-07` sets the look every screen task follows, so it goes second.

**Screens before data.** `s3-08` and `s3-09` build on the `Report` and `Sweep` fixtures their engines add. `seed:demo --fake` (`s4-07`) fills every screen with no key, and is the way to check the week's screens together.

**Cut order**, from `docs/ROADMAP.md`: the optional table first, from its bottom up. Then the sweep on `maxElements`, then axe. The report, the contrast sweep and `seed:demo` are not on the list.
