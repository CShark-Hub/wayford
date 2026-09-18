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
| A7 | Ring shows 3 to 5 personas. One hero persona gets live video, the rest get the event stream and per-step screenshots. | default |
| A8 | Boundary sweep covers one axis (contrast) with the axis selector present but disabled. | default |
| A9 | Report is structured findings rendered by the UI. The Analyst fills recommendation and hypothesis fields, never free prose. | default |
| A10 | Avatars are procedural SVG derived from the profile seed and dimensions. No generated images. | default |
| A11 | Three hand-written personas. PersonaLayer is cited as provenance where thresholds match. | default |
| A12 | Perception dimension in full. Behaviour: one dice (double click). Knowledge: vocabulary list passed to the Actor prompt only. | default |
| A13 | LLM access through OpenRouter with one key and a 50 USD cap. Adapter is OpenAI-compatible so any key works. | default |
| A14 | Whole team works in TypeScript. | default |
| A15 | SQLite through Drizzle at start. Postgres is one config change later. | default |
| A16 | Actor receives text observation only (filtered accessibility tree). Screenshot input is a flag, off by default. | default |
| A17 | Tasks live as files in `tasks/`. Status in `tasks/BOARD.md`. | default |
| A18 | Team members run different coding agents (Claude Code, Codex, Cursor). Task files follow the `AGENTS.md` convention that all of them read. | default |
| A19 | Project name is **Wayford**. Workspace scope `@wayford/*`. Rationale in `AGENTS.md`, section "On the name". | Tomasz, 2026-09-17 |

## Goal

Given an application URL, a goal sentence and one or more capability profiles, report at what capability level the goal stops being reachable, with evidence that a developer can reproduce.

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
- AC4 Every profile has a `seed`.

### F2 Live preview

Page rendered as the persona perceives it. This is the hero screen.

- AC1 Slider change re-renders the preview in under 500 ms on the target app.
- AC2 Elements below the contrast, font size or target size threshold are removed or dimmed according to the filter decision.
- AC3 Preview uses the same filter package as the Actor. There is no second visual approximation.
- AC4 CDP vision-deficiency emulation applies to the screenshot layer and is labelled as illustration, not decision.
- AC5 Fallback: with the target app unavailable the preview renders from a stored DOM snapshot.

### F3 Task input

One sentence goal plus a deterministic success condition.

- AC1 Extractor rejects or rewrites tasks containing path words (screen names, "click", arrows) and shows the rewrite.
- AC2 Success condition is one of: URL pattern, DOM selector present, network request observed.
- AC3 Task validates against the `Task` schema.

### F4 Scout run

Unconstrained run that produces ground truth.

- AC1 Produces shortest observed path and target element location for a task.
- AC2 Cached by target URL plus DOM hash. Second request returns cached result.
- AC3 The Actor code path has no read access to Scout output. Verified by a test that fails if the import appears.

### F5 Actor runs

`persona × seed × N` runs through our own loop.

- AC1 Same profile and seed give identical filtered observations per step. Test: two runs, string equality of observations.
- AC2 Behaviour dice rolls are logged per action with the seed-derived random value.
- AC3 Every step stores: screenshot, filtered observation, action, narration, URL, timestamp.
- AC4 A step emits a `RunEvent` before and after the action, over SSE.
- AC5 Budget timeout ends the run with outcome `gave_up`. Reaching the success condition ends it with `success`.
- AC6 Actor prompt never mentions impairment or persona traits. A test greps the prompt template for banned words.
- AC7 A fake cursor is injected into the page and moved to click coordinates before each click, so it appears in video and screenshots.

### F6 Ring

Several personas on the same task, live.

- AC1 3 to 5 runs start in parallel, one browser context each.
- AC2 Avatar state follows run events: idle, moving, stuck, done, gave up.
- AC3 Finish order and elapsed time are visible.
- AC4 Hero persona shows live video through CDP screencast. Others show latest step screenshot.

### F7 Dashboard

All runs.

- AC1 Runs list filters by task, persona and outcome.
- AC2 Per task: success rate and median time per persona.
- AC3 Run detail opens a step-by-step replay with screenshots, observation and action per step.
- AC4 Run header shows `persona | seed | run #`.

### F8 Report

Analyst output per task.

