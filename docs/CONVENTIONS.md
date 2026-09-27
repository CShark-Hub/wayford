# Wayford — CONVENTIONS

Short on purpose. If a rule here is not enforced by a tool or a test, it is a suggestion and will decay.

## Package layout

```
packages/<name>/
  package.json
  tsconfig.json
  src/
    index.ts            public surface, re-exports only
    <feature>.ts        one feature per file
    <feature>.test.ts   test next to the code
    fixtures/           core only: one full example per schema
```

No `utils.ts`, no `helpers/`. If a function has no feature, it has no home yet.

`index.ts` is a barrel and nothing else: one `export * from "./<module>.js";` line per module, alphabetical. Add your line, never rewrite the file. Three people edit it in the same week and a one-line diff is the difference between a trivial merge and a three-way conflict.

## Naming

- Files: `kebab-case.ts`. Types and schemas: `PascalCase`. Functions and variables: `camelCase`.
- Schemas export both: `export const Profile = z.object(...)` and `export type Profile = z.infer<typeof Profile>`.
- Event types: `camelCase` verbs in past tense, `stepObserved`, `runFinished`.
- Database tables: `snake_case`, plural. Columns `snake_case`. Drizzle maps to `camelCase` in code.
- Ids: prefixed ULIDs, see `docs/STACK.md`.
- English everywhere in code, identifiers, comments, fixtures, persona names and UI copy. No locales, no i18n layer (see `AGENTS.md`). Polish is fine in `KONCEPCJA.md` and nowhere else.
- No domain jargon from any specific industry in code or fixtures. The tool is domain-agnostic.

## Errors

One error class per package boundary, `WayfordError` in `core` with a `code` string and a `cause`. Throw it at boundaries, let plain errors propagate inside. Never swallow an error into a log line without rethrowing or returning a typed failure.

## Determinism rules

- Anything that touches `Math.random()` outside the seeded RNG fails lint. Use `rng(seed)` from `core`.
- Perception decisions: resolved once per element per run, keyed by `hash(run seed, elementKey)`.
- Behaviour decisions: rolled per action from one stream of the run seed, logged with the rolled value.
- The Jev Actor's choice: drawn from Jev's probabilities by its own stream derived from the run seed, never the behaviour stream, logged with the rolled value.
- `Date.now()` never influences a decision, only timestamps.

## Tests

- Every acceptance criterion in a task file maps to at least one test or one documented manual check.
- Tests that need a browser use Playwright inside vitest and are tagged so `pnpm test:unit` skips them.
- No test calls a real LLM. The adapter has a fake that returns canned structured output.
- Fixtures in `core` are the shared vocabulary. New shape, new fixture, same PR.

## Git

- Branch per task, `feature/<task-id>-<slug>`: `feature/s2-01-llm-adapter`. Week 1 branches predate the prefix.
- Commit messages: imperative, one line under 72 characters, body if the why is not obvious.
- One PR per task. Title starts with the task id. Body links the task file.
- Reviewer: someone who did not work on the task. Two reviewers for the filter contract (`packages/core/src/observation.ts`, `measurement.ts`, and `docs/RULES.md`); one for everything else, the rest of `packages/core` included (decided in `m0-08` to keep a hackathon's review load small).
- Squash merge. `main` is always green.
- CI (`.github/workflows/ci.yml`) runs `pnpm lint`, `pnpm typecheck` and `pnpm test` on every PR and every push to `main`.

## Definition of Done

- [ ] Every acceptance box in the task file checked, with the command output or a screenshot in the PR.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.
- [ ] No new dependency without a line in `docs/STACK.md`.
- [ ] Out of scope items untouched.
- [ ] `tasks/BOARD.md` updated.

## PR template

```
## Task
tasks/<id>.md

## What changed

## Acceptance
- [ ] <copied from task file, with evidence>

## Out of scope respected
yes / explain
```

Saved as `.github/pull_request_template.md` in `m0-01`.
