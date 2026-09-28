# Wayford — KICKOFF: how four people start

One page. Read it once, then work from your task file.

## Before you touch anything

```bash
git clone git@github.com:CShark-Hub/promptozaury.git && cd promptozaury
npm install -g pnpm          # pnpm 12, once per machine
pnpm install
pnpm test && pnpm lint && pnpm typecheck
```

All three must pass before you start. If they do not, say so in the channel; do not work around it.

Read, in this order: `AGENTS.md`, `docs/PLAN.md`, `docs/RULES.md`, `docs/STACK.md`, `docs/CONVENTIONS.md`. About twenty minutes. `docs/ROADMAP.md` is the calendar, `tasks/BOARD.md` is who does what.

## What is already there

`m0-01` (skeleton) and `m0-00` (shared primitives) are merged. `packages/core/src/primitives.ts` holds the vocabulary your schema will need: provenance ids, rule ids, metric names, perception states, geometry, device and vision-deficiency enums, interface patterns and prefixed id schemas. Import from it. If you catch yourself defining a name that another task will also need, stop and say so in the channel.

## Week 1 assignment

One task each, all four start at once. They touch different files, so nobody waits.

| You | Task | What it is | Why you |
|---|---|---|---|
| Dev 1 (strongest deliverer) | `m0-03` | `Observation` and `Action` schemas: the contract between the perception filter and the Actor | You will own the filter in week 2. The filter owner writes the filter contract. |
| Dev 2 | `m0-02` | `Profile` schema and the four persona fixtures | You will own the agent loop; profiles are its input. |
| Dev 3 | `m0-06` | The demo target app: plain HTML, CSS variables, one hard-to-find link | You will own the frontend. Zero dependencies, starts immediately. |
| Dev 4 | `m0-04` | `Task` and `Finding` schemas | You will own the Extractor and Analyst, which produce exactly these. |

Second wave, after the first merges: `m0-05` (Dev 2), `m0-07` (Dev 3 takes web, Dev 4 takes API), `m0-08` (Dev 1 with Dev 4).

## How to run a task

1. Claim it: put your name in `tasks/BOARD.md`, status `doing`, commit straight to `main`. Ten seconds, prevents two people on one task.
2. Branch: `git checkout -b feature/s2-01-llm-adapter` (`feature/`, the task id, a short slug).
3. Start your agent with this, and nothing else:

   ```
   Read AGENTS.md, docs/PLAN.md, docs/RULES.md, docs/STACK.md, docs/CONVENTIONS.md
   and tasks/m0-03-observation-action-schemas.md.

   Do only what that task file says. Its Out of scope section is binding.
   Stop and tell me if the task file conflicts with what you find in the code,
   or if you need a dependency that is not in docs/STACK.md.

   When you are done, run pnpm lint, pnpm typecheck and pnpm test, and show me
   the output for every box in the Acceptance section.
   ```

4. Review the diff yourself before the PR. You are responsible for it, not the agent.
5. PR against `main`, title starts with the task id, body from the template. One reviewer who did not work on the task. The filter contract (`observation.ts`, `measurement.ts`, `docs/RULES.md`) needs two.
6. After merge, set the task to `done` in `tasks/BOARD.md`.

## Rules that keep four agents from fighting

- **One task, one branch, one PR.** No task ever spans two PRs, no PR ever spans two tasks.
- **Never edit a file another open task owns.** Task files list expected paths. If you need a change outside them, say so in the channel first.
- **`packages/core/src/index.ts` is the only shared file this week.** Add your export line, nothing else. Conflicts there are one line and trivial.
- **New dependency requires a line in `docs/STACK.md` in the same PR.** No exceptions, agents love adding libraries.
- **Do not fix things you noticed on the way.** Open an issue or write it in the channel. Drive-by fixes are what make four parallel agents unreviewable.
- **Fixtures are the shared vocabulary.** New shape, new fixture, same PR.

## Definition of Done

In `docs/CONVENTIONS.md`. Short version: every acceptance box checked with evidence in the PR, `pnpm lint` `typecheck` `test` green, out-of-scope untouched, BOARD updated.

