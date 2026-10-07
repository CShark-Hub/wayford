# s3-06 — Illustration view: spec

Task: `tasks/s3-06-illustration-view.md` · Branch: `feature/s3-06-illustration-view` · Date: 2026-10-07
Status: approved 2026-10-07 (auto)

## Goal

The Lens gets a third view, Illustration: the target app's `/deliveries` as a screenshot taken under the persona's Chrome vision emulation, on the persona's device, labelled as an illustration and never as the filter's decision.

## Constraints that bind

- F2 AC4: "CDP vision-deficiency emulation applies to the screenshot layer and is labelled as illustration, not decision." PLAN, "Filter internals": "The filter decides, emulation illustrates." RULES P6: "illustration only, decision is P1".
- F2 AC3: "There is no second visual approximation." The picture comes from Chrome's `Emulation.setEmulatedVisionDeficiency`, the call s2-02 makes for every run screenshot. No CSS, canvas or SVG filter in web.
- The picture follows the persona, never the sliders. A slider move asks io nothing (task, Constraints).
- io takes each picture once per device and emulation and keeps it until io restarts, dropping a failed one, as `/measure` does (`packages/io/src/routes/measure.ts`).
- Fallback as in s3-05: io or the target app unreachable gives the stored PNG and a stored banner. `evidence=true` still opens the evidence view.
- A persona whose emulation is `none` (Ada, Kai, Milo) shows the plain page, labelled as having no emulation.
- Claim less (AGENTS.md; DESIGN.md Principle 6; DEMO.md "Words we do not use"): no label says what a persona sees. DESIGN.md Principle 1: "A blur never stands in for a decision." No path from the picture into `perceive`, the counts or the drawing (task, Notes for the reviewer; `run-context.ts` P6 comment).
- DESIGN.md: components built once and reused (SegmentedControl, Banner, SourceBadge, Skeleton); loading is a skeleton in the content's shape; floors of 16 px text and 32 px targets; measuring surfaces only where something is measured.
- The Lens fits 1280 × 720 with no scroll (s3-11).
- No new dependency (`docs/STACK.md` has no image library, and none is needed).
- PLAN, "Hackathon scope": the simplest form that serves the beat. The beat is DEMO.md beat 2: "three seconds of the illustration view. 'That blur is Chrome's emulation — an illustration. The threshold decides.'"

## Design

### io: `GET /illustration`

`packages/io/src/routes/illustration.ts`, mounted in `createApp` beside `/measure`:

```ts
export type IllustrateFn = (device: MeasureDevice, emulation: VisionDeficiency) => Promise<Uint8Array>;
const IllustrationQuery = z.object({
  device: MeasureDevice.default("desktop"),          // tablet refused, as /measure refuses it
  emulation: VisionDeficiency.default("none"),
}).strict();
export function illustrationRoute({ illustrate }: { illustrate: IllustrateFn }): Hono;
```

- 200: the PNG bytes, `content-type: image/png`.
- 400 `{ error }`: a query that is not an `IllustrationQuery`. 502 `{ error }`: a `WayfordError` from the capture, such as `target_app_unavailable`. Anything else is a bug and reaches `createApp`'s logged 500.
- The cache is a `Map<string, Promise<Uint8Array>>` keyed `${device} ${emulation}`, with a rejected promise deleted. This is `measureRoute`'s shape.
- `AppOptions` gains `illustrate: IllustrateFn`. `test-app.ts` gets a `noIllustration` that throws, as `noMeasure` does. `server.ts` wires the live one on the shared browser and `TARGET_APP_ORIGIN`.

`packages/io/src/live-illustration.ts`:

```ts
export function liveIllustration({ browser, origin }: { browser: SharedBrowser; origin: string }): IllustrateFn;
```

- It uses `withOwnContext` from `live-measure.ts`, which gives the run's device descriptor, the page loaded with fonts awaited, a deadline and typed errors. The URL is `startUrlFor({ startUrl: `${origin}/deliveries` }, TARGET_APP_DEFAULTS)`. `PageWork` gains `"picturing"`, with `DONE.picturing = "pictured"`.
- The `use` callback runs `page.context().newCDPSession(page)` and then `send("Emulation.setEmulatedVisionDeficiency", { type: emulation })`, `none` included. It then calls `page.screenshot({ scale: "css" })`, the viewport only, as a run's step screenshot is taken.
- The CDP session stays attached until the screenshot is taken. Detaching clears the emulation.
- Unlike s2-02, which sets the emulation before `goto`, this sets it after the page has loaded, since `withOwnContext` loads the page before `use`. The emulation is a render effect, and the browser test's byte comparison proves the picture carries it (see Risks).
- The deadline is its own constant, `ILLUSTRATE_TIMEOUT_MS = 15_000`. The module stays out of io's barrel, as `live-measure.ts` does, and joins `server.ts`'s header list of the modules that load Playwright, with `illustration-cli.ts`.

