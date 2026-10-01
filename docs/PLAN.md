# Wayford — PLAN: what we build and how we know it is done

Companion to `KONCEPCJA.md` (product idea, Polish) and `AGENTS.md` (decisions and rationale).
This file turns the idea into requirements with acceptance criteria, a UI outline, an architecture and a stack.
`docs/ROADMAP.md` puts it on a calendar. `tasks/` breaks it into agent-sized work.

## Assumptions (change here first if wrong)

| # | Assumption | Source |
|---|---|---|
| A1 | 4 people, 1 month, up to 4 h per person per week. About 64 human hours total. Work is asynchronous; humans direct and review, AI agents write most code. | Tomasz, 2026-09-17 |
| A2 | Jury / audience is mixed: technical depth and show both count. Hero screen is the live preview, credibility comes from the boundary sweep. | default |
| A3 | Code should be clean enough to continue after the hackathon, without over-engineering. | default |
| A4 | Planning docs and an empty repo skeleton may exist before the hackathon starts. Frameworks and libraries are allowed. | default, verify rules |
| A5 | Demo target is our own small target app with tunable CSS variables. One real public site is used for a single credibility run. | default |
| A6 | Preview runs the real filter code on the live target app, with a stored-snapshot fallback. | default |
| A7 | Ring shows 3 to 5 personas, each with the event stream and per-step screenshots. No live video: cut to keep the hackathon scope small. | m0-08 |
| A8 | Boundary sweep covers two axes: contrast on Vera and the attention cap `maxElements` on Kai. The axis selector offers those two. | default, 2026-10-01 |
| A9 | Report is structured findings rendered by the UI. The Analyst fills recommendation and hypothesis fields, never free prose. | default |
| A10 | Avatars are procedural SVG derived from the profile seed and dimensions. No generated images. | default |
| A11 | Five hand-written personas: Ada, Kai, Milo, Vera and Zoya (`docs/RULES.md`, "Persona composition"). Kai sees everything Ada sees and differs only in knowledge, attention and memory; Kai lands with `s1-04`. PersonaLayer is cited as provenance where thresholds match. | default, m0-02, 2026-10-01 |
| A12 | Perception dimension in full. Knowledge: pattern rules K1 and K4 in week 3 (`s1-03`), vocabulary K2 (`[unfamiliar term]`) in week 4 (`s1-05`), both in the observation only, never in the Actor prompt template (`docs/RULES.md` pipeline, F5 AC6). Attention: A1 in week 3 (`s1-03`); A3 is a week 4 stretch, A2 the "what next" slide. Memory: M1 (`s2-10`). Behaviour: one dice (double click) and the budget, in week 3 (`s2-10`); B2, B4 and a simulated clock for the budget are week 4 stretch tasks (`s2-07` to `s2-09`), cut before anything else. Readability (K3): the "what next" slide. | default, issue #19, 2026-10-01 |
| A13 | LLM access through OpenRouter with one key and a 50 USD cap. Adapter is OpenAI-compatible so any key works. Jev (A22) comes through the same key. | default |
| A14 | Whole team works in TypeScript. | default |
| A15 | SQLite through Drizzle at start. Postgres is one config change later. | default |
| A16 | Actor receives text observation only (filtered accessibility tree). Screenshot input is a flag, off by default. | default |
| A17 | Tasks live as files in `tasks/`. Status in `tasks/BOARD.md`. | default |
| A18 | Team members run different coding agents (Claude Code, Codex, Cursor). Task files follow the `AGENTS.md` convention that all of them read. | default |
| A19 | Project name is **Wayford**. Workspace scope `@wayford/*`. Rationale in `AGENTS.md`, section "On the name". | Tomasz, 2026-09-17 |
| A20 | The run seed drives every perception decision and every dice roll. The profile seed only draws the avatar. A run set uses the same seed list for every persona and runs each persona once per seed, so personas are compared on the same dice. The Actor's LLM calls send one provider seed per run, derived from the run seed; a provider may ignore it, so the run records it and nothing relies on it. A sweep runs one run set per swept value and reuses the seed set on purpose (F9 AC3), so every value is compared on the same dice (and is sent the same provider seeds). | m0-08, issues #20 and #22 |
| A21 | Streams are areas of the code, not people. No task is assigned to a person: whoever has time takes the next unowned task whose dependencies are merged. `tasks/BOARD.md` and the dependency map in `docs/ROADMAP.md` show what can start after what. | Tomasz, 2026-09-25, 2026-10-01 |
| A22 | The Actor has two backends behind one seam: an LLM, the default, and Jev, a decision model that returns a probability per option instead of text. A run set uses one backend. Decision, limits and gate: `docs/adr/0001-jev-actor-backend.md`. | Tomasz, 2026-09-26 |

