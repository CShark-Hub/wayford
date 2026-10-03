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

Monday 2026-10-05 to Sunday 2026-10-11. Written in `m0-08` and cut to what the demo needs; check each task's Context against what week 2 actually merged before starting it.

Widened on 2026-10-01 with `s1-04` and `s1-03`, so personas differ in what they know and take in, not only in what they see (`docs/ROADMAP.md`, week 3). To fit, `s1-03` drops A3 and the ring drops its motion (`s3-03`, now M). After a review of the plan the same day, the Actor loop is split in two (`s2-03`, `s2-10`) so the runs API can start on the bare loop, and a calibration run on the real model (`s2-11`) is the week's go/no-go.

**Function first.** Week 3 screens use the shell's existing tokens and components and spend no time on the look: week 4 reworks the design of every demo screen (`docs/ROADMAP.md`, week 4). A screen is done when its acceptance boxes pass, not when it looks finished.

| Task | Title | Size | Depends on | Owner | Status |
|---|---|---|---|---|---|
| s2-03 | Actor loop: observe, act, record | M | s1-02, s2-01, s2-02 | Grzegorz | done |
| s1-04 | Target app: three routes to the hard goal, and Kai | M | — | Grzegorz | done |
| s3-03 | Ring: several personas on one task, live | M | s3-02 (s4-03 and s1-04 for the real-key box) | | todo |
| s3-04 | Dashboard and run detail | L | s3-02 (s4-03 for the `pnpm dev` box) | Tomasz | done |
| s2-10 | Actor loop: memory, behaviour dice and budget | M | s2-03 | | todo |
| s2-11 | Calibration run on the real model | S | s2-03, s1-04 | Grzegorz | doing |
| s4-03 | Runs API: start, stream, store, list | L | s2-03, s4-01, s4-02 | Marcin | done |
| s2-04 | Scout: ground truth per task | S | s2-03 (s1-04 for the real-key box) | | todo |
| s1-03 | Filter: knowledge and attention stages | L | s1-01, s1-02, s1-04, #124 | | todo |
| s3-05 | Live preview on the target app | S | s1-02, s2-02, s3-01 (s1-04 for the new pages) | | todo |
| s2-06 | Jev Actor backend | L | s2-03, s2-05, s2-11 | | todo |

**No task is assigned to a person.** Whoever has time takes the next unowned task whose dependencies are merged, writes their name in Owner, and goes. The dependency map in `docs/ROADMAP.md` shows the same as a graph, with week 4's preliminary work.

**What can start after what.**

- Ready now, every dependency merged: `s2-03`, `s1-04`, `s3-03`, `s3-04`. They may start before Monday, and `s2-03` should: it is the start of the critical path.
- After `s2-03`: `s2-10`, `s2-04`, `s4-03`, and `s2-11` once `s1-04` is in too.
- After `s1-04` and a fix for #124: `s1-03`.
- After `s3-01`: `s3-05`.
- After `s2-11`, with `s2-05` in: `s2-06`. It is the last week 3 task to take.
- After `s4-03`: the real-run boxes of `s3-03` and `s3-04`.

Of the ready tasks, take the critical path first. `s2-03` → `s4-03` → the real runs in the ring is the week 3 meeting point, so `s2-03` goes first and is reviewed first. Next come `s2-11`, the go/no-go: if Ada cannot reach both goals on the real model, nothing built on the loop means anything yet. Then `s1-04`, since `s1-03`, `s2-11`, `s1-05` and the week 4 sweep all wait on it.

`s3-03` and `s3-04` build against the routes `s4-03` describes, with stubbed responses, and wait for its merge only for their real-run checks. That keeps three L tasks from running in series.

Scout stays in the week: without ground truth a report cannot tell a broken feature from one a persona could not find (`AGENTS.md`, "Scout is mandatory"). `s2-06` is off the critical path: nothing waits on it, and its gate decides whether week 4 runs on Jev.

**Reviews are the bottleneck.** In week 2, PRs that needed two approvals waited 10 to 29 hours. `s1-04` and `s1-03` need two each and run one after the other. Whoever takes one asks two reviewers when they take it, not when the PR opens.

**The week is full.** Eleven tasks and a fix for #124, against about eight a week (`docs/ROADMAP.md`). It fits only if `s2-03` starts this week.

**Cut order, from `docs/ROADMAP.md`.** `s2-06` slips to week 4 first, and the LLM backend stays. Then the ring itself, in favour of the dashboard. Scout is not on this list.

**A decision, not a task, before week 3 ends:** the 90-second demo script. A draft is in `docs/DEMO.md`: Ada, Kai and Vera on the hard goal, the preview on Vera's `/deliveries` and Kai's `/settings/data`. The team agrees on it or changes it by PR; `s3-03`, `s3-05`, the report and the sweep are built to it.

## Week 4 — M4 report and sweep, M5 demo

Task files are written at the end of week 3, and the week is arranged then. Preliminary content, from `docs/ROADMAP.md` week 4:

- Analyst and the report screen.
- The sweep on two axes, contrast on Vera and `maxElements` on Kai, and its screen.
- axe-core sidecar.
- `seed:demo`, the backup video and the public-site run.
- **Design pass**: a rework of the look of every demo screen. Week 3 builds them function first, so this is where the look is decided. Likely more than one task: a direction and tokens first, then the screens.
- The report shows, per persona, how often the filter left a route open beside how often the persona got through (`docs/PLAN.md` F8 AC6).
- The sweep chart shows, beside the success rate, how often the filter left a route open (`docs/PLAN.md` F9 AC2): on the attention cap the filter's own boundary is arithmetic, and the gap between the two curves is what the agent adds.

Written already:

| Task | Title | Size | Depends on | Owner | Status |
|---|---|---|---|---|---|
| s1-05 | Filter: vocabulary (K2) | M | s1-03, s1-04 | | todo |
| s3-06 | Illustration view: the page under the persona's vision emulation | M | s3-05, s2-02 (after the design direction) | | todo |
| s2-07 | B2: scroll when stuck | S | s2-10 | | todo |
| s2-08 | B4: misclick on small targets | M | s2-10 | | todo |
| s2-09 | Simulated time: click speed and the budget | L | s2-10, after s2-08 | | todo |

`s3-06` was planned for week 3 (PR #137) and moved here: week 3 is full, and the view is part of how the hero screen looks. `s2-07` to `s2-09` are stretch, behind the report and the sweep, and cut first. `s2-08` and `s2-09` change `docs/RULES.md`, so each takes two approvals.

That is more than eight tasks. The cut order in `docs/ROADMAP.md` decides what gives way. Stretch: A3, the option cap, cut from `s1-03`, and `s2-07` to `s2-09`.
