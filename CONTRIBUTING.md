# Contributing to Wayford

Wayford is built by a team of four working asynchronously; AI coding agents write most of the code, and humans direct and review it. This page is how a change gets from an issue to `main`.

## Before you start

Read [`AGENTS.md`](AGENTS.md), then [`docs/PLAN.md`](docs/PLAN.md), then the issue or the task file. `AGENTS.md` holds the product rationale, the untouchable core and what was rejected and why, whether you are a person or an agent.

## How work is organised

- **Issues.** Every change starts from an issue on [`CShark-Hub/wayford`](https://github.com/CShark-Hub/wayford/issues), and the issue is the task: it holds the context, the acceptance boxes and what is out of scope. Its assignee and its state show who owns it and where it stands.
- **Tasks.** The hackathon's work items are files in [`tasks/`](tasks), and [`tasks/BOARD.md`](tasks/BOARD.md) is its record. No new task files are written.
- **Specs and plans.** An M or L task writes a spec in [`docs/specs/`](docs/specs) and a plan in [`docs/plans/`](docs/plans) before it is built. An S task's file is its spec.
- **Decisions.** A decision taken after the plan gets an ADR in [`docs/adr/`](docs/adr): context, rejected options, consequences.
- **Pull requests.** One per change, one reviewer who did not work on it, squash merged. `main` stays green.

## Making a change

1. Take an open issue that nobody is assigned to, and assign yourself. If it has no acceptance boxes or does not say what is out of scope, add what is missing to it before you start. If you cannot set an assignee or edit the issue, comment on it with anything it lacks, and a maintainer assigns you and adds that to the issue.
2. Branch as `<kind>/<slug>`, such as `fix/goal-check-at-intake`, or as `feature/<task-id>-<slug>` for a task. Do only what the issue or the task file says, and tick its acceptance boxes with evidence.
3. Run the checks in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md#checks): `pnpm lint`, `pnpm typecheck` and `pnpm test`.
4. Open a pull request titled `Fix #n: …` or `Part of #n: …`, or with the task id for a task, using the [template](.github/pull_request_template.md). It needs those checks green, and one reviewer.

## Rules that always apply

- The conventions and the Definition of Done are in [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md), the determinism rules in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md#determinism).
- Everything is in English: code, comments, fixtures, UI copy.
- Check a change against the untouchable core in `AGENTS.md`: a persona that becomes a prompt, or a model inside the filter, undoes what the project is for.
