/**
 * The preview screen, the demo's hero: a persona's perception thresholds on the left, a target-app
 * page as `perceive` returns it for them on the right. The URL holds every control
 * (`src/preview/search.ts`), so a preview is a link, and every render perceives the page again
 * from it. The screen decides nothing about an element: it draws what `perceive` returns, the same
 * function the Actor's observation comes from (`docs/PLAN.md` F2 AC3).
 *
 * The page is measured live by io, on the persona's device, once per device and page (s3-05). A
 * slider move changes neither, so it never asks io again: it only perceives the measurement it
 * has once more. With io or the target app down, the screen draws the stored measurement under a
 * banner that says so (F2 AC5).
 *
 * Function first: week 4's design pass decides the look (`docs/PLAN.md` "UI"). Until then the one
 * accent is the persona colour, set once as `--persona` on the screen's root.
 */
import { useQuery } from "@tanstack/react-query";
import { createRoute, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { METRIC_NAMES, type MetricName, type PageMeasurement } from "@wayford/core";
import { perceive } from "@wayford/filter/perceive";
import { cn } from "cn";
import { useEffect, useRef } from "react";
import { Button } from "#components/ui/button";
import { measurementQuery } from "../api/measure.js";
import { Avatar } from "../avatar/avatar.js";
import { personaColour } from "../avatar/parts.js";
import { bundledMeasurement, bundledProfiles } from "../bundled-fixtures.js";
import { PerceivedPage } from "../preview/perceived-page.js";
import {
  CUT_SLIDERS,
  isOff,
  PREVIEW_PAGES,
  type PreviewPage,
  PreviewSearch,
  type PreviewState,
  pageSearch,
  personaSearch,
  resolvePreview,
  SEED_SLIDER,
  SOFTNESS_SLIDER,
  softnessKey,
} from "../preview/search.js";
import { SearchSlider } from "../preview/search-slider.js";
import { rootRoute } from "../shell.js";

/** A search param a slider writes: a threshold, its softness, or the seed. */
type SliderKey = MetricName | ReturnType<typeof softnessKey> | "seed";

/** Slider values on their way to the URL. */
type SliderPatch = Partial<Record<SliderKey, number>>;

/** Each metric's slider label and readout unit. Its softness slider adds "softness". */
const METRIC: Record<MetricName, { label: string; unit: string }> = {
  contrast: { label: "Contrast", unit: ":1" },
  fontPx: { label: "Font size", unit: " px" },
  targetPx: { label: "Target size", unit: " px" },
};

/** The id of the page's title, which names the stage. */
const PAGE_TITLE_ID = "preview-page-title";

/** What the fallback banner says the stored page is: `/deliveries` on desktop, 1280 × 720. */
const STORED_PAGE = (() => {
  const { width, height, isMobile } = bundledMeasurement.viewport;
  const path = new URL(bundledMeasurement.url).pathname;
  const device = isMobile ? "mobile" : "desktop";
  return `the stored ${path}, measured on ${device} at the target app's default parameters (${width} × ${height})`;
})();

/** One segment of a segmented control, the persona switcher's or the View control's. */
const SEGMENT =
  "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium";

/** The active segment, raised. Its ring is the persona colour in the switcher. */
const ACTIVE_SEGMENT = "bg-background text-foreground shadow-sm ring-1";
const IDLE_SEGMENT = "text-muted-foreground hover:text-foreground";

// ---------------------------------------------------------------------------
// Redraw timing, dev only
// ---------------------------------------------------------------------------

const INPUT_MARK = "wayford:preview-input";
const REDRAW_MEASURE = "wayford:preview-redraw";

/**
 * Mark a slider input, unless one is pending: a drag's inputs coalesce into fewer redraws, and the
 * mark from the first of them gives the worst latency.
 */
function markInput(): void {
  if (!import.meta.env.DEV) return;
  if (performance.getEntriesByName(INPUT_MARK, "mark").length > 0) return;
  performance.mark(INPUT_MARK);
}

/** Drop a pending input mark: a write that commits nothing has no redraw to end its timing. */
function clearInputMark(): void {
  if (import.meta.env.DEV) performance.clearMarks(INPUT_MARK);
}

/**
 * After each commit, log the time from the pending input mark to it (task box 4). A commit with no
 * mark pending, as on mount, after a persona link, the View control or Back, returns at once:
 * `performance.measure` throws for a start mark that does not exist. A static render runs no
 * effect, so the tests log nothing.
 */
function useRedrawTiming(): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (performance.getEntriesByName(INPUT_MARK, "mark").length === 0) return;
    const { duration } = performance.measure(REDRAW_MEASURE, INPUT_MARK);
    performance.clearMarks(INPUT_MARK);
    performance.clearMeasures(REDRAW_MEASURE);
    console.info(`preview redraw ${duration.toFixed(1)} ms`);
  });
}