`packages/io/src/illustration-cli.ts`, run as `pnpm --filter @wayford/io capture:illustrations`:

- It serves the target app (`serveTargetApp({ port: 0 })`) and opens one shared browser.
- It takes the distinct `(device, emulation)` pairs of core's `profileFixtures`: desktop/none, mobile/none, desktop/blurredVision and desktop/reducedContrast.
- It writes each pair to `packages/web/public/illustration/<device>-<emulation>.png`.
- `sharedBrowser` has no close, so it follows `sweep-cli.ts`'s pattern: wrap the launch, and close every launched browser and the target app in `finally`.

### web

**URL** (`packages/web/src/preview/search.ts`):
- `PreviewSearch` gains `illustration: z.literal(true).optional().catch(undefined)`, beside `evidence`.
- `PreviewState` replaces `evidence: boolean` with `view: LensView`, where `LensView = "perceived" | "evidence" | "illustration"`. `evidence=true` wins over `illustration=true`, so an s3-01 evidence link keeps its meaning.
- `personaSearch` carries `illustration` as it carries `evidence`, so a persona switch keeps the view.

**View control** (`packages/web/src/screens/lens.tsx`):
- `VIEWS` gains `{ value: "illustration", label: "Illustration" }`.
- `showEvidence(boolean)` becomes `showView(view)`, which writes both keys (`evidence: view === "evidence" || undefined`, likewise `illustration`) with `replace: true`, as today.
- The scene key takes `state.view`.

**Picture query** (`packages/web/src/api/illustration.ts`):

```ts
export function illustrationQuery(device: MeasureDevice, emulation: VisionDeficiency) // key ["illustration", device, emulation], ...IO_CACHE
export function storedIllustration(device, emulation): string // `/illustration/${device}-${emulation}.png`
```

- Its `queryFn` fetches `/api/illustration?device&emulation`. A response that is not ok rejects with io's `{ error }` (`ioError`, exported from `api/measure.ts`) or `io did not answer (HTTP n)`. An ok response whose `content-type` is not `image/png` rejects with "io sent something that is not a PNG", as `getFromIo` words a refused body. An ok PNG gives `URL.createObjectURL(await response.blob())`.
- The key holds nothing a slider writes, and the screen enables the query only in the Illustration view. So no other view, and no slider move, asks io for a picture.

**Stage** (`packages/web/src/preview/illustration.tsx`, `IllustrationStage`):
- It gets the persona's label, device and emulation, the page, and the query's state.
- **Off `/deliveries`:** no fetch, and one line, "The illustration is taken of /deliveries only.", with a link to `/deliveries` that keeps the rest of the URL (`pageSearch`).
- **Loading:** a `role="status"` line, "Taking the picture of /deliveries on desktop…", and a `Skeleton` in the picture's shape. That is 16:9 on desktop, and the Pixel 7 viewport ratio on mobile.
- **Loaded or stored:** a `<figure>` with an `<img>` fitted to the stage (`object-contain`, never cropped, never scaled up past 1:1), and a `<figcaption>` of two plain sentences:
  - With emulation: "Chrome's blurredVision emulation on desktop: an illustration, not decision. The filter's thresholds decide what reaches the model, and this picture does not follow the sliders."
  - With none: "No vision emulation, the plain page on mobile: an illustration, not decision. …" and the same second sentence.
  - The `alt` names the page, the device and the emulation, for example "/deliveries on desktop under Chrome's blurredVision emulation".
- It sits on plain paper, not on a `measure` surface, because nothing in it is measured (DESIGN.md, "Measuring surfaces").

**Screen wiring:**
- In the Illustration view the stage renders `IllustrationStage` in place of `PerceivedPage`. The page picker, the title and the readout strip stay where they are, so the stage does not move when the view flips.
- In that view the stage's content depends on the picture query alone. Neither the measurement's "Measuring …" line and skeleton nor its "Live: <url> …" line renders, so a stored picture never sits under a "Live:" line. The readout strip's own skeletons already cover a pending measurement.
- The top-bar `SourceBadge` reports the picture: `live picture` or `stored picture`.
- A failed picture shows its own `Banner kind="stored"`: "The live picture is unavailable: <io's error>. Showing the stored picture of /deliveries on <device>, <emulation>, taken at the target app's default parameters." Its Try again refetches the picture.
- The measurement's banner keeps reporting the measurement, in every view.