- AC1 Every finding has a type: `measurement`, `deterministic`, `hypothesis`. The UI separates them visually.
- AC2 Every finding links to at least one evidence step. Findings without evidence are not rendered.
- AC3 Every finding has a recommendation.
- AC4 Analyst input covers all runs across all personas for the task.

### F9 Boundary sweep

One axis, one path.

- AC1 Input: axis, range, step. Output: table of value and outcome, first failing value marked.
- AC2 Chart with a marker on the boundary value.
- AC3 Sweep runs reuse the same seed set for every value.

### F10 axe-core sidecar

- AC1 axe violations stored per visited page.
- AC2 Report can cite an axe violation as a `measurement` finding.

### F11 Demo data

- AC1 One command seeds the database with 3 personas, 2 tasks, 10 runs per persona per task, one sweep.
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

Look: two registers on purpose. Input side is playful: large avatar cards, bold names, one colour per persona, race track. Output side is sober: monochrome, dense, evidence first, monospace for seeds and measurements. Dark theme by default. The persona colour is the only thing that crosses both registers.

Avatars: procedural SVG, layered parts, deterministic from the profile seed. Parts follow dimensions: thick glasses for a low contrast threshold, phone in hand for mobile, hourglass for low patience. Five animation states driven by run events, done with CSS or Framer Motion.

## Architecture

Single Node process: HTTP API, in-process job runner, Playwright. No queue, no workers, no Docker for the demo.

```
POST /tasks            Extractor: sentence -> Task
POST /runs             { taskId, profileIds, seeds, n } -> runIds
   job runner: Scout (cached) -> for each persona x seed: Actor loop
   Actor step: page -> DOM metrics -> filter(profile, seed) -> Observation
               -> LLM -> Action -> behaviour dice -> Playwright -> evidence + RunEvent
GET  /runs/:id/events  SSE stream of RunEvent
POST /analyses         Analyst over a run set -> Finding[]
POST /sweeps           axis, range, step -> loop of runs -> boundary
```

### Filter internals (stream 1, zero LLM)

The full rule catalogue with sources is `docs/RULES.md`. Summary:

- Playwright `evaluate` collects per interactive element: stable key, role, name, bounding box, computed font size, foreground colour, effective background colour (walk ancestors, composite alpha).
- Contrast by the WCAG 2.2 formula. Target size and font size compared to profile thresholds.
- Softness: a threshold with `softness > 0` becomes a visibility probability. Resolved once per element by `hash(seed, elementKey)` and cached for the run.
- Element key is derived from role, name and structural path, never from DOM index, so re-renders do not change the decision.
- CDP vision deficiency changes the screenshot only. The filter decides, emulation illustrates.

### Contracts frozen in M0

Data at rest: `Profile`, `Task`, `RunResult`, `Finding`.
Data in motion: `Observation` (filter output, Actor input), `Action` (Actor output), `RunEvent` (stream).

All seven live in `packages/core` as zod schemas with one full fixture each. A schema without a fixture is not frozen.

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

- One adapter: `complete({ role, messages, schema })` with structured output, retries and per-call token and cost logging stored on the step.
- Role configuration: `extractor`, `scout`, `actor`, `analyst`, each mapped to a model id in config.
- OpenRouter as the default endpoint. Direct OpenAI or Anthropic keys work through the same adapter.
- Local Ollama configured as an emergency fallback, never demoed.
- Cost shown on the dashboard. "30 runs for 1.20 USD" is a pitch point.

## Locked decisions

- Observation is filtered accessibility-tree text with refs, bounding boxes and measured metrics. Screenshot input is optional and off.
- Own target app exists from week 1.
- SQLite first.
- OpenRouter, one key, 50 USD cap.
- Workspace scope placeholder `@wayford/*` until the name is chosen.

## Risks

| Risk | Mitigation |
|---|---|
| 64 human hours is small. Integration eats time. | Contracts frozen in week 1, fixtures everywhere, each task ends in a merged PR. |
| Asynchronous team, nobody in one room. | Schema changes go through PR with two approvals within 48 h. Weekly 30 minute sync. |
| Agent hangs during demo. | Backup video is mandatory, produced in week 4. |
| Filter decisions flicker between re-renders. | Stable element key, decision cached per run, tested. |
| Scope creep into behaviour and knowledge dimensions. | A12 fixes the scope. Extra dimensions go to the "what next" slide. |
| Empty dashboard. | F11 demo data in week 4. |