// ---------------------------------------------------------------------------
// Writing the URL
// ---------------------------------------------------------------------------

/**
 * How often a drag may write the URL. Each write is a `history.replaceState`, which browsers cap:
 * Safari throws after 100 in 10 s and Chrome drops writes past 200, while a drag fires an input
 * per frame. One write per 150 ms stays far under both. The slider shows the value it was moved
 * to in between, and the redraw follows each write.
 */
const WRITE_EVERY_MS = 150;

type Navigate = ReturnType<typeof previewRoute.useNavigate>;

/**
 * The history entry the URL is on, as TanStack numbers it in each entry's state: a replace keeps
 * it, and a push, Back or Forward moves to another one.
 */
function useHistoryEntry(): number {
  return useRouterState({ select: (state) => state.location.state.__TSR_index });
}

/**
 * A slider's values, batched into one URL write per `WRITE_EVERY_MS`: the first move after a quiet
 * spell at once, the rest of a drag in batches, its last value always, and whatever is queued as
 * soon as the slider loses focus, before the click that took it lands. Each write replaces the
 * history entry, so a drag is one step of Back. A batch belongs to the entry it was moved on and
 * never lands on another one, as after Back, Forward or a persona link, which it would rewrite.
 */
function useSliderWrites(navigate: Navigate) {
  const router = useRouter();
  const batch = useRef<{ entry: number; patch: SliderPatch } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastWrite = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => () => clearTimeout(timer.current), []);
  const entryNow = () => router.history.location.state.__TSR_index;

  function write() {
    clearTimeout(timer.current);
    timer.current = undefined;
    const queued = batch.current;
    batch.current = null;
    if (queued === null) return;
    // A batch the URL already holds commits nothing, so no redraw would end its timing mark.
    const current: Record<string, unknown> = router.state.location.search;
    const changes = Object.entries(queued.patch).some(([key, value]) => current[key] !== value);
    if (queued.entry !== entryNow() || !changes) {
      clearInputMark();
      return;
    }
    lastWrite.current = performance.now();
    void navigate({
      search: (prev) => ({ ...prev, ...queued.patch }),
      replace: true,
      resetScroll: false,
    });
  }

  function move(key: SliderKey, value: number) {
    markInput();
    const entry = entryNow();
    const patch: SliderPatch = batch.current?.entry === entry ? batch.current.patch : {};
    patch[key] = value;
    batch.current = { entry, patch };
    if (timer.current !== undefined) return;
    timer.current = setTimeout(
      write,
      Math.max(0, lastWrite.current + WRITE_EVERY_MS - performance.now()),
    );
  }

  return { move, release: write };
}

// ---------------------------------------------------------------------------
// The control panel
// ---------------------------------------------------------------------------

/** The current persona: its name and description. */
function PersonaBlock({ state }: { state: PreviewState }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h2 className="text-2xl font-bold tracking-tight">{state.persona.label}</h2>
      <p className="line-clamp-2 text-sm text-muted-foreground">{state.persona.description}</p>
    </div>
  );
}

/**
 * One link per persona, to this preview for that persona on the same seed and view. A switch is a
 * navigation, so Back returns to the persona before. The current persona's link goes to its own
 * values, so once a slider has moved them it is the way back. Every persona gets one column of a
 * single row, so a fifth persona still fits the panel's width.
 *
 * The current link is the resolved persona, which the rest of the screen shows too, so a URL that
 * names none still marks Vera. TanStack marks a link current only when its search is in the URL,
 * and where it does, it is this one.
 */
