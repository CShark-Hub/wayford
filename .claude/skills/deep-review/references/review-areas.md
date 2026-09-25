# Review areas

The checklist for step 2 of `SKILL.md`. Cover every area. Skip a line only when it cannot apply (for example no LLM code and no LLM plans).

## Principles

- Be critical but pragmatic. Don't invent issues to produce feedback.
- Prioritise by impact, not by code style.
- Don't recommend abstractions, layers, patterns or infrastructure unless they solve a concrete problem you can name.
- Don't recommend replacing a library just because another exists.
- Don't treat unbuilt future features as defects unless the specs say they should exist at this stage.
- Separate clearly: confirmed problem (reproduced), likely risk, ambiguous requirement, gap, hardening, optional improvement.
- Reference concrete files and lines. Quote short snippets as evidence.

## 1. Architecture and overall design

- Fit to current and expected scope; over-engineering or unnecessary complexity.
- Module, layer and responsibility boundaries; dependency direction and coupling.
- How easily an experienced developer can navigate it.
- Consistency with ADRs and documented decisions; decisions worth reconsidering.
- Are documented boundaries actually enforced (lint rules, tests), or only described? Try to bypass them with a probe (relative imports, subpath imports).

## 2. Implementation quality

- Clarity, maintainability, testability, simplicity.
- Error handling and edge cases, especially failure paths: what happens when a process ends halfway, input arrives out of order, or comes from the wrong source.
- Duplicated logic, hidden coupling, fragile assumptions, technical debt.
- Tests: do they test behaviour, or restate the code? Do they claim more than they check? Are the important failure paths covered?
- Fixtures and sample data: do they reference each other consistently?

## 3. Libraries and dependencies

- Appropriate for their purpose; used correctly; compatible with each other's major versions (for example a helper library built for an older major version of its peer).
- Custom code where a well-established library is clearly better, and the reverse.
- Overlapping or unnecessary dependencies; lockfile consistency; type packages matching the runtime version.

## 4. Security

Distinguish actual vulnerabilities from hardening.

- Authentication, authorisation, permissions and access boundaries.
- Secrets and configuration: defaults, validation at boot, logging of secrets, `.gitignore` coverage of databases, traces and artifacts.
- Input validation and injection (SQL, shell, HTML, prompt).
- API security, trust boundaries, network communication (plain HTTP for secrets).
- File handling.
- CI workflows: `pull_request_target`, untrusted text interpolated into `run:` steps, token permissions, fork handling, actions pinned by tag instead of SHA, AI agents in CI that can be steered by issue or PR text.
- Dependency risks.

## 5. LLM / AI integration

Review what exists and the contracts that will carry model input and output.

- Prompt construction and boundaries: is untrusted content (page text, user files, issue bodies) escaped or quoted so it cannot forge structure in the prompt? Probe it.
- Prompt injection risk and the blast radius: what can model output make the application do?
- Tool and function execution boundaries; closed action sets; validation of model output against schemas; structured-output compatibility with the chosen providers.
- Data sent to providers; secret handling.
- Retries, timeouts, failure handling, token and context management, cost control, observability of each call.
- Work given to the LLM that should be deterministic code.
- Specs promising determinism or reproducibility a model cannot deliver.

## 6. Specifications and ADR compliance

- Code contradicting ADRs or specs; specs outdated by the code; functionality diverging from the specification.
- Documents that contradict each other (read the specs against each other, not only against the code).
- Important decisions that exist only in code.
- Ambiguous requirements that are already producing risky assumptions in code or docs.
- Stale statements in the files every newcomer or agent reads first.

## 7. Repository-wide consistency

- Different patterns solving the same problem; inconsistent error handling, configuration or validation; duplicated infrastructure.
- Naming and structural conventions; leftovers the docs say were removed (old names, old domain vocabulary).
- Code that looks fine locally but conflicts with the architecture as a whole.
- Process: did the branch touch files outside its task's declared scope?

## Output of the review

Every finding records: location (file:line, permalinks), what the problem is, why it matters, a concrete recommendation, and its classification. Then the verdict, answering whether the project is currently:

- architecturally coherent
- reasonably simple to understand
- implemented with sound engineering practices
- secure enough for its intended use
- correctly integrating with LLMs, where applicable
- moving in a maintainable direction
