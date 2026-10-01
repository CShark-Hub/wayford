# s2-05 — Jev decision call in the adapter

Stream: s2
Milestone: week 2
Size: S
Depends on: s2-01

## Context

Read first, in this order:

- `docs/adr/0001-jev-actor-backend.md` — why Jev, what it may and may not do
- `docs/PLAN.md` section "AI access" and `docs/STACK.md` section "Agent"
- `packages/agent/src/` after s2-01 — `complete`, the LLM settings parser, the fake, `models.yaml`
- OpenRouter's Jev guide, https://openrouter.ai/docs/guides/community/jev, and the System One API reference it links — the request and response shape
- `packages/core/src/observation.ts` — `renderObservationForModel`, and `packages/core/src/fixtures/observation.json`, which the smoke script sends

## Goal

One function next to `complete` that sends Jev one Choice question over a block of text through OpenRouter and returns a probability per option, the confidence and the cost, plus a fake with the same signature, so the Actor's Jev backend in week 3 only has to build the question and draw.

## Interface

- In: `LlmRole` from `@wayford/core`; a state string; one Choice question: instructions plus a map from option key to description
- Out, from `@wayford/agent`: `decide(...)` returning the probability per offered key, the confidence, Jev's own pick, the model id, input tokens and cost in USD; the fake extended with `decide`; the LLM settings parser extended with the actor backend setting and the Jev model id; a `smoke:jev` script
- Files expected to change: `packages/agent/src/**`, `packages/agent/package.json`, `packages/agent/models.yaml`, `.env.example`

## Constraints

- Same key and base URL as `complete`. Plain `fetch` to OpenRouter's System One endpoint under the base URL, no SDK, for the reason `complete` has one: we control exactly what the model receives. The module comment states the request and response shape you found, with the doc URL.
- Choice questions only.
- The response is parsed with zod. The probabilities cover exactly the offered keys and Jev's pick is one of them; anything else is a typed failure, never a retry. Retries follow `complete`: at most 3, on network errors, 429 and 5xx only, every attempt logged with role, model, attempt and outcome.
- `decide` reports probabilities and decides nothing: it never samples. The Actor draws from the probabilities with the run seed (s2-06).
- Config: an actor backend setting, `llm` by default or `jev`, and the Jev model id, parsed with the other LLM settings. The adapter receives its config and never reads `process.env`. The parser rejects `~typesafe/jev-latest` and `typesafe/jev-router`: both change the model under a tuned run (ADR 0001).
- Cost comes from `models.yaml`, as for every model: `typesafe/jev-1.13` with its input price and an output price of zero.
- The fake returns canned probabilities per call, records the calls it received, and reports zero cost.

## Acceptance

- [x] `pnpm --filter @wayford/agent test` passes against an injected `fetch`, never the network. 6 files, 103 tests. Every `decide` test goes through `llm.test.ts`'s `setup`, which injects its own `fetch`, and the file's `beforeEach` stubs the global one to throw "a test reached the network". The fake sends nothing.
- [x] Tests cover the request body for one Choice question (state, instructions, options, the pinned model id), a response parsed into a probability per key, a response naming a key that was not offered rejected as a typed failure, retry on 429 and 503 but not on 400, and cost from `models.yaml`. Each is a named test in the `describe("decide")` block of `packages/agent/src/llm.test.ts`:
  - **Body.** "sends the state, the one question and the pinned model to System One, and nothing else" compares the whole body and the URL `…/api/v1/systemone`. The Actor's chat model is moved to Sol in that test, so a body naming it would show.
  - **Parse.** "returns a probability per offered key, the confidence, Jev's pick, the model and the cost".
  - **Rejected answers.** "an answer that … is llm_invalid_output, billed and not retried", run on five answers: one names a key not offered, one misses an offered key, one picks a key not offered, one has no confidence, and one puts zero on every option. Each makes one call, with no backoff, and carries the cost billed. "accepts probabilities whose sum rounding left short of 1" covers a sum of 0.90.
  - **Retries.** "retries 429 and 503 with the same body, logging every attempt, but not 400". It checks the attempt lines (role, model, `round: "decide"`, attempt, outcome) and that the key, the state and the options stay out of the log. Also "an error inside a 2xx counts as its code: 502 without one is retried, a 400 is not", and "a 2xx that is not a System One answer is llm_bad_response, not retried".
  - **Cost.** The parse test prices 476 input tokens from `models.yaml`, with output at zero, and checks the result against OpenRouter's figure for the same usage in its docs. "rejects a Jev model missing from models.yaml at construction" checks the boot.
