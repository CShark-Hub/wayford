# AGENTS.md — Wayford project context

For any AI agent (Claude Code, Codex, other) picking up work on this repo.
The product description lives in `tasks/KONCEPCJA.md`. **This file holds what that one doesn't: why these choices and not others.**

---

## Current state

Weeks 1 to 3 done, week 4 running from 2026-10-05; merge cutoff Tuesday 2026-10-13, for the demo and the finals on 2026-10-14. Four people, up to 4 h per person per week. Asynchronous team, AI agents write most code, humans direct and review.

What exists: the seven contracts in `packages/core`; the perception filter with knowledge, vocabulary and attention stages (`packages/filter`); the Actor loop on an LLM or Jev, Scout and the calibration run (`packages/agent`); the runs API and database (`packages/io`); the personas, preview, arena, runs and run detail screens (`packages/web`); the target app with three routes to its hard goal (`packages/target-app`).

Planning docs:

- `docs/PLAN.md` — goal, requirements F1–F12 with acceptance criteria, UI, architecture, stack, locked decisions, assumptions.
- `docs/KICKOFF.md` — week 1 assignment, how to run a task, rules for parallel agents.
- `docs/RULES.md` — the filter pipeline, every rule with its source id, the five persona bundles. A change takes a PR with one approval, like everything else from week 4.
- `docs/STACK.md` — exact library picks and package import rules. `docs/CONVENTIONS.md` — layout, determinism rules, Definition of Done.
- `docs/ROADMAP.md` — four weekly milestones with exit criteria, working model, cut order.
- `docs/DESIGN.md` — the look every screen follows; `docs/design/` draws it, screen by screen.
- `docs/adr/` — decisions taken after the plan, one file each: context, rejected options, consequences. Read the matching one before changing what it covers.
- `tasks/` — agent-sized task files, `BOARD.md` for ownership and status, `TEMPLATE.md` for new tasks.

Next move: the week 4 table in `tasks/BOARD.md`: the Analyst and report, the sweep, K2, axe, Jev in io and run detail, the design pass, `seed:demo`. Scope was agreed on 2026-10-04 (`docs/PLAN.md`, "Hackathon scope"): what `docs/DEMO.md` shows, in the simplest form that serves its beat.

If you are an agent picking up a task: read `AGENTS.md`, then `docs/PLAN.md`, then the task file. Do only what the task file says.

---

## What this is, in one sentence

A tool that walks a web application within the limits of a declared user-capability profile and shows where that user got stuck. The question is **"who does it work for"**, not "does it work".

---

## Untouchable core

Three mechanisms. Research confirmed **no existing tool has them**. Drop any one and what's left is a copy of UXAgent with nicer UI — the project loses its point.

1. **Perception filter enforced in code.** A deterministic layer between Playwright and the model's context. Elements below threshold (contrast, font size, target size) **never reach the model**. Zero LLM in this layer.
2. **Seed.** Every run reproducible down to the perception decision. Without it a result is an anecdote, not a bug report.
3. **Capability-axis sweep.** Automatically finding the boundary value at which a path breaks. A `while` loop, one slide, the strongest point of the pitch.

---

## Decisions and rationale

### Persona is a filter, not a prompt

The most important decision in the project. A persona is **never** an instruction like "pretend you have poor eyesight". A persona is a set of thresholds applied to the observation before the model sees it.

Why: it's the only answer to "how do you know this means anything". That answer is: *we don't claim Vera will behave this way — we claim that under these assumptions the button is unreachable; check the assumptions, the rest follows.*

Architectural consequence: the Actor **must** be our own loop. Anything that hands off control of the context (MCP as foundation, agent CLIs) is rejected for this reason.

### Randomness follows three different rules

| layer | rule |
|---|---|
| **perception** | resolved **once per element**, deterministic within a run |
| **behaviour** | rolled **on every action** (`double_click: 0.8`) |
| **knowledge** | fully deterministic |

Why, for perception: rolling per step produces a person with "flickering vision" — the same button visible one moment, gone the next. No such human exists, the report is undebuggable, the bug irreproducible.

Probability works **at run level**, not step level: 10 seeds → "3/10 success" is a result, not noise.

### A profile is a capability bundle, not a job title

"Plumber" carries no information — the model doesn't know how a plumber thinks, only the stereotype. The engine reads dimensions (vision, motor precision, digital literacy, vocabulary, patience, device). A profile carries a bare **name** as its label and a one-line **description** of the bundle; no job title, no diagnosis, no "impaired" or "able-bodied" wording anywhere.

Payoff: we defend "someone with a 3:1 contrast threshold", not "this is how plumbers behave". The first has standards behind it.

### English only, no locales

