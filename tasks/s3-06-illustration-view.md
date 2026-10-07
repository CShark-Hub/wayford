# s3-06 — Illustration view: the page under the persona's vision emulation

Stream: s3
Milestone: week 4 (planned for week 3 in PR #137; moved on 2026-10-01 when that plan was folded into the persona-fit plan: week 3 is full, and this view is part of how the hero screen looks)
Size: M
Depends on: s3-05, s2-02. Built after s3-07, the design direction, so it lands in the new look. Optional: taken only once the must tasks are taken.

## Context

Read first, in this order:

- `docs/PLAN.md` F2, AC4 above all, and section "UI"
- `docs/RULES.md` rule P6
- `packages/agent/src/run-context.ts` after s2-02 — the persona's device and its vision emulation through CDP
- `packages/io/src/` after s3-05 — `/measure`, its cache and its fallback
- `packages/web/src/screens/preview.tsx` and `packages/web/src/preview/search.ts` after s3-01 — the View control and the URL contract

## Goal

The preview gets a third view, Illustration: the target app's `/deliveries` as a screenshot taken under the persona's Chrome vision emulation, `blurredVision` for Vera and `reducedContrast` for Zoya, shown as an illustration and never as the filter's decision.

## Interface

- In: `profile.device` and `profile.perception.emulation` (`VisionDeficiency`) from `@wayford/core`; the target app at its default parameters
- Out: io `GET /illustration?device=desktop|mobile&emulation=<VisionDeficiency>`, returning a PNG of `/deliveries`; a stored PNG for each device and emulation the fixture personas use, in `packages/web/public/illustration/`, for when io or the target app is down; a third option, "Illustration", in the preview's View control
- Files expected to change: `packages/io/src/**`, `packages/web/**`, and a capture script in `packages/io/scripts/` that writes the stored PNGs into `packages/web/public/illustration/`

## Constraints

- "CDP vision-deficiency emulation applies to the screenshot layer and is labelled as illustration, not decision" (F2 AC4). "The filter decides, emulation illustrates" (`docs/PLAN.md`, "Filter internals"). The view says so on screen, in words.
- One source for the picture: Chrome's own emulation through CDP `Emulation.setEmulatedVisionDeficiency`, as s2-02 applies it to every run screenshot. No CSS filter, canvas effect or SVG filter in web stands in for it: that would be "a second visual approximation" (F2 AC3).
- The picture does not follow the sliders. Emulation is the persona's and a threshold is the filter's, so a moved slider changes the other two views and not this one. The view says that too, so nobody reads a slider into the blur.
- io takes each picture once per device and emulation and keeps it until io restarts, as it does for `/measure` (s3-05). Moving a slider never calls io.
- Fallback as in s3-05: with io or the target app unreachable, the stored PNG for that device and emulation, and the same banner.
- A link s3-01 made keeps its meaning: `evidence=true` still opens the evidence view.
- A persona whose `emulation` is `none` (Ada, Kai, Milo) shows the plain page, labelled as having no emulation, not hidden.
- Claim less: no label says what a persona "sees". The words are about what Chrome's emulation renders.
- Accessible: the picture's `alt` names the page and the emulation, and the third option has a visible name.

## Acceptance

- [x] `pnpm --filter @wayford/io test` includes `/illustration` against the running target app: a PNG for `blurredVision` whose bytes differ from the one for `none`, and a second request for the same pair served from the cache
  - `packages/io/src/illustration.browser.test.ts`, on a served target app: "blurredVision pictures /deliveries in other bytes than no emulation does, both PNG" and "a second request for one device and emulation is answered from the cache".
  - The route's own cases are in `illustration.test.ts`: the defaults, the 400s, one capture per pair, shared in-flight requests, and a failed capture as a 502 that is not kept.
  - `pnpm --filter @wayford/io test`: 39 files, 353 tests, after merging main.
- [x] A web test renders `/lens` for Vera in the illustration view and shows the picture for `desktop` and `blurredVision`, the words "illustration, not decision", and no drawn element
  - `lens.test.tsx`, "Vera's illustration view shows Chrome's blurredVision picture of /deliveries, labelled, with nothing drawn".
- [x] A web test with a fetch spy shows that moving a slider in the illustration view requests no picture
  - `lens.browser.test.ts`, "in the illustration view the picture is fetched once, slider moves fetch nothing, and a persona switch does". The persona switch to Zoya fetches her picture, which proves the spy sees picture fetches.
- [x] With io stopped, the illustration view shows the stored picture and the banner
  - `lens.test.tsx`, "with io stopped, the stored picture shows under its own banner, below the measurement's, and no Live: line": both of io's answers failed.
  - `lens.browser.test.ts`, "off /deliveries no picture is asked for; a failed picture reads stored though the page is live, and Try again brings io's back": the picture alone failed, then the banner's Try again replaces the stored picture with io's.
  - By hand, with web and the target app up and io stopped: `/illustration/desktop-blurredVision.png` under "The live picture is unavailable: io did not answer (HTTP 502). Showing the stored picture of /deliveries on desktop, blurredVision, taken at the target app's default parameters.", with the badge "stored picture" and the page at 720 px.
- [x] A link with `evidence=true` still opens the evidence view
  - `lens.test.tsx`, "a link with evidence=true opens the evidence view, beside illustration=true too", and `search.test.ts`.
- [x] With `pnpm dev`, Illustration shows a blurred `/deliveries` for Vera, a low-contrast one for Zoya and an unemulated one for Ada, labelled as such (screenshots in the PR)
  - At 1280 × 720, with io started on a placeholder LLM key and an unreachable base URL, so nothing could be billed. Each screen fits with no scroll, under the badge "live picture".
  - Vera reads "Chrome's blurredVision emulation on desktop: an illustration, not decision. …", Zoya "Chrome's reducedContrast emulation on desktop: …", and Ada "No vision emulation, the plain page on desktop: …".
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root
  - Biome is clean on 385 files and typecheck exits 0. `pnpm test`: 153 files, 2136 tests, after the second review's fixes.
  - `pnpm --filter @wayford/web check:self`: `4 screens checked in Daylight and Night: 0 shortfalls`, the new `lens-illustration` entry included, beside s3-08's `report`.

## Outcome

- **Built on the Lens.** This task predates s3-11, so its Context names `screens/preview.tsx` and "the preview". The view is on `screens/lens.tsx`, at `/lens`.
- **The URL.** It gains `illustration=true` beside `evidence=true`. When both are set, `evidence=true` wins.
- **Off `/deliveries`.** The view shows no picture and asks io for none. It says the illustration is of `/deliveries` only, and links there.
- **The capture command** is `pnpm --filter @wayford/io capture:illustrations`, in `packages/io/src/illustration-cli.ts`, not `packages/io/scripts/`. io's other CLIs live in `src/`, and io's typecheck covers only `src/`. The four stored PNGs total about 228 KB.
- **Outside the expected files:** `packages/web/scripts/self-check.ts` holds the view to the floors, since `[data-lens-stage]` does not cover it.
- **ADR 0002 cut a third "real page" view.** This view is F2 AC4's labelled emulation screenshot, fixed to the persona, so it is not that view. The spec's decision log says why.
- **Board.** The board row still lists `s3-07` as a dependency. The view is built on s3-13 and s3-11, which replaced s3-07's direction.

## Out of scope

- Any effect on the perceived drawing itself. The drawing stays the filter's decision.
- An emulation strength that follows a threshold slider.
- The evidence outlines drawn over the picture. Considered while planning, and left for later: it puts the decision and the illustration in one frame.
- Other pages than `/deliveries`, other target-app parameters, real public sites.

## Notes for the reviewer

- Look for any path from the picture into `perceive`, the counts or the drawing. There should be none.
- Read every label as a juror would. Nothing should claim to show what a person sees.