function PersonaSwitcher({ state }: { state: PreviewState }) {
  return (
    <nav aria-label="Persona">
      <ul className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted/50 p-1">
        {bundledProfiles.map((profile) => {
          const isCurrent = profile.id === state.persona.id;
          return (
            <li key={profile.id} className="min-w-0">
              <Link
                to="/preview"
                search={personaSearch(state, profile.id)}
                resetScroll={false}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  SEGMENT,
                  "flex-col gap-1 py-2",
                  isCurrent ? cn(ACTIVE_SEGMENT, "ring-(--persona)") : IDLE_SEGMENT,
                )}
              >
                <span aria-hidden="true">
                  <Avatar profile={profile} className="size-6" />
                </span>
                <span className="max-w-full truncate">{profile.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * One metric's two sliders: the threshold, whose lowest position switches it off, and under it its
 * softness, which changes nothing while the threshold is off and so is disabled then.
 */
function MetricSliders({
  metric,
  state,
  onMove,
  onRelease,
}: {
  metric: MetricName;
  state: PreviewState;
  onMove: (key: SliderKey, value: number) => void;
  onRelease: () => void;
}) {
  const { off, max, step } = CUT_SLIDERS[metric];
  const { label, unit } = METRIC[metric];
  const cut = state.cuts[metric];
  const key = softnessKey(metric);
  return (
    <div className="flex flex-col gap-2.5">
      <SearchSlider
        id={`preview-${metric}`}
        label={label}
        value={cut.threshold}
        min={off}
        max={max}
        step={step}
        // The lowest position does not gate, so it reads `off`, not `1:1` or `0 px`.
        format={(value) => (isOff(metric, value) ? "off" : `${value}${unit}`)}
        onMove={(next) => onMove(metric, next)}
        onRelease={onRelease}
      />
      <SearchSlider
        id={`preview-${key}`}
        label={`${label} softness`}
        sub
        value={cut.softness}
        min={SOFTNESS_SLIDER.min}
        max={SOFTNESS_SLIDER.max}
        step={SOFTNESS_SLIDER.step}
        format={String}
        disabled={state.profile.perception[metric] === undefined}
        onMove={(next) => onMove(key, next)}
        onRelease={onRelease}
      />
    </div>
  );
}

/** The input side: the persona, the persona control, then every slider. */
function ControlPanel({
  state,
  onMove,
  onRelease,
}: {
  state: PreviewState;
  onMove: (key: SliderKey, value: number) => void;
  onRelease: () => void;
}) {
  // Every slider is keyed by the history entry, so Back, Forward and a persona link start each one
  // afresh: a value it was moving to belongs to the entry it was moved on. Its own writes replace
  // the entry and keep it, so a drag never remounts it.
  const entry = useHistoryEntry();
  return (
    <section
      aria-label="Controls"
      className="flex flex-col gap-6 rounded-xl border bg-card p-5 text-card-foreground lg:sticky lg:top-6 lg:self-start"
    >
      <PersonaBlock state={state} />
      <PersonaSwitcher state={state} />
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold">Thresholds</h3>
        {METRIC_NAMES.map((metric) => (
          <MetricSliders
            key={`${entry}:${metric}`}
            metric={metric}
            state={state}
            onMove={onMove}
            onRelease={onRelease}
          />
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        <h3 className="text-sm font-semibold">Seed</h3>
        <SearchSlider
          key={entry}
          id="preview-seed"
          label="Seed"
          value={state.seed}
          min={SEED_SLIDER.min}
          max={SEED_SLIDER.max}
          step={SEED_SLIDER.step}
          format={String}
          onMove={(next) => onMove("seed", next)}
          onRelease={onRelease}
        />
        <p className="text-xs text-muted-foreground">
          Stands in for a run seed. The profile seed only draws the avatar.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

const VIEWS = [
  { label: "Perceived", evidence: false },
  { label: "Evidence", evidence: true },
] as const;

/**
 * Which view the stage draws: the page as perceived, or the evidence view, which outlines what
 * perception removed. A view is a mode, not a place, so it is a pair of toggle buttons, grouped by
 * the native group element, a `fieldset`, rather than a `div` given the role.
 */
function ViewControl({
  evidence,
  onChange,
}: {
  evidence: boolean;
  onChange: (evidence: boolean) => void;
}) {
  return (
    <fieldset aria-label="View" className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
      {VIEWS.map((view) => {
        const pressed = view.evidence === evidence;
        return (
          <button
            key={view.label}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(view.evidence)}
            className={cn(SEGMENT, "px-3", pressed ? ACTIVE_SEGMENT : IDLE_SEGMENT)}
          >
            {view.label}
          </button>
        );
      })}
    </fieldset>
  );
}

/**
 * One link per preview page, to this preview on that page, with persona, seed, sliders and view
 * as they are. A page is a place, so it is a link and Back returns to the page before, as for the
 * persona switcher.
 *
 * TanStack marks a link current when its search is part of the URL's, so the `/deliveries` link,
 * which leaves `page` out, would read as current on every page. `explicitUndefined` makes a key the
 * link leaves out one the URL must not have, so only the current page's link is marked.
 */
function PagePicker({ search, current }: { search: PreviewSearch; current: PreviewPage }) {
  return (
    <nav aria-label="Page">
      <ul className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1">
        {PREVIEW_PAGES.map((page) => {
          const isCurrent = page === current;
          return (
            <li key={page}>
              <Link
                to="/preview"
                search={pageSearch(search, page)}
                activeOptions={{ explicitUndefined: true }}
                resetScroll={false}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(SEGMENT, "px-3 font-mono", isCurrent ? ACTIVE_SEGMENT : IDLE_SEGMENT)}
              >
                {page}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The banner over the stored page: the live page is unavailable, why, and a way to ask io again.
 * Asking again puts the query back to pending, so the stage shows its "Measuring" line until io
 * answers.
 */
function StoredBanner({ failure, retry }: { failure: string; retry: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-t-2 border-t-(--persona) bg-muted/50 px-4 py-3 text-sm"
    >
      <p className="min-w-0 flex-1">
        {`The live page is unavailable: ${failure}. Showing ${STORED_PAGE}.`}
      </p>
      <Button variant="outline" size="sm" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export function PreviewScreen() {
  const navigate = previewRoute.useNavigate();
  const search = previewRoute.useSearch();
  const state = resolvePreview(search);
  // Keyed by the persona's device and the page alone, and never stale, so a slider move finds it
  // in the cache and asks io nothing (`src/api/measure.ts`).
  const device = state.persona.device;
  const live = useQuery(measurementQuery(device, state.page));
  // Perceived again on every render, with no memo: a render follows a URL change, and `perceive`
  // on a page stays far inside its 5 ms budget (`bench:perceive`). It gets the whole persona, so
  // the caps and unknown patterns a run applies apply here too (F2 AC3).
  const perceived = (measurement: PageMeasurement) =>
    perceive(measurement, state.profile, state.seed);
  // What the stage draws: the live page, or the stored one, with why, once the live one failed.
  // While it loads, nothing: the stored `/deliveries` drawn under another page's name would be the
  // wrong page.
  const stage =
    live.data !== undefined
      ? { observation: perceived(live.data), failure: undefined }
      : live.isError
        ? { observation: perceived(bundledMeasurement), failure: live.error.message }
        : undefined;
  // Who the page was perceived for. "thresholds edited" whenever a slider moved them, so a moved
  // bundle is never presented as the persona.
  const subject = `${state.persona.label}${state.edited ? ", thresholds edited" : ""}, seed ${state.seed}`;
  const { move, release } = useSliderWrites(navigate);
  useRedrawTiming();

  // The View control replaces the history entry, as a slider does; a persona link pushes one.
  function showEvidence(evidence: boolean) {
    void navigate({
      search: (prev) => ({ ...prev, evidence: evidence ? true : undefined }),
      replace: true,
      resetScroll: false,
    });
  }

  return (
    <div
      className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-6"
      style={{ "--persona": personaColour(state.persona) }}
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Preview</h1>
        <p className="text-sm text-muted-foreground">
          A target-app page as perceive returns it. Every slider move runs the same filter the Actor
          uses, here in the browser.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <ControlPanel state={state} onMove={move} onRelease={release} />
        <section aria-labelledby={PAGE_TITLE_ID} className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PagePicker search={search} current={state.page} />
            <ViewControl evidence={state.evidence} onChange={showEvidence} />
          </div>
          <h2 id={PAGE_TITLE_ID} className="font-medium">
            {stage?.observation.title ?? state.page}
          </h2>
          {stage === undefined ? (
            <p role="status" className="text-sm text-muted-foreground">
              {`Measuring ${state.page} on the target app, on ${device}…`}
            </p>
          ) : (
            <>
              {stage.failure === undefined ? (
                <p className="font-mono text-xs text-muted-foreground">
                  {`Live: ${stage.observation.url} on ${device}, at the target app's default parameters.`}
                </p>
              ) : (
                <StoredBanner failure={stage.failure} retry={() => void live.refetch()} />
              )}
              {/* At most the measured viewport's width, so a phone's page is drawn at a phone's
                  width rather than stretched across the pane. */}
              <div className="w-full" style={{ maxWidth: `${stage.observation.viewport.width}px` }}>
                <PerceivedPage
                  observation={stage.observation}
                  evidence={state.evidence}
                  subject={subject}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export const previewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/preview",
  // A zod schema is a Standard Schema, which TanStack validates with directly. Every key is
  // optional, so a link may leave out any of them.
  validateSearch: PreviewSearch,
  component: PreviewScreen,
});
