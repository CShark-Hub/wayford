# Contributing to Wayford

Wayford is built by a team of four working asynchronously; AI coding agents write most of the code, and humans direct and review it. This page is how a change gets from a task to `main`.

## Before you start

Read [`AGENTS.md`](AGENTS.md), then [`docs/PLAN.md`](docs/PLAN.md), then the task file. `AGENTS.md` holds the product rationale, the untouchable core and what was rejected and why, whether you are a person or an agent.

## How work is organised

- **Tasks.** Every unit of work is a file in [`tasks/`](tasks), sized for one agent session, with its context, interface, acceptance boxes and what is out of scope. [`tasks/BOARD.md`](tasks/BOARD.md) shows who owns what and its status.
- **Specs and plans.** An M or L task writes a spec in [`docs/specs/`](docs/specs) and a plan in [`docs/plans/`](docs/plans) before it is built. An S task's file is its spec.
- **Decisions.** A decision taken after the plan gets an ADR in [`docs/adr/`](docs/adr): context, rejected options, consequences.
- **Pull requests.** One per task, one reviewer who did not work on it, squash merged. `main` stays green.

## Making a change

1. Pick an unowned task in [`tasks/BOARD.md`](tasks/BOARD.md) whose dependencies are merged. [`tasks/README.md`](tasks/README.md) has the steps.
2. Branch as `feature/<task-id>-<slug>`, do only what the task file says, and tick its acceptance boxes with evidence.
3. Run the checks in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md#checks): `pnpm lint`, `pnpm typecheck` and `pnpm test`.
4. Open a pull request titled with the task id, using the [template](.github/pull_request_template.md). It needs those checks green, and one reviewer.

## Rules that always apply

- The conventions and the Definition of Done are in [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md), the determinism rules in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md#determinism).
- Everything is in English: code, comments, fixtures, UI copy.
- Check a change against the untouchable core in `AGENTS.md`: a persona that becomes a prompt, or a model inside the filter, undoes what the project is for.
