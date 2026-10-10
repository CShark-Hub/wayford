# s3-19 — Settings: the gear, the backend switch, and the key and models as placeholders

Stream: s3
Milestone: week 4
Size: S
Depends on: s2-12, s3-13

## Context

Read first, in this order:

- `AGENTS.md`, "Jev is the Actor's second backend, nothing more"
- `docs/PLAN.md`, "Hackathon scope": cut the arena's backend toggle on 2026-10-04. This task brings the toggle back and amends that line in the same PR
- `docs/DESIGN.md`, "Space, shape and layout": the top bar, changed in the same PR
- `docs/adr/0001-jev-actor-backend.md`, decision 1: one backend per run set, the LLM by default
- `docs/adr/0003-any-target.md`, D9: the Target screen's runs and report are on the LLM
- `packages/web/src/arena/panel-calls.ts`: where the Race screen starts a race

Choosing the Actor backend takes `LLM_ACTOR_BACKEND` in `.env` and an io restart today, and the app shows nowhere which backend a race will use. The key and the models live in `.env` too. Moving them into the app was proposed on 2026-10-10 and deferred until after the demo (see "Later").

## Goal

A gear in the top bar opens Settings. Its LLM/Jev switch sets the backend for races started on the Race screen, and the dialog shows the OpenRouter key and each role's model as read-only fields, under a note that says they come from `.env`.

## Interface

- In: nothing new. `POST /runs` already takes `backend` (`s2-12`).
- Out: nothing new.
- Files expected to change: `packages/web/src/actor-backend.ts` (new), `packages/web/src/components/settings-dialog.tsx` (new), `packages/web/src/components/top-bar.tsx`, `packages/web/src/arena/{panel-calls,start-panel}.tsx`, `packages/web/src/screens/arena.tsx`, their tests, `docs/DESIGN.md`, `docs/PLAN.md` ("Hackathon scope"), `docs/DEMO.md` ("Before the demo").

## Constraints

- "Jev sees exactly the filtered observation the LLM sees": the switch picks a backend for a run set, nothing more. A race uses one backend.
- The Target screen stays on the LLM (ADR 0003 D9). The switch does not reach it.
- No io change. The key never reaches the browser: the fields are disabled, and none of them shows a value.
- No new dependency: Radix's Dialog ships in `radix-ui`, already in `docs/STACK.md`.

## Acceptance

- [x] The top bar holds a 40 px ghost gear button named Settings between Runs and the theme toggle. Evidence: `top-bar.test.tsx`, `settings-dialog.test.tsx`.
- [x] The dialog shows the key and the four role models disabled, each naming its variable in `.env`, all described by a note saying they come from `.env` until after the demo. Evidence: `settings-dialog.test.tsx`.
- [x] Picking Jev is stored per browser, and the next race from the Race screen is sent with `backend: "jev"`. The seed hint names the backend. Evidence: `actor-backend.test.ts`; `panel-calls.test.ts`, where `startRace` reads the pick itself, so a pick of Jev reaches the request body; `start-panel.test.tsx`.
- [x] At 1280 × 720 the dialog fits without scrolling, in Daylight and Night, and opens with focus on the switch. Checked in the browser on 2026-10-10.
- [x] `pnpm --filter @wayford/web test`, root `pnpm typecheck` and `pnpm lint` pass. Under Node 26, `current-target.test.ts` fails on `main` too, because Node 26 has a `sessionStorage` of its own. CI runs the Node 24 that `.node-version` names, where every test passes.

## Out of scope

- Taking the key or the models in the app, or any io route for settings.
- The backend of sweeps, `seed:demo` and the other CLIs, which stays `LLM_ACTOR_BACKEND`.
- A model list or a key check against OpenRouter.

## Later

What was proposed on 2026-10-10, for after the demo:

- Key: the OS keychain (`@napi-rs/keyring`), with `.env` as the fallback. The key is never written to a file by the app, and the dialog shows only its last four characters. When no keychain is available the key field stays read-only. Most important of all: a credit limit set on the key itself in OpenRouter.
- Models and effort per role: a one-row `settings` table in io's DB, with `.env` as the fallback. Settings are read when each race or sweep starts, not at boot. The model list comes from `packages/agent/models.yaml`, so every pick has a price.
- An ADR for both before any code.

## Notes for the reviewer

- `docs/DEMO.md`'s pre-demo check now names the switch: the Race no longer reads `LLM_ACTOR_BACKEND`. The s4-08 spec and plan still say "The Race sends no backend"; they are records of what was built then and stay as they are.
- The switch defaults to the LLM, ADR 0001's default, even when `.env` sets `LLM_ACTOR_BACKEND=jev`. A race from the Race screen now always names its backend.