## Rhythm

Async. One 30 minute sync per week. Status lives in `tasks/BOARD.md`, not in chat. If you are blocked for more than a day, that goes in the channel, not in your head.

Budget is 4 h per person per week. That is roughly two task files. If a task is eating more than three hours of agent time, it was too big: stop, split it, say so.

## Week 2

Week 1 is done: `m0-00` to `m0-07` merged, `m0-08` planned week 2. The week 2 table in `tasks/BOARD.md` is the plan: eight tasks in two waves and four suggested slots.

- Streams are areas, not people. Take any unowned task whose dependencies are merged, whatever you did in week 1.
- Fixes from the week 1 review live in GitHub issues #13 to #51, not in task files. Fixed before Monday: the critical ones (#13 to #16), the `rng` and `hash` part of #26, and the lint failure on `main` (#55). A task that needs another issue fixed first lists it under "Depends on".
- Wave 1 on Monday: `s1-01`, `s2-01`, `s2-02`, `s3-02`, and `s4-02` once #13 to #15 are merged. Everything else follows once those merge.
- The same opening line for your agent as above, with the week 2 task file.
- `s1-01` changes the filter contract: two reviewers within 48 h. Everything else needs one. `s1-01` is on the critical path, so review it before your own next task.

No refinement session. The task files follow the week 1 template, and a task that turns out unclear mid-week stops and asks in its PR. Two things replace refinement instead.

**Before the sync, asynchronously.** Read the task file you expect to take and open an issue for any question, naming the task file. The files were written without a developer reading them; this is where a wrong assumption surfaces cheaply.

**One 15-minute session on #16, before it merges.** #16 defines how an element records its decisions, including one from a rule without a metric (V2 below the fold, later A1 and K1); `s1-01` fills that shape and adds `PageMeasurement`, and `s1-02` and `s3-01` read both. That is the filter contract, the one contract worth a live conversation. Whoever fixes #16 and whoever expects to take `s1-01`, `s1-02` or `s3-01` sketch it together once.

**Week 2 kickoff: the weekly 30-minute sync, before Monday.**

1. Claim slots in `tasks/BOARD.md`, names in the Owner column. (5 min)
2. Settle any objection to the decisions `m0-08` took, merged in PR #56. The soft-band rule, Zoya and the seed rule are among them; a change after Monday moves `s1-01` mid-flight. (10 min)
3. Walk through the #16 decision shape with the stream 1 and preview developers, or confirm the 15-minute session happened. (10 min)
4. Name the OpenRouter key holder, and confirm #13 to #16, the `rng` and `hash` part of #26, and #55 merge by Sunday. (5 min)

## Settled decisions

Decided in `m0-08` (PR #56, merged 2026-09-25) and written into `docs/RULES.md` and `docs/PLAN.md`. Changing one now takes a PR, with two approvals if it touches the filter contract and one otherwise (`docs/CONVENTIONS.md`, "Git"):

- Soft thresholds: in the band below a soft threshold, an element is degraded when its roll falls below its position in the band, and invisible otherwise. The band floor is `threshold × (1 − softness)`. A hard cut never degrades. (`docs/RULES.md`, "Thresholds, bands and the roll"; issue #23.)
- Zoya stays as she is and scores 0/10 on both goals at the target app's defaults. Vera is the persona for the contrast sweep. (Issue #23.)
- The run seed drives perception and dice; the profile seed draws the avatar (`docs/PLAN.md` A20; issue #22).
- The boundary sweep moves a profile threshold, never a target-app parameter (`docs/PLAN.md` F9; issue #18).
- Text blocks are measured, and P1 and P3 apply to them (`docs/RULES.md`; issue #49).

## Open decisions that need the team

- Who holds the OpenRouter key and the 50 USD cap. `s2-01` cannot tick its smoke-test box without it, so it is needed on Monday of week 2.
- Hackathon rules: are existing frameworks and pre-existing repos allowed. Someone must ask.
