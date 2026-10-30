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
- English everywhere in code, identifiers, comments, fixtures, persona names and UI copy. No locales, no i18n layer (see `AGENTS.md`). Polish is fine in `tasks/KONCEPCJA.md` and nowhere else.
- No domain jargon from any specific industry in code or fixtures. The tool is domain-agnostic.

## Errors

One error class per package boundary, `WayfordError` in `core` (`packages/core/src/error.ts`) with a `code` string and, when another error lies underneath, a `cause`. A subclass is allowed only for data a caller must read off the failure, not for a new kind of error: agent's `LlmError` carries the `cost` a failed model call already billed. Throw it at boundaries, where a package rejects data it was handed: `runResultFromEvents` throws it with code `invalid_run_events` for events that are not one run. Let plain errors propagate inside, and let a throw only a bug can reach stay a built-in error, like `rng`'s `RangeError` for a seed outside `Seed`. Never swallow an error into a log line without rethrowing or returning a typed failure. Two deliberate exceptions, both in io's runner, where a run is a background job whose request was answered long ago: a run that cannot be stored is logged and its stream still ends (s4-03), and a ground-truth file that is no ground truth (`invalid_ground_truth`, such as one Scout is still writing) is one warning, and its set runs on the default step cap (#196).

## Determinism rules

- Anything that touches `Math.random()` outside the seeded RNG fails lint. Use `rng(seed)` from `core`.
- Perception decisions: resolved once per element per run, keyed by `hash(run seed, elementKey)`.
- Behaviour decisions: rolled per action from one stream of the run seed, logged with the rolled value.
- The Jev Actor's choice: drawn from Jev's probabilities by its own stream derived from the run seed, never the behaviour stream, logged with the rolled value.
- `Date.now()` never influences a decision, only timestamps.
- A prompt file reaches a model as the same bytes on every OS: `.gitattributes` checks text out with LF, and each prompt file is read with each CRLF as LF (agent's `readPrompt`, io's `analyst.ts` and `extractor.ts`).

## Tests

- Every acceptance criterion in an issue or a task file maps to at least one test or one documented manual check.
- Tests that need a browser use Playwright inside vitest and live in files ending `.browser.test.ts`, which `pnpm test:unit` skips; `pnpm test` runs them too.
- No test calls a real LLM. The adapter has a fake that returns canned structured output.
- Fixtures in `core` are the shared vocabulary. New shape, new fixture, same PR.

## Git

- Work starts from an issue on `CShark-Hub/wayford`, and the issue is the task: it holds the context, the acceptance boxes and what is out of scope, and its status lives there. Whoever takes it assigns themselves, and if it has no acceptance boxes or does not say what is out of scope, adds what is missing to it before the work starts (decided 2026-10-27). No new task files are written: the files in `tasks/` and `tasks/BOARD.md` are the hackathon's record.
- Branch per change, `<kind>/<slug>`: `fix/goal-check-at-intake`, `docs/after-the-finals`. A task's branch is `feature/<task-id>-<slug>`: `feature/s2-01-llm-adapter`. Week 1 branches predate the prefix.
- Commit messages: imperative, one line under 72 characters, body if the why is not obvious.
- One PR per change. Its title starts with `Fix #n:` or `Part of #n:`, or with the task id for a task. Body links the issue, and the task file if there is one.
- Reviewer: one, someone who did not work on the task, for every PR. Until week 4 the filter contract (`packages/core/src/observation.ts`, `measurement.ts`, and `docs/RULES.md`) took two; from week 4 it takes one like everything else (decided 2026-10-04, to keep the last weeks' review load small).
- Spec: an M or L task writes a spec in `docs/specs/` before it is planned. An S task needs none: its task file is the spec, and its decisions go in the PR body (decided 2026-10-04).
- Merge: squash by default, or a merge commit when the branch's commits are worth keeping, such as review rounds the PR body cites (decided 2026-10-30). `main` is always green.
- CI (`.github/workflows/ci.yml`) runs `pnpm lint`, `pnpm typecheck` and `pnpm test` on every PR and every push to `main`.

## Definition of Done

- [ ] Every acceptance box in the issue or the task file checked, with the command output or a screenshot in the PR.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.
- [ ] No new dependency without a line in `docs/STACK.md`.
- [ ] Out of scope items untouched.
- [ ] The issue closed by the merge, or left open with what remains.

## PR template

```
## Task
Fixes #<n> or Part of #<n>, and tasks/<id>.md for a task

## What changed

## Decisions
A change from an issue, or an S task: each question you settled, the option taken and why. M or L task: "in the spec".

## Acceptance
- [ ] <copied from the issue or the task file, with evidence>

## Out of scope respected
yes / explain
```

Saved as `.github/pull_request_template.md` in `m0-01`.
