# <id> — <title>

Stream: <m0 | s1 | s2 | s3 | s4>
Size: <S = under 1 h agent work | M = 1 to 2 h | L = 2 to 3 h>
Depends on: <task ids, or none>

## Context

Read first, in this order:

- `AGENTS.md`
- `docs/PLAN.md` section <name>
- `docs/STACK.md` and `docs/CONVENTIONS.md` if the task adds code
- `<path>` — <why>

## Goal

One sentence. What exists when this is done that did not exist before.

## Interface

- In: `<SchemaName>` from `@wayford/core`
- Out: `<SchemaName>` from `@wayford/core`
- Files expected to change: `<paths>`

## Constraints

- <rule from AGENTS.md this task must respect, quoted>
- <technical constraint>

## Acceptance

- [ ] `pnpm --filter @wayford/<pkg> test` passes and includes `<test file>`
- [ ] `<command>` prints `<expected>`
- [ ] <precise click description if UI>

## Out of scope

- <thing the agent will be tempted to do and must not>

## Notes for the reviewer

- <what to look at first, what is risky>
