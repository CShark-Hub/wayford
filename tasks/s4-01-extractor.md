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

- [x] `pnpm --filter @wayford/io test` passes and includes `extractor.test.ts`, using the fake adapter from s2-01. 5 files, 32 tests, 11 of them in `packages/io/src/extractor.test.ts`. Every one of those builds the app with `fakeLlm` from `@wayford/agent/fake`.
- [x] With the fake returning a clean goal, the story "open Settings and click the Archive tab to see my old orders" gives `201`, a goal with no path word, `rewritten: true`, and `strippedPaths` containing "Settings" and "Archive". Test: "a story with a route through the interface gives 201, a clean goal and what was stripped". It also checks:
  - the body's `task` parses as `Task`, and its id as `TaskId`;
  - `success`, `startUrl` and `sourceStory` are the request's;
  - one `extractor` call was made, its system message the template file and its user message the story.
- [x] The story "you want to see what you ordered three months ago" gives `201` with `rewritten: false`. Test: "a story that already states an intent comes back unchanged".
- [x] With the fake returning a goal containing "menu" on the first attempt and again on the repair round, the response is `422` and names "menu". Test: "a goal that keeps a path word through the repair round is a 422 naming it".
  - It checks that `survived` contains "menu" and that exactly two calls were made. The second call carries the first answer and a repair message naming "menu".
  - "the repair round can fix a goal" and "a screen name the model says it stripped but kept is a 422" cover the rest of the round.
- [x] A body without `success` gives `400`. Test: "a body without success is a 400 and asks no model". An extra key is a `400` too, and the fake is never called.
- [x] A test shows a generated task id passes `TaskId`, a generated run id passes `RunId`, and a thousand generated ids are all different. `packages/core/src/id.test.ts` has three tests:
  - "an id for every entity passes its own id schema";
  - "a thousand ids are all different";
  - "the first ten characters encode the time the id was made".
- [x] A test reads the prompt template and finds none of "impaired", "disabled", "persona". Test: "the prompt template names no impairment and no persona", which reads `packages/io/src/extractor-prompt.md` and lowercases it before checking.
- [x] With `pnpm dev` and a real key, `curl -X POST localhost:3000/tasks -H 'content-type: application/json' -d '{"story":"open Settings and click the Archive tab to see my old orders","startUrl":"http://localhost:5174/","success":{"type":"urlMatches","pattern":"**/deliveries/archive"}}'` returns a `Task` (output in the PR). It was run on 2026-10-01, on the branch's final code, against `openai/gpt-6-luna` at effort `high`, the default. It took 2.4 s:

  ```
  {"task":{"id":"task_01m3tzevvphzw3wp6mbgwr9r3m","goal":"you want to see your old orders","startUrl":"http://localhost:5174/","success":{"type":"urlMatches","pattern":"**/deliveries/archive"},"sourceStory":"open Settings and click the Archive tab to see my old orders","strippedPaths":["Settings","Archive"]},"rewritten":true}
  HTTP 201
  ```

  The same body without `success`, on the same server, gives `HTTP 400` with `{"error":"✖ Invalid input: expected object, received undefined\n  → at success"}`.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. Lint checked 147 files with no fixes, typecheck passed in every package (filter's bare `tsconfig.perceive.json` included), and the tests ran 46 files, 716 tests.

## Out of scope

- Storing tasks. The table lands in s4-02; the endpoint writes to it in week 3.
- Proposing a success condition from the story.
- A task input screen in `web`.

## Notes for the reviewer

- Try three stories of your own against a real key. If a screen name survives into a goal, the prompt or the check is too weak; say which.

## Outcome

What shipped, for the next reader. The design and every decision are in `docs/specs/2026-10-01-s4-01-extractor.md`.

- **`POST /tasks`** (`packages/io/src/routes/tasks.ts`, `extractor.ts`) answers:
  - `201 { task, rewritten }`;
  - `422 { error, goal, survived }` after the repair round;
  - `400 { error }` for a body that fails the request schema, which is strict and caps `story` at 2000 characters;
  - `502 { error }` when the model call fails, picked by core's `WayfordError` code (`llm_…`), so io's library imports agent as types only.

  A body that is not JSON at all gets Hono's own plain-text `400`.
- **The model never sees `startUrl` or `success`.** It gets the prompt file and the story. Its answer schema is `{ goal, strippedPaths }`, with no other keywords, so every strict mode takes it. `Task.safeParse` decides.
- **Two repair rounds, not one.** The adapter repairs a malformed answer inside one `complete`. The Extractor's own round is a second `complete` that carries the `Task` error.
- **Core changes beyond the id module.**
  - `task.ts` exports `strippedPathsIn`, the matcher `Task`'s refinement already used, so the `422` names screen names the same way the schema refused them.
  - `docs/STACK.md` names `newId` in `packages/core/src/id.ts`.
- **The id generator.** `newId(entity)` gives `<prefix>_<lowercase ULID>`. The random part comes from `crypto.getRandomValues`, typed through a local cast because filter's perceive entry compiles core with no DOM and no Node types. There is no monotonic mode.
- **io now needs `LLM_API_KEY` to boot.** `server.ts` parses the LLM settings and builds one `Llm` at startup, with a pino logger. A `.env` without the key fails `pnpm dev` with `invalid_llm_settings`.
- **The prompt was tightened after the first real run.**
  - **The first run.** The model listed `"Archive tab"` in place of `"Archive"`, which weakens the whole-term check. It also wrote "the blender I bought" in a second-person goal.
  - **The fix.** The prompt now asks for each screen name on its own and turns "I", "me" and "my" into "you" and "your".
- **The author's probes** against a real key, with `openai/gpt-6-luna` at effort `high`, on the final prompt unless the row says otherwise. The reviewer note's three stories of the reviewer's own are still open for the PR reviewer.

  | Story | Goal | `strippedPaths` | `rewritten` |
  |---|---|---|---|
  | open Settings and click the Archive tab to see my old orders | you want to see your old orders | Settings, Archive | true |
  | go to Order history to find the blender I bought | you want to find the blender you bought | Order history | true |
  | I want to see what I ordered three months ago | unchanged | none | false |
  | you want to see what you ordered three months ago (first prompt) | unchanged | none | false |

  No screen name survived into a goal. What the check cannot catch is a screen name the model leaves in the goal and also leaves off its list: `Task` knows only the seven path words and what the model says it stripped.
- **A listed screen name loses a trailing UI noun** (tab, menu, page, button, link, section, screen) before it is stored and checked, so "Archive tab" becomes "Archive". A goal that keeps a bare "Archive" is then refused, not stored. The branch review found the gap, and a prompt sentence alone left it to the model.