**Data flow:**
- `persona` (URL) → `device`, `emulation` → `illustrationQuery` → io `/illustration` → `liveIllustration` → PNG → object URL → `<img>`.
- No value of the picture reaches `perceive`, the readout or the drawing. The picture never takes a threshold.

## Files

- `packages/io/src/routes/illustration.ts` (new): the route, its query and its cache.
- `packages/io/src/live-illustration.ts` (new): the capture under emulation.
- `packages/io/src/live-measure.ts`: `PageWork` gains `"picturing"`.
- `packages/io/src/app.ts`, `server.ts`, `test-app.ts`: wire the new option.
- `packages/io/src/illustration.test.ts` (new): the route with a fake `IllustrateFn`.
- `packages/io/src/illustration.browser.test.ts` (new): the live capture against the served target app.
- `packages/io/src/illustration-cli.ts` (new) and the `capture:illustrations` script in `packages/io/package.json`. This is the task's "capture script in `packages/io/scripts/`". It lives in `src/`, beside io's other CLIs, so that `pnpm typecheck` covers it: io's tsconfig includes `src` and root `*.ts` only.
- `packages/web/public/illustration/*.png` (new, four files): the stored pictures, written by the CLI.
- `packages/web/src/api/illustration.ts` and `illustration.test.ts` (new): the query, the stored path, and the fetch stub test.
- `packages/web/src/api/measure.ts`: exports `ioError`.
- `packages/web/src/preview/search.ts` and `search.test.ts`: the `illustration` key and `view`.
- `packages/web/src/preview/illustration.tsx` (new): the stage.
- `packages/web/src/preview/perceived-page.tsx`: only if its `evidence` prop needs to follow the `view` rename at the call site. The prop itself stays a boolean.
- `packages/web/src/screens/lens.tsx`, `lens.test.tsx` and `lens.browser.test.ts`: the third view, and the existing two-option assertions updated.
- `packages/web/src/preview/stored-illustrations.test.ts` (new): every fixture persona's pair has a stored PNG.
- `packages/web/scripts/self-check.ts` and its browser test: a response may be PNG bytes, and a `lens-illustration` entry checks the view's text against the floors. It is outside the task's list because the new text must meet the floors (DESIGN.md, "Checked by").

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| io test against the running target app: `blurredVision` PNG bytes differ from `none`; a second request for one pair is served from the cache | `illustration.browser.test.ts`: two requests through `createApp` with `liveIllustration` on a served target app; the bytes differ and are PNG (magic bytes); a counting wrapper around the live `IllustrateFn` shows one capture for two requests of one pair. `illustration.test.ts` also covers the cache, the rejected-promise drop, 400 and 502 with a fake |
| A web test renders `/lens` for Vera in the illustration view: the picture for `desktop` and `blurredVision`, the words "illustration, not decision", no drawn element | `lens.test.tsx`: `?persona=prof_vera&illustration=true` with the illustration query seeded; the `img` src is the seeded URL, the alt names desktop and blurredVision, the caption holds "illustration, not decision", and `drawnBoxes(html)` is empty |
| A web test with a fetch spy: moving a slider in the illustration view requests no picture | `lens.browser.test.ts`: the spied page at Vera's illustration view, with `/api/illustration` answered with a PNG. The picture is fetched once, slider presses add no fetch and no request, and a persona switch to Zoya then fetches her picture, which proves the spy sees picture fetches |
| With io stopped, the illustration view shows the stored picture and the banner | `lens.test.tsx`: the measurement (`failedClient`) and the illustration query failed; the `img` src is `/illustration/desktop-blurredVision.png`, and the picture's stored banner names its failure under the measurement's. By hand: `pnpm dev` with io down |
| A link with `evidence=true` still opens the evidence view | `lens.test.tsx` and `search.test.ts`: `evidence=true` alone, and `evidence=true&illustration=true`, resolve to the evidence view |
| With `pnpm dev`: blurred `/deliveries` for Vera, low-contrast for Zoya, unemulated for Ada, labelled (screenshots in the PR) | By hand at 1280 × 720, screenshots on the PR from an assets branch |
| (design) the stage claims only the picture's source | `lens.browser.test.ts`: Illustration view with a live measurement and a failed picture shows the stored picture, "stored picture", and no "Live:" line |
| (design) the view's text meets the floors | `pnpm --filter @wayford/web check:self` lists `lens-illustration` with 0 shortfalls in Daylight and Night |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` pass | the commands |

## Decision log

