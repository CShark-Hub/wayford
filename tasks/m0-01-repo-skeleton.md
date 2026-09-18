# m0-01 — Repository skeleton

Stream: m0
Milestone: week 1
Size: M
Depends on: none

## Context

Read first, in this order:

- `AGENTS.md`
- `docs/PLAN.md` sections "Repository structure" and "Stack"
- `docs/STACK.md` (exact picks, ports, import rules)
- `docs/CONVENTIONS.md` (package layout, PR template)

## Goal

A pnpm monorepo where every package builds, tests and lints with one command, so that all other M0 tasks can land in parallel without touching tooling.

## Interface

- In: nothing
- Out: workspace with packages `core`, `filter`, `agent`, `io`, `web`, `target-app`, each exporting one placeholder function with one passing test
- Files expected to change: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `vitest.workspace.ts`, `packages/*/package.json`, `packages/*/src/index.ts`, `packages/*/src/index.test.ts`, `.gitignore`, `.nvmrc` or `.node-version`

## Constraints

- Package names are `@wayford/<name>`.
- TypeScript strict mode, ESM only, `moduleResolution: bundler`.
- Biome is the only formatter and linter. No ESLint, no Prettier.
- vitest for tests. No Jest.
- `web` is a Vite React app. `target-app` is a Vite vanilla app. Do not add pages or components yet.
- Node version pinned to the current LTS.
- No Docker, no CI workflow in this task.
- Add `.github/pull_request_template.md` from `docs/CONVENTIONS.md`.
- Add Biome `noRestrictedImports` rules matching the import table in `docs/STACK.md`.
- Add `.env.example` and a zod-validated `config` module in `io`.

## Acceptance

- [ ] `pnpm install` completes without warnings about peer dependencies
- [ ] `pnpm test` runs vitest across all six packages and passes
- [ ] `pnpm lint` runs Biome and passes
- [ ] `pnpm typecheck` runs `tsc --noEmit` in every package and passes
- [ ] `pnpm --filter @wayford/web dev` and `pnpm --filter @wayford/target-app dev` start on ports 5173 and 5174 as in `docs/STACK.md`
- [ ] A test file in `web` importing from `@wayford/agent` fails `pnpm lint`

## Out of scope

- Any schema, any UI, any Playwright code, any database.
- GitHub Actions.

## Notes for the reviewer

- Check that `packages/core` has no dependencies other than `zod`. Other packages will depend on it and it must stay leaf-light.
