# Templates

Fill every section; write "none" where a section has nothing to say. Keep them as short as the task allows.

## Spec

`docs/specs/<YYYY-MM-DD>-<task-id>-<short-name>.md`

```markdown
# <task-id> — <title>: spec

Task: `tasks/<task file>.md`, or issue #<n> with its size and why · Branch: `<branch>` · Date: <YYYY-MM-DD>
Status: draft (becomes `approved <YYYY-MM-DD>` at gate 1, `approved <YYYY-MM-DD> (auto)` when the agent approved it)

## Goal

The task's goal, one sentence.

## Constraints that bind

The rules from `AGENTS.md`, the docs and the task file this design has to respect, quoted short.

## Design

Interfaces with their types and where each lives, and the data flow. Name the core schemas you reuse.

## Files

Each file created or changed, with one line on why. A file outside the task's "Files expected to change" says why it has to change.

## Acceptance mapping

| Acceptance box | Proven by (test name or command) |
|---|---|

## Decision log

| Question | Taken | Why |
|---|---|---|

Settled by recommendation. Rows added during the build are marked "(build)".

## Risks

What could make this take longer or turn into a blocker.

## Review note

What the spec review changed, and each finding rejected with its reason.
```

## Plan

`docs/plans/<YYYY-MM-DD>-<task-id>-<short-name>.md`

```markdown
# <task-id> — <title>: plan

Task: `tasks/<task file>.md`, or issue #<n> with its size and why · Spec: `docs/specs/<spec file>.md`, or "none" for an S task
Status: draft (becomes `approved <YYYY-MM-DD>` at gate 2, `approved <YYYY-MM-DD> (auto)` when the agent approved it)

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|

Notes per step, only where the table cannot hold it.

The last step is always verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` and every acceptance command in the task file.

## Decision log

| Question | Taken | Why |
|---|---|---|

An S task only. Rows added after gate 2 are marked "(build)"; phase 9 copies the log into the PR body. An M or L task writes "in the spec".
```
