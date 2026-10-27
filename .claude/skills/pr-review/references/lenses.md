# Review lenses

The review standard for this repo. Three reviewers apply it: `/pr-review` (step 4 of `SKILL.md`), the `branch-reviewer` agent that `/start-task` runs, and the CI review in `.github/workflows/claude-code-review.yml`. Change it here and all three change.

Apply every lens to every change; skip one only when it cannot apply (no model call in the diff, no UI). Each lens names what to look for, not what to praise.

## Calibration

What is not a finding here:

- Anything `pnpm lint` or `pnpm typecheck` catches. Running them is part of the review; restating their output is noise.
- Style and naming preferences, where the change reads like the code around it.
- Work an acceptance box demands. If the box itself asks for too much, raise it as a question about the task, not a defect of the PR.
- Future work nobody asked for yet, unless the task or `docs/ROADMAP.md` says it should exist by now.
- "Could be more generic, extensible or configurable." The pushback only ever runs toward less.

Vulnerability or hardening: Wayford is a local tool (io listens on `localhost` only). A vulnerability needs a path from an untrusted input (see the security lens) to harm, and you name that path. Everything else is hardening, at most **should fix**.

## Severity

- **Blocking**: breaks the untouchable core, a frozen contract or an ADR; wrong behaviour; a security vulnerability; a red check; an acceptance box unmet, or ticked with evidence that does not prove it; Out of scope touched without saying so; over-engineering that sets a precedent (a new layer, pattern or dependency others will build on, or a cut larger than the feature).
- **Should fix**: over-engineering with a clear cut; a test that checks less than it claims; a missing failure-path test; a comment or document that promises more than the code does; scope creep the PR declares openly.
- **Nit**: only when it changes meaning, at most five.

Verdict: any blocking finding makes it **not ready**; should-fix findings or cut-list items without a blocking one make it **merge after fixes**; otherwise **merge**.

Every simplicity finding names the smaller alternative and roughly how many lines it removes; together they form the **cut list**. "Consider simplifying" is not a finding. "Delete `RuleRegistry` (60 lines) and call `perceive` from its one caller" is.

Also report: the PR needs one human approval, from someone who did not work on the task (`docs/CONVENTIONS.md`, "Git").

## 1. Untouchable core

`AGENTS.md`'s three mechanisms and three sentences. Breaking one is blocking.

- **The persona is a filter, not a prompt.** Nothing about the persona reaches an Actor prompt template: no name, description, trait, threshold, vocabulary or "impaired" wording (`docs/PLAN.md` F5 AC6, A12). An element below threshold is removed from the Actor-facing observation, never kept with a label such as `[low contrast]`. `packages/filter` makes zero model calls.
- **The Actor is our own loop.** Every model call goes through the one `fetch` adapter. No SDK, MCP layer or agent CLI that holds the context (`docs/STACK.md`, "Agent"), and no `if (provider)` outside the adapter. Jev sees exactly the observation the LLM sees and stays out of the filter and the Analyst (`docs/adr/0001-jev-actor-backend.md`).
- **Seed.** Perception is decided once per element per run, from `hash(run seed, elementKey)`. Behaviour dice roll per action from one stream of the run seed, logged with the rolled value; Jev's draw has its own stream. The profile seed only draws the avatar (A20). Nothing that can differ between two runs with the same seed and the same answers feeds a decision: the wall clock, the completion order of parallel work, collections filled from async results, locale-dependent comparison.
- **Scout isolation.** The Actor code path never imports Scout output (F4 AC3).
- **Claim less than you'd like to.** Report copy, finding text, UI labels and docs say what is unreachable under stated assumptions; they never predict what a real person would do. Every finding has a type and a basis whose provenance is copied in code from the profiles, never taken from the Analyst's output; a `folk` or `llm` basis stays soft (F8 AC5). A finding without evidence is not rendered. Jev's confidence is a hypothesis, never a measurement.
- **A task never carries its solution.** Task text, fixtures and Extractor output name no screens or paths. Success is a URL, a DOM element or a request, never the model saying it succeeded.
- **Vocabulary.** English everywhere. A persona is a capability bundle: a bare name and a one-line description, no job title, diagnosis or "impaired" and "able-bodied" wording. No leftover domain jargon (energy, cooperatives).