| Question | Taken | Why |
|---|---|---|
| The task says "the preview" and `screens/preview.tsx` | Build on the Lens, `screens/lens.tsx`, route `/lens` | s3-11 renamed the screen. The task's acceptance already says `/lens`. The Outcome records the stale paths |
| ADR 0002 cut "a third 'real page' view in the Lens" | Build the Illustration view as the task says, `none` personas included | The view is F2 AC4's emulated screenshot, labelled as an illustration and fixed to the persona. It is not the free real-page view the ADR cut, and the s3-11 spec names the two apart ("the illustration view (`s3-06`), and any real-page view"). The task requires the plain page for `none`, labelled and not hidden |
| How the URL holds a third view | A second key, `illustration=true`, beside `evidence=true`, which wins when both are set | `evidence=true` must keep its meaning. One more literal key keeps `PreviewSearch`'s pattern; a `view=` enum would rename an existing link |
| What the view shows off `/deliveries` | No picture, one line saying the illustration is of `/deliveries` only, and a link there | The task scopes the picture to `/deliveries`. Showing `/deliveries` under an `/account` title would contradict the page picker |
| How web fetches the picture | `fetch` → blob → object URL through a TanStack query, enabled only in the view | The acceptance needs a fetch spy to see it, and an `<img src>` load is invisible to a spy. The query also gives the failed state the fallback needs, testable statically as `failedClient` is |
| Object URLs are never revoked | Kept for the page's life, as the query's cache is | At most one per fixture pair (four). Revoking them would need an effect for no gain |
| Which source the top-bar badge reports in the Illustration view | The picture's: "live picture" or "stored picture" | DESIGN Principle 6: the badge is taken from the screen's data, and in this view the stage's data is the picture |
| The measurement's banner in the Illustration view | Kept, in every view | It reports the readout strip's data, which stays under the stage. Each banner reports its own data |
| The readout strip in the Illustration view | Stays | The stage keeps its place when the view flips (1280 × 720, no scroll). The caption says the picture does not follow the sliders, which the strip then shows |
| The picture's surface | Plain paper, not the `measure` dot grid | DESIGN: measuring surfaces only where something is measured |
| `tablet` | Refused with a 400, as `/measure` refuses it | No persona uses it (`MeasureDevice`) |
| Emulations no fixture persona uses (for example `protanopia`) | Accepted by the route, with no stored PNG | The route follows core's `VisionDeficiency`. Only the fixture personas reach the Lens, since the profile builder is cut, so the four stored PNGs cover every fallback, and a test pins that |
| Where the capture script lives | `packages/io/src/illustration-cli.ts`, script `capture:illustrations` | io's CLIs live in `src/` (`sweep-cli.ts`, `analyse.ts`), and `pnpm typecheck` covers only `src` there. `packages/io/scripts/` does not exist |
| One screenshot or a full page | The viewport, `scale: "css"` | It is what a run's step screenshot is (s2-02), so the illustration matches the evidence a run stores |
| An entry in `check:self` for the view | Yes, `lens-illustration` at `/lens?illustration=true`, answering `/illustration` with a stored PNG and with no `exclude` | `[data-lens-stage]` marks only `PerceivedPage`'s frame, which the view does not render, so the caption, the status lines and the picture's banner would otherwise go unchecked against the floors. A response may now be bytes, answered as `image/png` (about 3 lines in `self-check.ts`) |
| The deadline for one capture | An own constant, `ILLUSTRATE_TIMEOUT_MS = 15_000`, in `live-illustration.ts` | `MEASURE_TIMEOUT_MS` is private to `live-measure.ts`. One page load plus one screenshot is the same order of work as a measurement |

## Risks

- The emulation may need a frame after it is set before the screenshot shows it. The browser test's byte comparison catches that. The fix is one `requestAnimationFrame` wait in the page.
- PNG sizes. Four viewport PNGs should be well under 1 MB together. The PR states their sizes.
- The existing Lens tests assert a two-option View control and exact persona-link hrefs, so they change with the new key. Each changed assertion is updated, not loosened.

## Review note

One round of the spec review: ready after fixes, with no blocking finding. Every finding was taken.

- **should, check:self:** the first draft left the view out on a false premise. `[data-lens-stage]` marks only `PerceivedPage`'s frame. The view now has its own entry, and a response may be PNG bytes.
- **should, stage states:** in the Illustration view the stage depends on the picture alone. No "Measuring" or "Live:" line from the measurement shows there, and a test pins it.
- **nit, content type:** an ok response that is not `image/png` is refused.
- **nit, deadline and barrel:** the capture has its own deadline constant, stays out of io's barrel, and joins `server.ts`'s list of the modules that load Playwright.
- **nit, CLI close:** the CLI closes its browser and the target app as `sweep-cli.ts` does.
- **nit, emulation order:** the wording no longer says the emulation is applied "as s2-02 applies it". The order differs, and the browser test covers it.
