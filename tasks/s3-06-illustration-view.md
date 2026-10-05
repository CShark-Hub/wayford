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

- [ ] `pnpm --filter @wayford/io test` includes `/illustration` against the running target app: a PNG for `blurredVision` whose bytes differ from the one for `none`, and a second request for the same pair served from the cache
- [ ] A web test renders `/preview` for Vera in the illustration view and shows the picture for `desktop` and `blurredVision`, the words "illustration, not decision", and no drawn element
- [ ] A web test with a fetch spy shows that moving a slider in the illustration view requests no picture
- [ ] With io stopped, the illustration view shows the stored picture and the banner
- [ ] A link with `evidence=true` still opens the evidence view
- [ ] With `pnpm dev`, Illustration shows a blurred `/deliveries` for Vera, a low-contrast one for Zoya and an unemulated one for Ada, labelled as such (screenshots in the PR)
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Any effect on the perceived drawing itself. The drawing stays the filter's decision.
- An emulation strength that follows a threshold slider.
- The evidence outlines drawn over the picture. Considered while planning, and left for later: it puts the decision and the illustration in one frame.
- Other pages than `/deliveries`, other target-app parameters, real public sites.

## Notes for the reviewer

- Look for any path from the picture into `perceive`, the counts or the drawing. There should be none.
- Read every label as a juror would. Nothing should claim to show what a person sees.