The whole application is English: UI copy, API, schemas, identifiers, comments, fixtures, descriptions, reports. There is no i18n layer, no locale switch and no translated strings, and none are planned.

Persona names are English too: Ada, Kai, Milo, Vera, Zoya. The initial names each one's dimension. Ada, the control persona, comes first and Zoya, the boundary, last; the names in between sort alphabetically. Polish belongs in `tasks/KONCEPCJA.md` alone.

Why: a locale layer is a week of work that wins no point in the pitch, and half-translated UI is worse than an English one. If the demo needs Polish, it needs a translated target app, not a translated tool.

After the finals the rule stays (decided 2026-10-27). A half-translated UI is still worse than an English one, and no issue has asked for another language. It covers Wayford itself, not the sites and goals it tests. Those have gaps: the goal check in code looks for English words only (`PATH_WORDS` in `packages/core/src/task.ts`), and K2's jargon list holds English terms.

### Provenance on every threshold

Every rule carries its source: `WCAG 2.2`, `fitts`, `pisarek`. Rules without one (e.g. "older people double-click everything") get `provenance: folk`. A prompt-generated profile gets `provenance: llm`.

Why: it lets us say "these findings are hard, these are hypotheses" instead of dumping everything in one bucket. Without it, the first prompt-generated persona wipes out the project's entire defensibility.

### Scout is mandatory

A separate unconstrained run, full vision, building ground truth (where the target actually is, minimum path length). Cached per application version.

Why: without it you can't tell "the feature is broken" from "the feature works but Vera couldn't find it". It's the only proof that the report is about UX and not an ordinary bug.

**The Actor has no access to Scout's output.**

### Separated LLM roles

The actor never grades its own work — the Analyst is a separate pass over collected evidence. The Analyst sees **all** runs across **all** personas at once, not one.

Why: a model that just did something will confirm it did it well. And variance plus cross-persona contrast are only visible at series level.

### A task must not contain the solution

```
❌ "click Deliveries → Order archive"
✅ "you want to see what you ordered three months ago"
```

The Extractor must **actively strip paths** out of user stories, since those are full of screen names. A task containing the path measures instruction-following, not wayfinding.

Every task has a deterministic success condition (URL / DOM element / request), not "the agent says it worked".

### Every verdict clickable through to evidence

No evidence → don't show it at all. The report visually separates: measurement / deterministic / hypothesis.

### Stack: TypeScript throughout

Playwright and CDP live natively in Node. A .NET (orchestration) + Node (executor) split was considered and **rejected** — this tool is a standalone product, not an add-on to an existing backend. The split would cost hours of integration.

### AI through one OpenAI-compatible API

One adapter, config per role (extractor / scout / actor / analyst). The Actor runs × N and drives the bill — cheap model there. The Analyst runs once — strong model there.

While we build, every role defaults to the team's model ladder pick, GPT-6 Luna. The Analyst differs from the Actor by reasoning effort only (`max` against `high`). From week 3, report and pitch runs escalate it to the strong model with `LLM_ANALYST_MODEL=anthropic/claude-opus-5.5`. Until then, `.env.example` keeps its escalation lines on Luna, so a stray run never bills the expensive models (`docs/PLAN.md`, "AI access").

At the hackathon it'll be one key anyway. The adapter exists so there's no `if (provider)` scattered across five files.

### Jev is the Actor's second backend, nothing more

Jev is a decision model on the same OpenRouter key: a probability per option back, no text. The Actor can run on it behind a flag, with the LLM as default, because the Actor is where the bill and the wall clock go. The action is drawn from Jev's probabilities with the run seed, so a stored run replays down to the action.

It stays inside the three sentences: Jev sees exactly the filtered observation the LLM sees, it is one call inside our own loop, and its confidence is a hypothesis, never a measurement. It stays out of the filter and the Analyst. Why, what was rejected, and the gate it must pass: `docs/adr/0001-jev-actor-backend.md`.

---

## Rejected — do not resurrect

**Separate product: Confluence oracle + regression diff.**
Considered at length and dropped. It read user stories, extracted acceptance criteria, tested against them and compared runs ("worked Friday, broken Monday"). Good idea, **different product**, different buyer (QA/PO vs product team), different competition. Shares an engine but not a story. **Do not merge two products into one.** Material for a "what's next" slide.

**Persona as an add-on to a regression tool.**
The original version of the idea. Cut as "soft and hard to defend". It only came back once it became the *whole* product — and then it started holding up.

**MCP as the foundation.**
The host holds the context → the perception filter stops working. On top of that the tool would only run while a human sits in an agent session — no CI, no nightly runs. MCP **as a thin layer on top** (submit a job, get a run ID) is not rejected, but it is not planned either: it can come back through an issue (decided 2026-10-27).

