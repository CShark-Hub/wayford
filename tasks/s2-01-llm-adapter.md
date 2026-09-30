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

- [x] `pnpm --filter @wayford/agent test` passes against a local stub server or an injected `fetch`, never the network. 3 files, 54 tests. Every `llm.test.ts` test injects its own `fetch`, and `beforeEach` stubs the global one to throw "a test reached the network". A review probe that removed the injection turned every calling test red. The fake has no `fetch` at all.
- [x] Tests cover the strict `json_schema` request body, the role's temperature in every request and `seed` only when passed, the JSON-mode fallback, one repair round after a zod failure followed by a typed failure, retry on 429 and 503 but not on 400, cost from `models.yaml`, and rejection of an unknown model id. Each is a named test in `packages/agent/src/llm.test.ts`:
  - **Body.** "sends the caller's messages, the role's model, temperature and effort, and a strict json_schema, and nothing else" compares the whole body, including the schema. The schema is rebuilt independently from `z.toJSONSchema(ActorResponse)`.
  - **Temperature and seed.** "every role sends its own model, temperature and effort" (distinct settings per role); "sends seed only when the caller passes one, and returns it as Sampling" (seed 0 included).
  - **JSON mode.** "sends JSON mode for a model priced with jsonSchema: false".
  - **Repair.** "repairs once with the zod error and bills both rounds"; "a second invalid answer is llm_invalid_output after exactly two requests"; plus the not-JSON, null-content and failed-repair-round cases.
  - **Retries.** "retries 429 and 503 with exponential backoff and logs every attempt" (every retry re-sends the same body); "gives up after three retries" (500 and 503); "does not retry 400".
  - **Cost.** "bills usage at the models.yaml price".
  - **Unknown model.** "rejects a model id missing from models.yaml at construction".
  - **Probes.** In review, a one-line break of each guarded rule turned its test red.
- [x] A test shows the config parser rejects a missing key and `http://example.com`, and accepts `http://localhost:11434/v1`. See `packages/agent/src/llm-settings.test.ts`, 22 tests, with io's loopback cases carried over. The same file checks two more things:
  - no env value reaches the error;
  - a key with a line break or a space is refused at boot, because `fetch` would quote such a header whole in its error.
- [x] With a real key in the root `.env`, `pnpm --filter @wayford/agent smoke:llm` prints a parsed object for a one-field schema and a cost line; whoever holds the OpenRouter key runs it and pastes the output in the PR. Run on 2026-09-30 with a real key on the $0 free tier. Extractor and Actor were both set to `nvidia/nemotron-3-super-120b-a12b:free` with effort `low`, because a paid model answers a $0 balance with a 402:
  - **Extractor.** The first attempt got an error inside a `200`, code 503, and was retried. The second printed `{"capital": "Paris"}` and `cost: 41 in, 65 out, 0.000000 USD (nvidia/nemotron-3-super-120b-a12b:free, effort low, 2214 ms)`.
  - **Actor.** Core's `ActorResponse` parsed on the first attempt, a `click` on `e2` with a narration, then `cost: 60 in, 127 out, 0.000000 USD (…, 2642 ms)`.
  - **Logs.** Each `ok` line names the host (`Nvidia`) and the snapshot that answered.
  - **Luna, run again on the defaults once the account had credit** (`openai/gpt-6-luna`, effort `high`):
    - **Extractor.** The first attempt got HTTP 525 after about 55 s and was retried as a 5xx. The second, served by OpenAI's host, printed `{"capital": "Paris"}` and `cost: 56 in, 28 out, 0.000020 USD (openai/gpt-6-luna, effort high, 62239 ms)`.
    - **Actor.** `ActorResponse` parsed on the first attempt, served by `"host":"OpenAI"`, so strict mode was enforced: a `click` on `e2` with a narration, `cost: 255 in, 57 out, 0.000054 USD (…, 2412 ms)`.
    - **What it proves.** Luna's strict mode takes the Actor schema's `const`, `pattern`, `exclusiveMinimum` and nested `anyOf`. Both costs match `models.yaml` to the cent fraction.
- [x] `grep -rln "process.env" packages/agent/src` lists only the smoke script. It prints `packages/agent/src/smoke-llm.ts` and nothing else.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. Lint checked 114 files with no fixes, typecheck is clean in all six packages, and the tests ran 33 files, 582 passed.

## Out of scope

- The Actor, Scout and Analyst prompts and loops. Week 3 and 4.
- Streaming responses, tool calls, images.
- Showing cost on the dashboard (F7). The adapter returns it; storing and showing it come later.
- Jev's `decide` and the actor backend setting. s2-05 adds them next to `complete`, on the same key and base URL.

## Notes for the reviewer

- Read the request body the adapter sends for the Actor role. It must contain the messages the caller passed and nothing the caller did not.
- Check the repair round cannot loop and that a retry never re-sends a partial response.

## Outcome

What shipped, for the next reader. The design and every decision are in `docs/specs/2026-09-30-s2-01-llm-adapter.md`.

