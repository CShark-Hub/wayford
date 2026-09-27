# s2-01 — LLM adapter

Stream: s2
Milestone: week 2
Size: M
Depends on: m0-07

## Context

Read first, in this order:

- `AGENTS.md` sections "AI through one OpenAI-compatible API" and "Separated LLM roles"
- `docs/PLAN.md` section "AI access", assumptions A13 and A20, F5 AC1
- `docs/STACK.md` section "Agent"
- `packages/io/src/config.ts` — where the LLM settings are read today
- Issues #20, #31 and #37 on `CShark-Hub/promptozaury`

## Goal

One function any package can call to get a zod-validated object from an OpenAI-compatible chat endpoint, using the role's model, with retries and the cost of every call, plus a fake with the same signature so no test ever calls a real model.

## Interface

- In: `LlmRole` from `@wayford/core`; a zod schema whose root is an object; an optional provider seed
- Out, from `@wayford/agent`: `complete({ role, messages, schema, seed })` returning the parsed object, the model id, token counts, cost in USD and the sampling settings sent, as `Sampling` from core; a fake adapter; a parser for the LLM settings
- Files expected to change: `packages/agent/src/**`, `packages/agent/package.json`, new `packages/agent/models.yaml`, `packages/io/src/config.ts` (LLM settings move out), `.env.example`, `pnpm-lock.yaml`, `docs/STACK.md` (a line per new dependency)

## Constraints

- Plain `fetch` to `/chat/completions`, no SDK (`docs/STACK.md`): we control exactly what the model receives.
- JSON Schema from `z.toJSONSchema()`, zod 4's built-in, sent as `response_format: json_schema` in strict mode where the endpoint accepts it, with JSON mode as the fallback. The response is always re-parsed with zod. A parse failure gets one repair round carrying the zod error, then a typed failure.
- Retries: exponential backoff, at most 3, on network errors, 429 and 5xx only. Every attempt is logged with role, model, attempt and outcome.
- Config per role: `extractor`, `scout`, `actor` and `analyst`, each a model id and a temperature, plus base URL and key. The adapter receives its config; it never reads `process.env` itself. Parsing fails at boot with a readable message when the key is missing or the base URL is not `https`. Plain `http` is allowed for `localhost` only, for Ollama.
- Cost comes from `models.yaml`: price per million input and output tokens per model id. An unknown model id is an error, not zero cost.
- Every request sends the role's temperature, so the run records the value sent, not a provider default. Direct OpenAI reasoning models can reject a temperature other than 1; a role on one is set to 1. `seed` is sent only when the caller passes one; the adapter never makes one up. Both come back as `Sampling` from core, so the run can store them (`docs/PLAN.md` A20, F5 AC1).
- The fake returns canned objects per role and schema, records the calls it received, seed included, reports zero cost, and returns `Sampling` as `complete` does. It is exported for other packages' tests; s4-01 uses it.

## Acceptance

- [ ] `pnpm --filter @wayford/agent test` passes against a local stub server or an injected `fetch`, never the network
- [ ] Tests cover the strict `json_schema` request body, the role's temperature in every request and `seed` only when passed, the JSON-mode fallback, one repair round after a zod failure followed by a typed failure, retry on 429 and 503 but not on 400, cost from `models.yaml`, and rejection of an unknown model id
- [ ] A test shows the config parser rejects a missing key and `http://example.com`, and accepts `http://localhost:11434/v1`
- [ ] With a real key in the root `.env`, `pnpm --filter @wayford/agent smoke:llm` prints a parsed object for a one-field schema and a cost line; whoever holds the OpenRouter key runs it and pastes the output in the PR
- [ ] `grep -rln "process.env" packages/agent/src` lists only the smoke script
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- The Actor, Scout and Analyst prompts and loops. Week 3 and 4.
- Streaming responses, tool calls, images.
- Showing cost on the dashboard (F7). The adapter returns it; storing and showing it come later.
- Jev's `decide` and the actor backend setting. s2-05 adds them next to `complete`, on the same key and base URL.

## Notes for the reviewer

- Read the request body the adapter sends for the Actor role. It must contain the messages the caller passed and nothing the caller did not.
- Check the repair round cannot loop and that a retry never re-sends a partial response.
