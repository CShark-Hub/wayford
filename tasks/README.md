# tasks/ — agent-ready work items

Each file here is one unit of work sized for a single coding agent session (1 to 3 hours of agent work).
A human picks it, points their agent at it, reviews the result, opens a PR.

Since the finals, work starts from an issue, and a task file is written only for a feature of M or L size, linked from its issue (decided 2026-10-27, `docs/CONVENTIONS.md`, "Git"). The hackathon's task files and `BOARD.md` are its record.

## How to grab a task

1. Take an open issue that nobody is assigned to and that waits on nothing open, and assign yourself. That is the claim: no board row, and no pull request for it.
2. Write the task file from `TEMPLATE.md`, with the next free number in its stream (see "Naming"), and link it from the issue.
3. Create a branch `feature/<task-id>-<slug>`, for example `feature/s1-03-knowledge-attention`.
4. Start your agent with the task file as the first thing it reads. In Claude Code, `/start-task <id>` runs the whole flow for you: worktree, reviewed spec (M and L tasks), plan, build, branch review (`.claude/skills/start-task/SKILL.md`). Without an id it offers the tasks you can take. In auto mode it approves the spec, when there is one, and the plan itself and goes on to an open PR; in manual mode you approve them. Other agents, suggested opening line:

   ```
   Read AGENTS.md, docs/PLAN.md, docs/STACK.md, docs/CONVENTIONS.md and tasks/<id>.md. Do only what the task file says. Stop and report if the task file conflicts with the code you find.
   ```

5. Review the diff yourself. Run the acceptance commands from the task file. In Claude Code, `/pr-review` runs a review built for agent-written code: it runs the change, checks it against `AGENTS.md`'s core, and pushes back on anything bigger than the task needs (`.claude/skills/pr-review/SKILL.md`).
6. Open a PR titled with the task id. Link the issue and the task file. One reviewer for every PR (`docs/CONVENTIONS.md`, "Git"); until week 4 the filter contract (`observation.ts`, `measurement.ts`, `docs/RULES.md`) took two.
7. Tick every acceptance box **in the task file**, each with the evidence that satisfied it, and commit that with the work. The PR body is read once; the task file is what the next person reads.
8. Close the issue with the merge: `Fixes #n` in the PR body.

## Naming

`<stream>-<nn>-<slug>.md`

- `m0` shared contracts and skeleton, week 1
- `s1` perception filter
- `s2` agent loop
- `s3` frontend
- `s4` input, output, API, data

## Rules for writing a task

- Context section lists exactly which files to read. No more than five.
- Interface section names the types in and out by their schema name.
- Acceptance section is a list of commands or tests that must pass. If it cannot be a command, it is a click described precisely.
- Out of scope section is mandatory. It is what keeps the agent from wandering.
- If a task needs more than three hours of agent work, split it.
- Never put the solution path in the task when the task is about designing the solution. Put constraints instead.
