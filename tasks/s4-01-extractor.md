# s4-01 — Extractor

Stream: s4
Milestone: week 2
Size: M
Depends on: s2-01

## Context

Read first, in this order:

- `AGENTS.md` section "A task must not contain the solution"
- `docs/PLAN.md` F3
- `packages/core/src/task.ts` — `Goal`, `pathWordsIn`, `strippedPaths`
- `packages/agent/src/` after s2-01 — `complete` and the fake adapter
- `packages/io/src/app.ts` and `packages/io/src/routes/` after m0-07

## Goal

`POST /tasks` turns a user story into a `Task` whose goal states an intent without a route through the interface, and shows what it stripped, or refuses and says why.

## Interface

- In: request body `{ story, startUrl, success }`, where `success` is a `SuccessCondition` the user supplies
- Out: `201` with `{ task: Task, rewritten: boolean }`, or `422` naming the path words or screen names that survived
- Files expected to change: `packages/io/src/**`, `packages/io/package.json`, `pnpm-lock.yaml`, a new id module in `packages/core/src/` and one line in its `index.ts`

## Constraints

- The model proposes, the schema decides. The Extractor asks the model, role `extractor`, for a goal and the screen names and path fragments it removed. `Task.parse` then runs the path-word and stripped-path checks from core. One repair round when it fails, then `422`.
- The goal is what the user wants, in the user's terms, in one sentence. The model is always asked, because only it can spot a screen name. `rewritten` is true when the stored goal differs from the trimmed story; a story that already states a clean intent comes back unchanged with `rewritten: false`.
- `sourceStory` holds the story verbatim and `strippedPaths` what was removed, both on the `Task`.
- The success condition comes from the request, never from the model: a run is never graded by asking a model (`SuccessCondition` in `packages/core/src/task.ts`).
- Validation at the edge with `@hono/zod-validator` and the core schemas. No second set of DTOs.
- The prompt is a template file a test can read. It names no persona and no impairment.
- The task id comes from one generator in core for every `ID_PREFIXES` entry: the prefix plus a lowercase ULID (`docs/STACK.md`), passing the core id schema, with no `Math.random`. Week 3 generates run and step ids with it.

## Acceptance

- [ ] `pnpm --filter @wayford/io test` passes and includes `extractor.test.ts`, using the fake adapter from s2-01
- [ ] With the fake returning a clean goal, the story "open Settings and click the Archive tab to see my old orders" gives `201`, a goal with no path word, `rewritten: true`, and `strippedPaths` containing "Settings" and "Archive"
- [ ] The story "you want to see what you ordered three months ago" gives `201` with `rewritten: false`
- [ ] With the fake returning a goal containing "menu" on the first attempt and again on the repair round, the response is `422` and names "menu"
- [ ] A body without `success` gives `400`
- [ ] A test shows a generated task id passes `TaskId`, a generated run id passes `RunId`, and a thousand generated ids are all different
- [ ] A test reads the prompt template and finds none of "impaired", "disabled", "persona"
- [ ] With `pnpm dev` and a real key, `curl -X POST localhost:3000/tasks -H 'content-type: application/json' -d '{"story":"open Settings and click the Archive tab to see my old orders","startUrl":"http://localhost:5174/","success":{"type":"urlMatches","pattern":"**/deliveries/archive"}}'` returns a `Task` (output in the PR)
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Storing tasks. The table lands in s4-02; the endpoint writes to it in week 3.
- Proposing a success condition from the story.
- A task input screen in `web`.

## Notes for the reviewer

- Try three stories of your own against a real key. If a screen name survives into a goal, the prompt or the check is too weak; say which.