**Claude Code / Codex CLI as the Actor backend.**
Black box — no way to inject the filter between steps. Considered as a way to "use your subscription instead of an API key"; attractive, but incompatible with the core.

**Domain context (energy cooperatives / MSE).**
Present for a long time as the proving ground. **Removed on request** — the tool is meant to be domain-agnostic. Any energy-sector jargon left in code or docs is a leftover and should go.

**Playwright as "the thing we're avoiding".**
The original worry ("we don't want a Playwright wrapper") is resolved: Playwright sits underneath and that's correct. A wrapper is something with neither a perception filter nor ground truth.

**API testing.**
An API has no interface to perceive, so a persona has nothing to filter and the question of who it works for does not arise. A different product, like the Confluence oracle above (decided 2026-10-27). Native mobile apps, more than one project, accounts and export left this entry the same day: they were cut for the hackathon, not on principle, and are now not planned (`docs/PLAN.md`, "Non-goals").

---

## Traps already identified

- **The agent's narration is confabulated after the fact.** "I clicked twice because I thought I had to" is produced *after* the click. That's fine (real test subjects do the same), but behaviour must be measured deterministically and the model left only with interpretation.
- **A model with reduced input ≠ a person with an impairment.** It behaves like an able reasoner with worse input. A real person compensates (leans in, zooms, calls their daughter) — the model won't, unless we add that as a rule.
- **Claim less than you'd like to.** This is a hypothesis generator and a boundary measurement, **not** a prediction of real user behaviour. Claim prediction and you lose the Q&A regardless of code quality.
- **An empty dashboard looks like a prototype.** Generate run history before the pitch.
- **The agent can hang for four minutes in front of the judges.** A backup recording is mandatory.

---

## Prior art (verified research)

- **[UXAgent](https://github.com/neuhai/UXAgent)** (MIT, arXiv 2504.09407, ~111★, 7 commits) — closest match. Personas + Playwright + batch + SUS questionnaire + screenshots + metrics. **Persona there is a pure prompt** (demographics + a paragraph of text). No capability model, no thresholds, no perception filtering, no seed. Research prototype, not a live product.
- **[PersonaLayer](https://github.com/PersonaLayer)** — 45 UX profiles (visual, motor, cognitive, behavioural), WCAG 2.2 aligned. Used to **adapt** pages (Chrome extension), not to test them. Good taxonomy source, not a competitor.
- **Aximo / QA.tech / Momentic / testRigor / Applitools Autonomous** — testing agents. Input: scenario, output: pass/fail. No persona, no recommendations.
- **axe-core, A11y Machine, wcag-contrast-guard** — static scanners. Code and colour analysis, no agent loop.
- **agentest, attest, orq.ai** — simulated users for testing chatbots, not interfaces.

**Found nowhere:** enforced perception filtering inside an agent loop, seeding of perception decisions, capability-axis sweeping.

Team decision: **we build our own**, UXAgent is inspiration, not a base.

---

## Open questions

- [x] **Project name** — **Wayford**. See "On the name" below.
- [x] **Schemas** — seven contracts merged in week 1 (`m0-02` … `m0-05`). The critical review issues (#13 to #16) are fixed before week 2 starts.
- [x] **Stream assignment** — streams are areas of the code, not people. `tasks/BOARD.md` suggests four slots per week; anyone takes any task whose dependencies are merged (`m0-08`).
- [ ] **Hackathon rules** — whether existing frameworks / forks are permitted.
- [ ] Profile taxonomy: take PersonaLayer's or write our own.

---

## On the name

Wayford is a real place, a village on the River Axe in Somerset. The name comes from Old English *weġ* ("way, road") and *ford*: the point where a road crosses water.

A ford is the oldest capability threshold there is. The current is the same for everyone; whether you cross depends on your height, your footing, your nerve. Some walk through dry. Some turn back. Nobody changes the river. What changes is who is trying to cross it.

That is what Wayford measures. There is one interface. The question is who gets across it.

The name also carries the two ideas the tool is built on: **wayfinding**, how people orient themselves and reach a destination, and **affordance**, what an interface offers relative to the capabilities of the person in front of it.

It reads like a surname, which is a gift in the reports:

```
Wayford couldn't find your order archive.
Wayford gave up after 1:50.
Wayford clicked twice. Twice.
```

Usage: product name **Wayford**, workspace scope `@wayford/*`, repository `CShark-Hub/wayford`. In narration and report copy the persona name is used, not "Wayford", unless the report speaks about the tool itself.

## Note to the agent

Three sentences repeat deliberately across this file and `tasks/KONCEPCJA.md`:

> The persona is a filter, not a prompt.
> The Actor must be our own loop.
> Claim less than you'd like to.

That isn't redundancy. Those are the only three things separating this project from existing tools, and every technical decision is worth checking against them.