## Goal

Given an application URL, a goal sentence and one or more capability profiles, report at what capability level the goal stops being reachable, with evidence that a developer can reproduce.

A capability is more than legibility. What a persona knows, how much of a page it takes in and how much it remembers can close a route too, and a route closed only by those is one no page scanner reports. The report keeps two things apart: how often the filter left a route open, which is deterministic, and how often the persona got through, which depends on the agent and is a hypothesis about wayfinding, not a prediction of people.

Pitch line: we do not answer "does it work", we answer "who does it work for".

## Users

- Product team, UX designer: primary. Wants to know which path breaks for whom and what to change.
- Accessibility specialist: validator. Wants thresholds with sources and evidence they can check.
- Product owner: reads the report, does not run it.

Not for: QA regression, end users, CI pipelines (in this scope).

## Non-goals

Stated explicitly in the pitch and the README:

- We do not predict how real people behave. This is a hypothesis generator and a boundary measurement.
- We do not replace user research.
- No pass/fail regression, no CI, no accounts, no export, no mobile, no API testing, no MCP.

## Functional requirements

Every acceptance criterion (AC) is checkable by a command, a test or a click. If an AC cannot be checked, rewrite it.

### F1 Profile builder

Compose a profile from blocks: perception, behaviour, knowledge.

- AC1 Three profiles can be built from blocks and saved.
- AC2 Saved profile validates against the `Profile` schema and round-trips through YAML unchanged.
- AC3 Every threshold carries `provenance` (`wcag22`, `fitts`, `pisarek`, `personalayer`, `folk`, `llm`).
- AC4 Every profile has a `seed`. It draws the avatar; runs take their own seed (A20).

### F2 Live preview

Page rendered as the persona perceives it. This is the hero screen.

- AC1 Slider change re-renders the preview in under 500 ms on the target app.
- AC2 Elements below the contrast, font size or target size threshold are removed or dimmed according to the filter decision.
- AC3 Preview uses the same filter package as the Actor. There is no second visual approximation. The browser runs `perceive` from `@wayford/filter/perceive` on a `PageMeasurement`, the same function the Actor's observation comes from.
- AC4 CDP vision-deficiency emulation applies to the screenshot layer and is labelled as illustration, not decision.
- AC5 Fallback: with the target app unavailable the preview renders from a stored `PageMeasurement`.

### F3 Task input

One sentence goal plus a deterministic success condition.

- AC1 Extractor rejects or rewrites tasks containing path words (screen names, "click", arrows) and shows the rewrite.
- AC2 Success condition is one of: URL pattern, DOM selector present, network request observed.
- AC3 Task validates against the `Task` schema.

### F4 Scout run

Unconstrained run that produces ground truth.

- AC1 Produces shortest observed path and target element location for a task.
- AC2 Stored per task and rerun by hand when the target app changes. No cache: we own the app and know when it changes.
- AC3 The Actor code path has no read access to Scout output. Verified by a test that fails if the import appears.

### F5 Actor runs

`persona × run seed` runs through our own loop, each persona once per seed of the run set.