- [x] A test shows the parser defaults the actor backend to `llm`, accepts `jev` with `typesafe/jev-1.13`, and rejects `~typesafe/jev-latest` and `typesafe/jev-router`. See `describe("LLM_ACTOR_BACKEND and LLM_JEV_MODEL")` in `packages/agent/src/llm-settings.test.ts`. It rejects the bare `jev-latest` and `jev-router` too, which the System One API routes onto the same ids. Each rejection line names its variable and does not echo the value.
- [x] With a real key in the root `.env`, `pnpm --filter @wayford/agent smoke:jev` sends the fixture observation rendered by `renderObservationForModel` with the hard goal sentence from `tasks/m0-06-target-app.md`, one option per element ref plus `back`, and prints every option with its probability and a cost line. The output goes in the PR with one sentence on whether the top option is the one a human would pick: the go/no-go probe of ADR 0001. Run on 2026-10-01 with a real key:

  ```
  {"level":30,…,"role":"actor","model":"typesafe/jev-1.13","round":"decide","attempt":1,"outcome":"ok","status":200,"tokensIn":598,"tokensOut":73,"served":"typesafe/jev-1.13-20260917","host":"TypeSafe","reportedUsd":0.000025116,"msg":"llm attempt"}
  0.640  e6    Click the link "Ar▒▒ive"
  0.200  e5    Click the heading "Your deliveries"
  0.070  e2    Click the link "Account"
  0.070  e3    Click the link "Deliveries"
  0.010  e4    Click the link "Settings"
  0.010  back  Go back to the previous page
  0.000  e1    Click the link "Home"
  confidence: 0.57, Jev's own pick: e6
  cost: 598 in, 73 out, 0.00002512 USD (typesafe/jev-1.13, 758 ms)
  ```

  The top option is the one a human would pick. On the Deliveries page with the goal "see what you ordered three months ago", the partly legible archive link is the way, and Jev puts 0.64 on it under its masked name. The probe is a go. The `models.yaml` cost, 0.000025116 USD, equals OpenRouter's `reportedUsd` exactly, and the probabilities sum to 1.00.

  A second run after the review fixes sent the same input, and the answer moved a little. `e6` was still 0.64, but `e5` went to 0.21, `e3` to 0.05 and `e4` to 0.02, with confidence 0.58, in 558 ms. As ADR 0001 says, Jev is not documented as deterministic: only a stored run replays.
- [x] `grep -rln "process.env" packages/agent/src` lists only the smoke scripts. It prints `packages/agent/src/smoke-jev.ts` and `packages/agent/src/smoke-llm.ts`.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. Lint (`biome check .`) checked 148 files with no fixes, typecheck is clean in every package, and the tests ran 46 files, 754 passed (731 on `main`).

## Out of scope

- The Actor's Jev backend: building options from an observation, the draw, storing the decision on the step. That is s2-06.
- Score and Noul questions, and any use of Jev outside the Actor (ADR 0001).
- Any change to `packages/core`.

## Notes for the reviewer

- Read the request body `decide` sends: the state, the instructions, the options and the model id the caller passed, and nothing else.
- Check that every request carries the pinned model id from config.

## Outcome

What shipped, for the next reader. The design and every decision are in `docs/specs/2026-10-01-s2-05-jev-adapter.md`.

- **The surface.** `Llm` gains `decide({ role, state, question: { instructions, options } })`, which returns `{ probabilities, confidence, choice, model, cost }`. `cost` is core's `Cost`: output tokens are counted as Jev reports them and priced at zero. `choiceAnswer(options)` is the answer schema, shared by the adapter and the fake.
- **The wire.** `POST {baseUrl}/systemone`, OpenRouter's System One API, with `{ model, state, questions: { question: { type: "choice", instructions, criteria } } }`. The comment at the top of `llm.ts` states both shapes and cites the docs.
- **Settings.** Two top-level fields: `actorBackend` (`LLM_ACTOR_BACKEND`, `llm` or `jev`, default `llm`) and `jevModel` (`LLM_JEV_MODEL`, default `typesafe/jev-1.13`). They sit beside the roles rather than on the actor role, since Jev's model is not a role's chat model. `createLlm` prices `jevModel` at boot whatever the backend.
- **Beyond the task's checks:**
  - The probabilities must not all be zero, so there is something to draw from. Their sum is not held to 1: Jev rounds each value to two decimals, so a tail of small ones rounds to zero. The values come back raw.
  - The bare `jev-latest` and `jev-router` are rejected too.
  - `decide` defaults to a 30 s timeout per attempt; `complete` keeps 300 s. `deps.timeoutMs` overrides both.
  - The ok attempt line carries `reportedUsd`, OpenRouter's own `usage.cost`, next to our price.
- **Transport.** `complete` and `decide` share one attempt-and-retry loop, generic over the endpoint. `attempt` handles every status outside 2xx once, for both endpoints, so each classifier reads a 2xx only. The settings variables outside the roles sit in one `VARIABLES` table, used both to read a variable and to name it in an error. `complete`'s behaviour and tests are unchanged, except one settings literal that gained the two new fields.
- **The fake.** `decide` takes from the role's existing queue, where an entry is Jev's answer, and records `decideCalls`. `fakeLlm`'s signature is unchanged.
- **For s2-06:**
  - Draw `roll × sum` over the cumulative probabilities, in the order offered, not `roll` alone. The sum Jev sends can fall short of 1 by rounding, and the same line closes the float tail.
  - The probe offered the heading `e5` as a click and Jev put 0.20 on it. s2-06's option list is one `click` per ref, so a heading is offered there too.
