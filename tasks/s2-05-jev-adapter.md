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

- [ ] `pnpm --filter @wayford/agent test` passes against an injected `fetch`, never the network
- [ ] Tests cover the request body for one Choice question (state, instructions, options, the pinned model id), a response parsed into a probability per key, a response naming a key that was not offered rejected as a typed failure, retry on 429 and 503 but not on 400, and cost from `models.yaml`
- [ ] A test shows the parser defaults the actor backend to `llm`, accepts `jev` with `typesafe/jev-1.13`, and rejects `~typesafe/jev-latest` and `typesafe/jev-router`
- [ ] With a real key in the root `.env`, `pnpm --filter @wayford/agent smoke:jev` sends the fixture observation rendered by `renderObservationForModel` with the hard goal sentence from `tasks/m0-06-target-app.md`, one option per element ref plus `back`, and prints every option with its probability and a cost line. The output goes in the PR with one sentence on whether the top option is the one a human would pick: the go/no-go probe of ADR 0001
- [ ] `grep -rln "process.env" packages/agent/src` lists only the smoke scripts
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- The Actor's Jev backend: building options from an observation, the draw, storing the decision on the step. That is s2-06.
- Score and Noul questions, and any use of Jev outside the Actor (ADR 0001).
- Any change to `packages/core`.

## Notes for the reviewer

- Read the request body `decide` sends: the state, the instructions, the options and the model id the caller passed, and nothing else.
- Check that every request carries the pinned model id from config.