- AC1 Same task, profile, run seed and Actor answers (the LLM's actions, or Jev's probabilities) give identical filtered observations and dice rolls on every step both runs reach; a re-run on a live model is not this check, since its answers can differ. The run records the temperature and provider seed the LLM was sent (A20). Test: two runs on the same fake answers, string equality of observations, equality of rolls.
- AC2 Behaviour dice rolls are logged per action with the seed-derived random value.
- AC3 Every step stores: screenshot, filtered observation, action, narration when the backend writes one (Jev writes none), URL, timestamp. A wasted step (s2-03) stores its rejected answers in place of an action, each with its own narration, and no screenshot or narration of its own: nothing ran, so the page is the one the step before left, or the start page at step 0.
- AC4 A step emits a `RunEvent` before and after the action, over SSE. The stream carries the full evidence observation (`FullObservation`, hidden elements included), and the step stores the Actor-facing text projected from it. Every action emits both events, `giveUp` included: a give-up is a step whose performed action is `giveUp`, and its `actionPerformed` carries the page the person gave up on. A step with `actionPlanned` and no `actionPerformed` means the run stopped mid-step, never that the performed action was `giveUp`. A wasted step emits `stepObserved` and then `stepWasted`, with every answer the loop refused, and no action event (#114).
- AC5 Reaching the success condition ends the run with `success`. The budget timeout (B3) and the step cap both end it with `budget_exceeded`: the loop cutting the run off, never the persona's own decision (that is `gave_up`). The cap is checked at the end of every step, a wasted one (s2-03) included; on a step whose action landed it comes after the success check, so success on the last allowed step still ends `success`, and, unlike the clock, the same run seed and Actor answers (AC1) reproduce a capped run. A wasted step counts so that a model that never names a ref it was shown still ends on the cap, which a seed reproduces, and not on the clock (#114).
- AC6 Actor prompt never mentions impairment or persona traits. A test greps the prompt template for banned words.
- AC7 A fake cursor is injected into the page and moved to click coordinates before each click, so it appears in video and screenshots.
- AC8 With the Jev backend (A22), every option comes from the Actor-facing observation, the action is drawn from Jev's probabilities by a stream of the run seed, and the step stores the options, the probabilities, the confidence and the rolled value.

### F6 Ring

Several personas on the same task, live.

- AC1 3 to 5 runs start in parallel, one browser context each.
- AC2 Avatar state follows run events: idle, moving, stuck, done, gave up, error. A crashed run (`runFailed`) shows error, never gave up.
- AC3 Finish order and elapsed time are visible.
- AC4 Every persona shows its latest step screenshot. No live video (A7); the `webm` in run detail is the recording.

### F7 Dashboard

All runs.

- AC1 Runs list filters by task, persona and outcome.
- AC2 Per task: success rate and median time per persona.
- AC3 Run detail opens a step-by-step replay with screenshots, observation and action per step.
- AC4 Run header shows `persona | seed | run id`. The run id is the run's only number: runs carry no index (issue #94).

### F8 Report

Analyst output per task.

- AC1 Every finding has a type: `measurement`, `deterministic`, `hypothesis`. The UI separates them visually.
- AC2 Every finding links to at least one evidence step. Findings without evidence are not rendered.
- AC3 Every finding has a recommendation.
- AC4 Analyst input covers all runs across all personas for the task.
- AC5 Every finding carries its basis: the rules behind it and each rule's threshold provenance. A deterministic finding names at least one. A finding whose basis includes `folk` or `llm` keeps its type but is marked soft, with its source shown, and is never presented as hard. Each basis entry's provenance is copied in code from the named profiles' thresholds, never taken from the Analyst's output.
- AC6 Per persona, beside the success rate over the seed set, the share of seeds whose filtered observations left a route to the goal open, as `routes` (`s1-03`) computes it. The first number depends on the agent, the second is the filter's alone ("Goal" above).

### F9 Boundary sweep

One axis, one path.

- AC1 Input: axis, range, step. Output: table of value and success rate, boundary value marked.
- AC2 Chart with a marker on the boundary value. Beside the success rate it shows, per value, the share of seeds whose filtered observations left a route to the goal open. That share is what the filter decided. The gap between it and the success rate is the agent's own wayfinding: a hypothesis about the route, not a measurement of the persona.
- AC3 Sweep runs reuse the same seed set for every value.
- AC4 The swept value is a profile threshold or cap, a capability, never a target-app parameter, and its softness stays fixed for the whole sweep. App parameters stay fixed for the whole sweep and are recorded on every run in its start URL. That is what makes a sweep work on a site we cannot tune.
- AC5 The boundary is the first value, counting from the laxest, whose success rate over the seed set falls below 50%. The chart states the rate. For a fixed seed the state a perception rule gives an element never improves as its threshold rises (`docs/RULES.md`). So for a goal reachable only through one link, such as the target app's hard goal, the seeds where the swept rule leaves that link visible or degraded never grow in number, and at each value successes never exceed them (`docs/RULES.md` calibration row "Sweep on contrast"). The success rate itself is not monotone: the Actor's own variance can raise it at a stricter value, and so can an attention cap (A1, A3), which may show an element that a stricter threshold freed a slot for. On `maxElements` (Kai) the same bound holds: A1 shows a prefix of one salience order, so for a fixed seed a smaller cap never shows an element a larger one hid.

### F10 axe-core sidecar

- AC1 axe violations stored per visited page.
- AC2 Report can cite an axe violation as a `measurement` finding.

### F11 Demo data

- AC1 One command seeds the database with 3 personas, 2 tasks, 10 runs per persona per task, one sweep per axis.
- AC2 The dashboard looks populated after seeding.

### F12 Recording

- AC1 Every run produces a `webm` video and a Playwright `trace.zip`.
- AC2 Both are downloadable from run detail.
- AC3 File names contain persona, seed and run id.

## UI

Screens:

1. Personas: card grid with avatars, builder from blocks.
2. Preview: sliders on the left, page as perceived on the right. Optional second pane with the real page for side-by-side.
3. Arena (ring): live race, avatars, hero video.
4. Runs: dashboard and filters.
5. Run detail: replay with evidence, video and trace download.
6. Report: per task, findings grouped by type.
7. Sweep: axis, range, table, chart.

Weeks 1 to 3 build screens function first; week 4's design pass decides the look (`docs/ROADMAP.md`, week 4), starting from this brief. Look: two registers on purpose. Input side is playful: large avatar cards, bold names, one colour per persona, race track. Output side is sober: monochrome, dense, evidence first, monospace for seeds and measurements. Dark theme by default. The persona colour is the only thing that crosses both registers.

Avatars: procedural SVG, layered parts, deterministic from the profile seed. Parts follow dimensions: thick glasses for a low contrast threshold, phone in hand for mobile, hourglass for low patience. Six states driven by run events (F6 AC2), each a static variant of the avatar; motion was cut on 2026-10-01 to fit week 3.

## Architecture

Single Node process: HTTP API, in-process job runner, Playwright. No queue, no workers, no Docker for the demo.

```
POST /tasks            Extractor: sentence -> Task
POST /runs             { taskId, profileIds, seeds } -> runIds
   job runner: for each persona x seed: Actor loop (Scout runs per task, by hand)
   Actor step: page -> DOM metrics -> filter(profile, seed) -> Observation
               -> Actor backend (LLM or Jev) -> Action -> behaviour dice -> Playwright -> evidence + RunEvent
GET  /runs/:id/events  SSE stream of RunEvent
POST /analyses         Analyst over a run set -> Finding[]
POST /sweeps           axis, range, step -> loop of runs -> boundary
```

### Filter internals (stream 1, zero LLM)

The full rule catalogue with sources is `docs/RULES.md`. Summary:

- The collector (`collect`) uses Playwright `evaluate` to measure every control and every text block: stable key, role, name, bounding box, computed font size, contrast against the effective background (walk ancestors, composite alpha). Its output is a `PageMeasurement`, with no decision in it.
- `perceive(measurement, profile, seed)` turns the measurement into the step's `FullObservation`. Pure, browser-safe, no clock and no randomness of its own: the Actor, the preview and the sweep all call it.
- Contrast by the WCAG 2.2 formula. Target size and font size compared to profile thresholds with `>=`.
- Softness: a threshold with `softness > 0` gets a band below it, where the element is degraded or invisible by a roll resolved once per element by `hash(run seed, elementKey)`. The arithmetic is in `docs/RULES.md`, "Thresholds, bands and the roll".
- Element key is derived from role, name and structural path, never from DOM index, so re-renders do not change the decision.
- CDP vision deficiency changes the screenshot only. The filter decides, emulation illustrates.

### Contracts frozen in M0

Data at rest: `Profile`, `Task`, `RunResult`, `Finding`.
Data in motion: `Observation` (filter output, Actor input), `Action` (Actor output), `RunEvent` (stream).

All seven live in `packages/core` as zod schemas with one full fixture each. A schema without a fixture is not frozen. `PageMeasurement`, the filter's input, belongs to the `Observation` contract and follows the same rule.

The week 1 review filed its findings as issues #13 to #51. The critical ones (#13 to #16) change these contracts and are fixed before week 2 starts; the contracts count as frozen once they are merged.

## Repository structure

```
packages/core        zod schemas, fixtures, shared types
packages/filter      perception filter, pure functions, browser-free tests where possible
packages/agent       LLM adapter, Scout, Actor, evidence collection
packages/io          Extractor, Analyst, HTTP API, SSE, sweep, database
packages/web         React frontend
packages/target-app  demo target with CSS variables for contrast, font size, target size
docs/                PLAN, ROADMAP
tasks/               agent-ready task files and BOARD
```

## Stack

Exact library picks, ports and import rules: `docs/STACK.md`. Code conventions and Definition of Done: `docs/CONVENTIONS.md`.

- pnpm workspaces, TypeScript, tsx, vitest, Biome.
- Playwright with CDP access, axe-core.
- Hono for HTTP and SSE.
- Drizzle ORM over SQLite, Postgres-compatible schema.
- Vite, React, Tailwind, shadcn/ui, Framer Motion, TanStack Query, Recharts.
- zod for schemas and structured LLM output.

## AI access

API key, not a subscription. Subscription tools are for building the project, not for running it.

- One adapter: `complete({ role, messages, schema, seed })` with structured output, retries, and the token counts and cost of every call. A step's cost is the sum over the calls that chose its action, repairs and retries included.
- `decide({ role, state, question })` in the same adapter: one Jev Choice question over text, a probability per option back. The Actor's Jev backend is its only caller (A22).
- Role configuration: `extractor`, `scout`, `actor`, `analyst`, each mapped to a model id, a temperature and an optional reasoning effort in config. While we build, every role defaults to the team's model ladder pick, GPT-6 Luna. The Analyst differs from the Actor by effort only (`max` against `high`). From week 3, report and pitch runs escalate it to the strong model with `LLM_ANALYST_MODEL=anthropic/claude-opus-5.5` (`packages/agent/src/llm-settings.ts`). Until then, the escalation lines in `.env.example` point at Luna too, so a stray run never bills the expensive models. The `actor` role also has a backend setting, `llm` or `jev`, and Jev's pinned model id.
- OpenRouter as the default endpoint. Direct OpenAI or Anthropic keys work through the same adapter.
- Local Ollama configured as an emergency fallback, never demoed.
- Cost shown on the dashboard. "30 runs for 1.20 USD" is a pitch point.

## Locked decisions

- Observation is filtered accessibility-tree text with refs, bounding boxes and measured metrics. Screenshot input is optional and off.
- Own target app exists from week 1.
- SQLite first.
- OpenRouter, one key, 50 USD cap.
- Name Wayford, workspace scope `@wayford/*` (A19).

## Risks

| Risk | Mitigation |
|---|---|
| 64 human hours is small. Integration eats time. | Contracts frozen in week 1, fixtures everywhere, each task ends in a merged PR. |
| Asynchronous team, nobody in one room. | Filter-contract changes go through PR with two approvals within 48 h, other changes with one. Weekly 30 minute sync. |
| Agent hangs during demo. | Backup video is mandatory, produced in week 4. |
| Filter decisions flicker between re-renders. | Stable element key, decision cached per run, tested. |
| Scope creep into behaviour and knowledge dimensions. | A12 fixes the scope. Extra dimensions go to the "what next" slide. |
| Empty dashboard. | F11 demo data in week 4. |