## 2. Simplicity and scope

The lens a normal review skips. Agents write too much, fluently. Put every new file, export, type, parameter, option, branch and test through the **deletion test**: what breaks if it goes? If no acceptance box and no current caller breaks, it goes on the cut list.

- **Out of proportion.** Compare the diff with the task's size and with what the feature needs. Tests several times the size of the code they test, a spec longer than the code, a script or doc the task never asked for.
- **Hand-rolled infrastructure** where one config line or an existing tool does the job: a regex walker over imports where a Biome `noRestrictedImports` override or a `tsconfig` does it (not the Scout-isolation test of `s2-04`: Biome cannot tell two modules in one package apart, so F4 AC3 needs that walk); an own queue, cache, event bus or retry wrapper the task does not need; a hand-written check that a zod parse already makes.
- **Speculative generality.** An interface, registry, factory, strategy, plugin point or generic parameter with one implementation or one caller. Options nobody passes. A switch for backends the plan does not have. Code "for when X lands".
- **Layers that only forward.** A wrapper around one call, a class around one function, a second DTO beside a core schema (`docs/STACK.md`: the core schema is validated at the edge, no second set).
- **Defence against impossible states.** Checks the types or an earlier zod parse already rule out. `try`/`catch` that returns a default, or logs and carries on (`docs/CONVENTIONS.md`, "Errors": never swallow). The same validation at every layer instead of once at the boundary.
- **Test bloat.** Tests of test helpers, tests that restate constants or the implementation, ten near-identical cases where a table of three covers the behaviour, tests of zod, Playwright or the language. The target: one test per acceptance box and one per failure path, each checking behaviour.
- **Comment and doc bloat.** A comment that restates its code or outgrows it; JSDoc on every private helper; a spec, README or comment that copies `docs/STACK.md` or `docs/RULES.md` instead of naming the section. A comment earns its place by saying why.
- **Scope creep.** Files outside the task's "Files expected to change" without a reason; fixes on the way in files another open task owns (an open issue or pull request); refactors of code the task did not need to touch; an `index.ts` barrel rewritten instead of one line added.
- **Dependencies.** A new package without a line in `docs/STACK.md`; a package for what fifteen lines do (STACK's own bar: own `mulberry32`, own contrast); two packages for one job.

Severity follows **precedent**: the more copyable the pattern, the higher. A new layer, pattern or dependency others will build on this week is blocking; one over-long local function is should fix.

## 3. Evidence

Agent-written changes describe themselves confidently. Hold every claim against the code.

- **Ticked boxes.** Each ticked acceptance box, in the task file and the PR body: does its evidence prove that box, and not a neighbouring one? Run it.
- **Tests that lie.** Does each test check what its name says (issue #42 lists the usual ways it does not)? For the tests that guard acceptance boxes, break the guarded code with a one-line probe and watch the test go red. One that stays green is a finding.
- **Comments that promise.** A comment saying the code "rejects events from other runs" is a claim; issue #24 was exactly that comment over code that accepted them.
- **Enforcement in prose.** A doc saying something "fails lint" or "is enforced by a test": write a probe that breaks the rule and see it fail (issue #26).
- **Description against result.** The PR description and the decision log (the spec's, or for an S task the plan's, copied into the PR body) match what was built.
- **APIs that exist.** Every API and flag exists in the installed version (check the lockfile), is not deprecated (zod 4 has `z.url()`, not `z.string().url()`), and type packages match the runtime (Node 24).

## 4. Architecture and contracts

- **Package imports** (`docs/STACK.md`, "Package import rules"): core imports nothing from the workspace; filter imports core; agent imports core and filter; io imports core, filter and agent; web imports core, and filter only through `@wayford/filter/perceive`, which stays browser-safe.
- **Contracts.** The seven schemas in `packages/core` are used, not copied, loosened or worked around. A new shape gets its schema in core and a fixture in the same PR (`docs/CONVENTIONS.md`, "Tests"). The filter contract and `docs/RULES.md` are frozen for week 2.
- **Decisions.** A change that contradicts `docs/adr/`, a locked decision in `docs/PLAN.md`, or the "Rejected — do not resurrect" list in `AGENTS.md` is blocking unless the same PR amends that document and the team has agreed.
- **Layout** (`docs/CONVENTIONS.md`): one feature per file, its test beside it, no `utils.ts` or `helpers/`, barrels that only re-export.
- **Errors, config, logs.** `WayfordError` with a `code` at package boundaries, plain errors inside. Environment read once, through the zod-validated config. `pino` with `runId` on every line of a run.
- **Data.** Tables `snake_case` and plural; migrations generated by `drizzle-kit` and committed; ids are prefixed lowercase ULIDs from core's generator.

## 5. Correctness

- **Failure paths.** A run that crashes mid-step or runs out of budget; events out of order, duplicated, late or from another run; an empty page; an element with no name; the model timing out or returning invalid output.
- **Edges.** `>=` passes (`docs/RULES.md`); off-by-one on caps and step indexes; values exactly on a soft band's floor and threshold.
- **Resources.** Unawaited promises; a Playwright browser, context or page left open on the error path; an SSE stream or listener never closed.
- **Parallel runs.** 3 to 5 runs at once (F6): module-level state shared between runs, one browser context reused across runs.

## 6. Security

Untrusted inputs: page content from the site under test, model output, user stories and files given to the Extractor, and PR and issue text read by the CI agents.

- **Page content into prompts.** Every page-controlled string (title, URL, name, role, text) is quoted or constrained so it cannot forge lines in the rendered observation (issue #17). Probe it with a title that contains newlines and an instruction.
- **Model output.** Parsed with zod against a closed schema, refs checked against the current observation, waits and steps capped. It never chooses a shell command, file path, SQL fragment or URL.
- **Extractor input.** Path stripping (F3 AC1) is backed by a deterministic check on the output, not by the model's good behaviour alone.
- **Secrets.** The key comes only from the config and is sent over https, loopback aside. It never lands in logs, run records, evidence, traces, SSE events, error messages or fixtures. Tests never read the real `.env`.
- **The browser as an attacker.** A page under test runs JavaScript on the same machine as io on `localhost:3000`. State-changing routes reject simple cross-origin requests (require `application/json`, or check `Origin`). Files served from io are found by schema-validated ids, never by a raw parameter joined into a path.
- **Storage and rendering.** Drizzle builders, raw `sql` only with bound parameters. The web app renders page text, narration and model output as text, never through `dangerouslySetInnerHTML`.
- **CI** (`.github/workflows/`): no `pull_request_target`; no `${{ github.event.* }}` text interpolated into a `run:` step; actions pinned by SHA; Claude workflows keep their read-only tool lists (issue #45).
- **Supply chain.** A package with install scripts is allowed deliberately in `pnpm-workspace.yaml`; `pnpm-lock.yaml` changes match the `package.json` changes.

## 7. LLM integration

Only when the diff builds a prompt, calls a model or parses its output.

- **Deterministic work stays in code.** Path detection, success checks, provenance copying and anything countable. A model doing what twenty lines of code could do is a finding.
- **Structured output** (`docs/STACK.md`, "Agent"): an object-rooted response schema, strict `json_schema` where supported, every response re-parsed with zod, one repair round, then a typed failure.
- **Calls.** A timeout on every call; own retries, exponential, at most 3, each logged; cost stored per step from `models.yaml`; the cheap model on the Actor, the strong one on the Analyst.
- **Tests.** No test calls a real model; the fake adapter returns canned structured output.
