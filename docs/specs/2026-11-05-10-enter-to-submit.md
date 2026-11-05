# #10 — Enter submits a typed field: spec

Task: issue [CShark-Hub/wayford#10](https://github.com/CShark-Hub/wayford/issues/10), "Personas cannot press Enter to submit a search field without a button", Layer 1 (the engine) only, so the PR is `Part of #10`. Size L: it changes a contract in `packages/core` and `docs/RULES.md`, and about twelve files across core, agent, io and web, most by a line or two; both layers together are larger than L · Branch: `fix/10-enter-to-submit` · Date: 2026-11-05
Status: draft

## Goal

Every persona can press Enter after typing into a field: a `type` action may carry `submit: true`, so a search field with no button no longer stops every run, Ada's and Scout's included.

## Constraints that bind

- "No new action type, so the union the behaviour rules (B1/B2/B4) pick from stays as it is" (issue). `Action` is closed on purpose (`packages/core/src/action.ts`), and `ACTION_TYPES` stays seven.
- "Prompt describes the field only. It must not hint 'press Enter when there's no button'" (issue). The template is the same for every persona and names no trait (`docs/PLAN.md` F5 AC6; `docs/RULES.md`, "The pipeline": "The Actor prompt is identical for every persona").
- "History line shows the submit, so B2's repeat check tells 'typed' from 'typed and submitted'" (issue). B2 compares history lines (`docs/RULES.md`, stage 7).
- "`docs/RULES.md` KLM timing: `keys` = 1 for a `type` with `submit`" (issue). B3 stays a pure function of the step's evidence, with no clock read and no draw (`docs/RULES.md`, "B3 and the seed").
- Stored runs still parse: a field added to a stored record is optional, as s2-09's spec put it, and the contracts in `packages/core` outrank new shapes.
- One adapter, with no `if (provider)` scattered across files (`AGENTS.md`, "AI through one OpenAI-compatible API"). `openai/gpt-6-luna`, the default model of every role, is sent strict `json_schema` (`packages/agent/models.yaml`, `jsonSchema` defaults to true), and strict modes take every property of an object as required.
- `act.ts` never looks an element up again by role or name: an action lands in the box the persona was shown (`packages/agent/src/act.ts`, its header).
- No test calls a real LLM (`docs/CONVENTIONS.md`, "Tests").
- Out of scope (issue): Jev, any other key or action, Quillmere, a write guard for live sites, Scout's ground truth. Layer 2, the persona rule, is left for a PR of its own.

## Design

### The contract (`packages/core/src/action.ts`)

```ts
z.object({
  type: z.literal("type"),
  ref: ElementRef,
  text: z.string(),
  /** Press Enter after the text, in the field the click focused. Absent: no Enter. */
  submit: z.literal(true).optional(),
}).strict(),
```

`true` or absent, never `false`: there is one way to say "no Enter", so two actions that do the same compare equal and a stored action reads one way. An action stored before this parses unchanged. `Action`'s doc comment gains a sentence on `submit`, and `ActorResponse`'s note on strict modes gains the optional property (below).

The one `type` fixture in `packages/core/src/fixtures/actions.json` becomes `{ "type": "type", "ref": "e5", "text": "archive", "submit": true }`. Each type keeps exactly one fixture, and it is a full one (`docs/PLAN.md`, "the seven contracts": one full fixture each).

### Acting (`packages/agent/src/act.ts`)

In `carryOut`'s `type` branch, after `page.keyboard.type(oneLine(action.text))`: `if (action.submit === true) await page.keyboard.press("Enter")`. The key goes to the field the click focused, so nothing is looked up again. The navigation watch is armed before any input, as now, so a form the Enter submits is waited for like a link's navigation (`Arrival`).

A line break in the text is still typed as a space: the only Enter is the one `submit` asks for. Enter does on the page what it always does. It submits a form that allows implicit submission (a lone text field, or a form with a submit button), and does nothing on a field outside a form with no key handler. The action promises the key press, not a submission.

### History (`packages/agent/src/history.ts`)

`move` for a `type`: `typed "<text>" into <element>`, then ` and pressed Enter` when `submit` is set. B2 compares lines, so a plain `type` and a submitting one on the same field are two moves, and the same submitting `type` twice on an unchanged page is a repeat. `oneLine`'s doc comment says that a line break is never an Enter, and only `submit` is.

### The clock (`packages/agent/src/simulated-time.ts`, `docs/RULES.md` B3)

`operatorsOf` for a `type`: `{ presses: 2, keys: action.submit === true ? 1 : 0, typed: … }`. The Enter is one K at the persona's motor pace, like a scroll's Page Down and a back's Alt+Left, and the typed characters stay at the norm's K. `docs/RULES.md`, "B3 in detail":

- the step table's `type` row: `M + P + 2B + K per character typed, + K when it submits`;
- the paragraph after it: a `type` that submits then presses Enter, one keystroke;
- "The pace": `motorTime` scales P, B and the one K of a scroll, a back or a submit, and `keys` is 1 for a scroll, a back or a `type` that submits, and 0 otherwise.

Worked numbers, from `simulated-time.test.ts`'s "Order 42" row: Ada 4485 becomes 4765 ms, and Vera, at `motorTime` 1.5, 6283 becomes 6703 ms.

### The prompt (`packages/agent/prompts/actor-system.md`)

One line after the `type` line:

```
  - {"type": "type", "ref": "e1", "text": "...", "submit": true} to do the same, then press Enter
```

It says what `submit` does and nothing about when to use it: no button, no form, no search. Scout plays the Actor on the same template (`llmActor`, role `scout`), so Scout can submit too.

### Strict mode (`packages/agent/src/llm.ts`)

`submit` is the first optional property in a schema sent to a model, and strict `json_schema` modes refuse an object that leaves a property out of `required`. A probe against the installed zod: `z.toJSONSchema(ActorResponse)` writes `submit` as `{ "type": "boolean", "const": true }`, outside `required`.

- `strictJsonSchema`'s override, which already renames `oneOf` to `anyOf`, also sends every property an object leaves out of `required` as required and nullable: `{ "anyOf": [<its schema>, { "type": "null" }] }`. A model in strict mode then answers `"submit": true` or `"submit": null`.
- `parseAnswer` parses the answer as written. When that fails, it parses it again with every null-valued object property dropped, at any depth, and returns that second result, its error included, to the repair round. A null is never valid for a property that is not nullable, so the second parse accepts only what a strict mode had to write for an absent optional property. A nullable property, which no schema has today, keeps its null on the first parse.
- The Extractor's and the Analyst's answers have no optional property, so the schemas they are sent do not change.

It is the adapter's, for every role, not an Actor-only path: the next optional property in any schema works the same way. The probe confirmed both halves: with the override, `submit` is in `required` as `anyOf` of the literal and null; `"submit": null` fails as written and parses without `submit` once nulls are dropped.

### Printing an action

| Where | Today | With `submit` |
|---|---|---|
| the run detail, `describeAction` (`packages/web/src/runs/replay.ts`) | `type e4 "parcel"` | `type e4 "parcel" + Enter` |
| the Analyst's digest, `actionText` (`packages/io/src/analyst-digest.ts`) | `type "parcel" into "Search"` | `type "parcel" into "Search" and press Enter` |
| `run:one`, `phrase` (`packages/agent/src/run-one.ts`) | `type "parcel" into e4` | `type "parcel" into e4 and press Enter` |

`run-one.ts` runs its command when imported, so a test cannot reach `phrase` there. It moves to `packages/agent/src/cli.ts`, the by-hand commands' shared module, which imports with no side effects, as the exported `actionPhrase`, and `run-one.ts` imports it.

The Race screen's pip (`packages/web/src/arena/race.ts`) and the avatar's typing state (`packages/web/src/arena/avatar-state.ts`) read the action's type and stay as they are: a submitting `type` is a `type`.

### Tests

- core `action.test.ts`: a `type` with `submit: true` parses, and one without it parses; `submit: false`, `submit: "yes"` and `submit` on a `click` are refused; one fixture per type still holds.
- agent `actor-loop.browser.test.ts`: the served `/form` already is a lone text field in a GET form to `/form-sent`, with no button; `/form-sent` is added. New: a `type` with `submit` lands on `/form-sent?q=parcel`, and its history line ends "and pressed Enter"; a run whose task succeeds on `**/form-sent*` ends `success` on that step. The existing walk, whose plain `type` of `"parcel\nnow"` stays on `/form`, is unchanged.
- agent `history.test.ts`: the submitting line; `repeats` is false for a plain `type` then a submitting one, and true for the same submitting `type` twice on an unchanged page.
- agent `simulated-time.test.ts`: a submitting row costs one K times `motorTime` more than the plain one, for Ada and Vera.
- agent `llm.test.ts`: the existing "strict json_schema, and nothing else" test adds the `submit` rewrite to its independently built schema, by path, so any other rewrite still shows. New: every object in the schema sent for `ActorResponse` lists every property in `required`; an answer with `"submit": null` resolves to an action without `submit`, with no repair call; an answer off the schema for another reason still gets its one repair round.
- agent `llm-actor.test.ts`: the banned-word test passes with the new line; new, the system template never says "button".
- agent `cli.test.ts`: `actionPhrase` with and without `submit`.
- web `replay.test.ts`: the fixtures' `type` line, and `describeAction` with and without `submit`.
- io `analyst-digest.test.ts`: a submitting `type` reads "and press Enter".

## Files

| File | Why |
|---|---|
| `packages/core/src/action.ts` | `submit` on `type`; the doc comments |
| `packages/core/src/fixtures/actions.json` | the `type` fixture carries `submit` |
| `packages/core/src/action.test.ts` | the contract's tests |
| `packages/agent/src/act.ts` | presses Enter; its doc comment |
| `packages/agent/src/history.ts` | the history line; `oneLine`'s doc comment |
| `packages/agent/src/simulated-time.ts` | the Enter's K |
| `packages/agent/prompts/actor-system.md` | the `submit` line |
| `packages/agent/src/llm.ts` | strict mode: optional sent as nullable, a null read as absent |
| `packages/agent/src/cli.ts`, `packages/agent/src/run-one.ts` | `phrase` moves to `cli.ts` as `actionPhrase`, with the submit |
| `packages/web/src/runs/replay.ts` | `describeAction` |
| `packages/io/src/analyst-digest.ts` | `actionText` |
| `docs/RULES.md` | B3's step table, the paragraph after it and "The pace" |
| `packages/agent/src/actor-loop.browser.test.ts`, `history.test.ts`, `simulated-time.test.ts`, `llm.test.ts`, `llm-actor.test.ts`, `cli.test.ts`; `packages/web/src/runs/replay.test.ts`; `packages/io/src/analyst-digest.test.ts` | the tests above |

The issue names `act.ts`, `action.ts`, the history, Jev, `docs/RULES.md`, the prompt and the tests. `llm.ts` is added because the default model is sent strict `json_schema`, which an optional property breaks. `cli.ts` and `run-one.ts`, `replay.ts` and `analyst-digest.ts` are added by the box that every printed action shows the submit. Jev's file does not change (Out of scope).

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| `Action`'s `type` takes an optional `submit: true`, no action type added | `action.test.ts`: the fixture test and the `submit` tests |
| `performAction` presses Enter after typing when `submit` is set, never otherwise | `actor-loop.browser.test.ts`: the new `/form-sent?q=parcel` test, and the existing walk that stays on `/form` |
| A goal behind such a field is reachable | `actor-loop.browser.test.ts`: the run on `**/form-sent*` ends `success` |
| The history tells a submitted `type` from a plain one, and so does B2 | `history.test.ts`: the line and the two `repeats` cases |
| The clock counts the Enter as one K at the motor pace, and RULES says so | `simulated-time.test.ts`: the submitting rows; the diff of `docs/RULES.md` |
| The prompt says what `submit` does and nothing about when | `llm-actor.test.ts`: the banned-word test and "never says button"; `actor-loop.browser.test.ts`: "every persona fixture sends the same first request" (F5 AC6) |
| A model in strict mode can answer with `submit` | `llm.test.ts`: every property required, and `"submit": null` read as absent |
| Every place that prints an action shows the submit | `replay.test.ts`, `analyst-digest.test.ts`, `cli.test.ts` |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` pass | the three commands |

## Decision log

| Question | Taken | Why |
|---|---|---|
| Which part of the issue | Layer 1 only, as `Part of #10` | Both layers are larger than L, and Layer 2's open questions (knowledge or behaviour, its provenance, which personas) are the team's. The boxes the user approved for the issue on 2026-11-05 cover Layer 1 and leave Layer 2 open. |
| `submit`'s schema | `z.literal(true).optional()` | The issue's shape. One way to say "no Enter", so equal actions compare equal, and stored actions parse. |
| Strict mode | The adapter sends each optional property as required and nullable, and reads a null back as absent | Keeps core's `ActorResponse` and every stored refused answer as they are, and serves any later optional property. Rejected: a model-facing action in core with a required `submit: boolean`, mapped to `Action` (a second action shape, and `submit: false` in every stored refused answer); `jsonSchema: false` for the Actor's model (gives up strict decoding for every role on it). |
| When nulls are dropped | Only after the answer fails as written | A nullable property, if a schema ever has one, keeps its null. |
| `submit: false` | Refused, so the repair round asks again | Strict mode cannot write it (`const: true`). A JSON-mode model that writes it gets the repair round, like any answer off the schema. |
| The Enter's time | One `keys` K at the motor pace | The issue's. One deliberate press, as a scroll's Page Down is; typing speed stays out of scope. |
| The fixture | The one `type` fixture carries `submit: true` | One full fixture per type (`docs/PLAN.md`), and the tests that want exactly one per type stay. |
| How Enter is pressed | `page.keyboard.press("Enter")`, into the focused field | `act.ts` never looks an element up again; the click before the typing focused it. |
| The history's words | `… and pressed Enter` | Past tense, like the rest of the line, and it says what the hand did, not what the page did. |
| The printed forms | `+ Enter` in the run detail, `and press Enter` in the digest and in `run:one` | Each follows its line's own grammar: terse tokens, or a verb phrase. |
| Where `phrase` lives | `cli.ts`, exported as `actionPhrase` | `run-one.ts` runs its command on import; `cli.ts` is the commands' shared module and imports with no side effects. |
| The test page | The served `/form` in `actor-loop.browser.test.ts`, plus `/form-sent` | It already is a lone field in a GET form with no button. Quillmere has no search, and a page there would move the route table (Out of scope). |
| The Race pip and the avatar | Unchanged | A submitting `type` is a `type`, and the pip's word is the action's type. |
| The prompt line | `{…, "submit": true} to do the same, then press Enter` | Says what the field does and nothing about when (issue). |

Settled by recommendation. Rows added during the build are marked "(build)".

## Risks

- The live model. No test calls a model, so none shows that GPT-6 Luna's strict mode takes `anyOf` with `{ "type": "null" }`, the documented way to leave a property optional there. `pnpm --filter @wayford/agent smoke:llm` sends `ActorResponse` to the Actor's model with the real key. The PR asks a reviewer who holds the key to run it.
- Browser tests on a loaded Windows machine time out (CShark-Hub/wayford#23). A failed file is rerun alone before it counts as a failure.
- The s1-07 watch on live runs now races the Enter on a submitting `type` (issue, Out of scope). Nothing in the engine changes for it.

## Review note

Empty until the spec review.