- **The surface**, from `@wayford/agent`:
  - `createLlm(settings, { logger, fetch?, sleep?, timeoutMs? })` returns `{ complete }`.
  - `complete({ role, messages, schema, seed? })` gives `{ value, model, cost, sampling }`. `cost` is core's `Cost` and `sampling` is core's `Sampling`.
  - `parseLlmSettings(env)` parses the settings.
  - `fakeLlm(answers, temperatures?)` returns the same `Llm` plus `calls`. It ships from `@wayford/agent/fake`, not the main entry, as core's fixtures do, so s4-01 and s2-03 import it from there.
  - A failed call throws `LlmError`, a `WayfordError` that also carries the `cost` already spent, so a run's total keeps billed tokens. Its codes are `llm_request_failed`, `llm_bad_response` and `llm_invalid_output`. Construction throws `llm_unknown_model`, and the parser `invalid_llm_settings`.
- **Build one `Llm` per run.** The logger is fixed per instance, so a run passes its child logger with its `runId`. Building one is a small YAML read.
- **Defaults follow the team's model ladder** ("Wayford — Model ladder for AI testing", 2026-09-25), not this task's first draft:
  - every role on `openai/gpt-6-luna`, at temperature 1, because Luna takes none;
  - effort `high` for the Actor and the Extractor, `max` for Scout and the Analyst.
  - The escalation models are priced, so moving up is config only: `LLM_ANALYST_MODEL=anthropic/claude-opus-5.5`, and `openai/gpt-6-sol` for Scout and the Extractor. That starts in week 3. Until then, `.env.example`'s escalation lines point at Luna, so a stray run cannot bill them (PR review). While we build, the Analyst runs on the Actor's model, a deliberate departure from `AGENTS.md`'s "strong model there".
- **A setting the task did not list: reasoning effort.**
  - `LLM_<ROLE>_EFFORT` is sent as OpenRouter's `reasoning: { effort }`, the only form that takes `max`. The value `default` sends none, which is for Ollama or direct OpenAI.
  - `docs/PLAN.md` "AI access" now names it.
  - Core's `Sampling` has no field for it, so a run cannot record its effort yet. The adapter logs it on every attempt.
- **Errors inside a `200`.** OpenRouter answers `200 OK` once a host accepts the call, so a host that fails later reports inside the body.
  - **Shapes.** The body is a top-level `error`, or a choice with `finish_reason: "error"` (with or without its own `error`) next to partial output.
  - **How it is read.** The adapter reads the error as its code, with a non-integer code counting as 502: a 429 or 5xx is retried, anything else fails at once.
  - **Partial output.** It is dropped and never reaches a repair round.
  - **Where it came from.** The branch reviews found this.
- **Repair round.** It sends no empty assistant turn, which Anthropic's API refuses.
- **Which host answered.** Each `ok` log line names the host and snapshot (`host`, `served`), since calls are not pinned.
- **Timeout.** 300 s per attempt, and a timeout is not retried: OpenRouter stops billing an aborted request only when it streams, so a retry would pay twice with no usage recorded. Network errors, 429 and 5xx are retried up to 3 times, with backoff of 1, 2 and 4 s.
- **Not pinned to an OpenRouter host.** This was the user's call at spec approval. A Luna call can land on Bedrock, which drops `seed` and strict output, or on a regional host 10% above `models.yaml`. The fix, if it bites, is the ladder's rule 3: a `host` per model sent as `provider.order`, with fallbacks off. Risks, "Unpinned hosts".
- **io no longer reads the LLM settings.** The first io route that calls the adapter, s4-01's Extractor, runs `parseLlmSettings` at boot. Until then a keyless `pnpm dev` still starts.
- **The smoke script** makes two calls:
  - the box's one-field call on `extractor`;
  - a probe with core's `ActorResponse` on `actor`, which shows whether Luna's strict mode takes that schema's keywords.
  - Each prints the elapsed time, the first real figure for the timeout.
- **Free Qwen for $0 runs.** `qwen/qwen3.8-27b:free`, the ladder's tier 1, is priced at 0 in `models.yaml`. A role moved to it also sets its effort to `xhigh`, `medium` or `low`, and OpenRouter's free-model privacy switch must be on. It proves the plumbing without credit, but not Luna's strict mode.
  - **Nemotron.** The first $0 run got four 429s from free Qwen's shared host, so `nvidia/nemotron-3-super-120b-a12b:free` is priced too. It is off the ladder, on one Nvidia host, with efforts `medium` and `low` only.
  - **Better errors.** An error now also names the host's own reason, which OpenRouter keeps in `error.metadata.raw`.
- **`.env.example`** marks the key as required. It lists every role variable commented out, at the value the parser uses when the variable is unset, plus three escalation lines kept on Luna until week 3 (`2976a70`). A person committed it by hand (`bd2d99c`): a Read deny rule kept the building session out of the file.

## Follow-ups

- **Record the effort on the run**: an optional `effort` on core's `Sampling`, needing one reviewer. Worth an issue.
- **s2-05**: `typesafe/jev-1.13`, pinned by ADR 0001, is not in OpenRouter's public model list on 2026-09-30; only `typesafe/jev-router` is. Check the System One endpoint before starting.
