# s3-02 — Persona cards and procedural avatars

Stream: s3
Milestone: week 2
Size: M
Depends on: m0-07, issue #26 (`rng` in core)

## Context

Read first, in this order:

- `AGENTS.md` section "A profile is a capability bundle, not a job title"
- `docs/PLAN.md` F1, assumption A10, and the avatars paragraph in section "UI"
- `docs/STACK.md` section "Web", the avatars row
- `packages/core/src/profile.ts` — the dimensions an avatar follows
- `packages/web/src/` after m0-07 — the shell this task puts a router in

## Goal

The web app gets its router and dark shell, and a personas screen shows the four fixture personas as cards, each with a procedural SVG avatar drawn from the profile's seed and dimensions, so the input side of the product has its playful register, the preview has a shell to live in, and the ring in week 3 has something to animate.

## Interface

- In: `Profile` from `@wayford/core`; the persona fixtures from `packages/core/src/fixtures/profiles/*.yaml`
- Out: TanStack Router with an app shell other screens add routes to; route `/personas`; an `Avatar` component and the pure function behind it in `packages/web`; the core fixtures bundled for the browser
- Files expected to change: `packages/web/**`, `pnpm-lock.yaml`, `docs/STACK.md` only for a dependency it does not list

## Constraints

- Deterministic: the same profile gives the same SVG, byte for byte. Randomness only from `rng(profile.seed)` in core. That is what the profile seed is for (`docs/PLAN.md` F1 AC4).
- Parts follow dimensions, never a job title or a diagnosis: glasses that thicken as the contrast threshold rises, a phone in hand for `device: mobile`, a sign of patience from `budgetSeconds`. One colour per persona: the only thing that later crosses into the output register.
- A card shows the label, the description, the device, and each switched-on threshold with its provenance, with `folk` and `llm` shown as such. No "impaired", "disabled" or "able-bodied" anywhere.
- Own SVG parts, no avatar library (`docs/STACK.md` rejected DiceBear).
- `@wayford/core/fixtures` reads from disk and cannot run in a browser. Bundle the fixtures another way, such as JSON and YAML imports or a build step, validated with the core schemas; no Node polyfills. s3-01 reuses it for the measurement fixture.
- TanStack Router, with search params typed, because the preview keeps its sliders in the URL (`docs/STACK.md`). Dark theme by default (`docs/PLAN.md` "UI"). The m0-07 event list stays reachable on its own route.

## Acceptance

- [ ] `pnpm --filter @wayford/web test` passes and includes a test for the avatar and one that the bundled profiles deep-equal `profileFixtures` from `@wayford/core/fixtures`
- [ ] A test proves the same profile renders the same SVG string twice, and Ada and Vera render different ones
- [ ] A test proves a contrast threshold of 7 draws thicker glasses than one of 3, and Milo's avatar holds a phone
- [ ] `http://localhost:5173/personas` shows four cards in the order Ada, Milo, Vera, Zoya (screenshot in the PR)
- [ ] A test reads the rendered personas screen and finds none of "impaired", "disabled", "able-bodied"
- [ ] The m0-07 event list still streams the fixture run on its own route (click described in the PR)
- [ ] `pnpm --filter @wayford/web build` passes
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- The five animation states (idle, moving, stuck, done, gave up). They come with the ring in week 3.
- The profile builder and saving profiles (F1 AC1, AC2).
- Any change to `packages/core`.

## Notes for the reviewer

- Put the four avatars side by side. If one reads as a stereotype rather than a set of capabilities, send it back.
