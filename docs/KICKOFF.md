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

## Week 1 assignment

One task each, all four start at once. They touch different files, so nobody waits.

| You | Task | What it is | Why you |
|---|---|---|---|
| Dev 1 (strongest deliverer) | `m0-03` | `Observation` and `Action` schemas: the contract between the perception filter and the Actor | You will own the filter in week 2. The filter owner writes the filter contract. |
| Dev 2 | `m0-02` | `Profile` schema and the three persona fixtures | You will own the agent loop; profiles are its input. |
| Dev 3 | `m0-06` | The demo target app: plain HTML, CSS variables, one hard-to-find link | You will own the frontend. Zero dependencies, starts immediately. |
| Dev 4 | `m0-04` | `Task` and `Finding` schemas | You will own the Extractor and Analyst, which produce exactly these. |

Second wave, after the first merges: `m0-05` (Dev 2), `m0-07` (Dev 3 takes web, Dev 4 takes API), `m0-08` (Dev 1 with Dev 4).

## How to run a task

1. Claim it: put your name in `tasks/BOARD.md`, status `doing`, commit straight to `main`. Ten seconds, prevents two people on one task.
2. Branch: `git checkout -b m0-03-observation` (branch name starts with the task id).
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
5. PR against `main`, title starts with the task id, body from the template. One reviewer from a different stream. `packages/core` needs two.
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

## Open decisions that need the team

- `docs/RULES.md` is a draft. If nobody objects by the end of week 1, it is frozen and `m0-02` and `m0-03` are built on it. Objections go in a PR comment on the file, not in chat.
- Who holds the OpenRouter key and the 50 USD cap. Needed in week 2, not before.
- Hackathon rules: are existing frameworks and pre-existing repos allowed. Someone must ask.
