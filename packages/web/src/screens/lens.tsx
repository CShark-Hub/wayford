/**
 * The Lens, the demo's hero: a persona's perception thresholds on the rail, a target-app page as
 * `perceive` returns it for them on the stage. The URL holds every control
 * (`src/preview/search.ts`), so a Lens is a link, and every render perceives the page again from
 * it. The screen decides nothing about an element: it draws what `perceive` returns, the same
 * function the Actor's observation comes from (`docs/PLAN.md` F2 AC3).
 *
 * The page is measured live by io, on the persona's device, once per device and page (s3-05). A
 * slider move changes neither, so it never asks io again: it only perceives the measurement it
 * has once more. With io or the target app down, the screen draws the stored measurement under a
 * banner that says so (F2 AC5).
 *
 * Under the drawn page, a strip reads the observation's counts and the rules that fired, beside a
 * card with axe-core's scan of the page from io (s4-06), the same for every persona and device.
 *
 * A third view, Illustration (s3-06), puts io's picture of `/deliveries` under the persona's
 * Chrome vision emulation on the stage in place of the drawing (`src/preview/illustration.tsx`).
 * The picture follows the persona, never a slider.
 *
 * Any page opens by its whole URL too (s3-16): a `url=` link, or the URL form, which a button in the
 * header row shows under it (#224).
 * Such a page is off the target app, whatever its host, since the link decides
 * (`docs/adr/0003-any-target.md`, D2): `perceive` gets no jargon list, the copy names the URL and
 * never the target app's parameters, and a failed measurement draws no page at all, since the
 * stored `/deliveries` would be the wrong site.
 *
 * The look is `docs/design/screens/lens.html` (s3-11): the rail and the stage fit 1280 × 720 with
 * no scroll, and the rail sets the persona's slot, `--p`, which its gauges and sliders fill with.
 */
import { useQuery } from "@tanstack/react-query";
import { createRoute, Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  type FullObservation,
  METRIC_NAMES,
  type MetricName,
  type PageMeasurement,
  type RuleId,
  Seed,
} from "@wayford/core";
import { perceive } from "@wayford/filter/perceive";
import { cn } from "cn";
import { Link2, Minus, Plus, ScanLine, ZoomIn } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Banner } from "#components/banner";
import { type Look, RULE_WORDS, RuleTag, StateSwatch } from "#components/filter-states";
import { PersonaAvatar } from "#components/persona-avatar";
import { SEGMENT_GROUP, SegmentedControl, segmentItem } from "#components/segmented-control";
import { Skeleton } from "#components/skeleton";
import { ProvenanceTag, Tag } from "#components/tag";
import {
  RANGE_HOST,
  ThresholdGauge,
  TRANSPARENT_RANGE,
  useHeldRange,
} from "#components/threshold-gauge";
import { Button } from "#components/ui/button";
import { axeQuery } from "../api/axe.js";
import { illustrationQuery } from "../api/illustration.js";
import { measurementQuery } from "../api/measure.js";
import { slotOf, slotStyle } from "../avatar/slots.js";
import { bundledJargon, bundledMeasurement, bundledProfiles } from "../bundled-fixtures.js";
import { ILLUSTRATED_PAGE, IllustrationStage } from "../preview/illustration.js";
import {
  looksOf,
  MEASURING_SURFACE,
  PerceivedPage,
  type Scroll,
} from "../preview/perceived-page.js";
import {
  CUT_SLIDERS,
  isOff,
  LensUrl,
  type LensView,
  PREVIEW_PAGES,
  PreviewSearch,
  type PreviewState,
  pageSearch,
  personaSearch,
  resolvePreview,
  SEED_SLIDER,
  softnessKey,
  urlSearch,
} from "../preview/search.js";
import { SearchSlider } from "../preview/search-slider.js";
import { rootRoute } from "../shell.js";

/** A search param a slider writes: a threshold, its softness, or the seed. */
type SliderKey = MetricName | ReturnType<typeof softnessKey> | "seed";

/** Slider values on their way to the URL. */
type SliderPatch = Partial<Record<SliderKey, number>>;

/**
 * Each metric's gauge: the perception rule it sets, its label and readout unit, and the ruler's
 * top and intervals, as `lens.html` draws them. The ruler starts at the metric's `off`. No persona
 * sets more than 7:1, 32 px or 56 px; the URL still takes values up to `CUT_SLIDERS`' maximum, and
 * such a value puts the post at the ruler's end and reads as itself.
 */
const GAUGES: Record<
  MetricName,
  { rule: RuleId; label: string; unit: string; max: number; ticks: number }
> = {
  contrast: { rule: "P1", label: "Contrast", unit: ":1", max: 7, ticks: 6 },
  fontPx: { rule: "P3", label: "Font size", unit: " px", max: 32, ticks: 8 },
  targetPx: { rule: "P4", label: "Target size", unit: " px", max: 56, ticks: 7 },
};

/**
 * `Seed`'s ends, a uint32's: the seed stepper's `−` and `+` stop there. Zod reads an end a schema
 * leaves open as `null`, which bounds nothing.
 */
const SEED_ENDS = {
  min: Seed.minValue ?? Number.NEGATIVE_INFINITY,
  max: Seed.maxValue ?? Number.POSITIVE_INFINITY,
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

type Navigate = ReturnType<typeof lensRoute.useNavigate>;

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
// The rail
// ---------------------------------------------------------------------------

/**
 * One link per persona, to this Lens for that persona on the same seed, view and page: its avatar,
 * with its name for screen readers. A switch is a navigation, so Back returns to the persona
 * before. The current persona's link goes to its own values, so once a slider has moved them it is
 * the way back. Each link sets its persona's slot, so the current one's ring is its own colour.
 *
 * The current link is the resolved persona, which the rest of the screen shows too, so a URL that
 * names none still marks Vera. TanStack marks a link current only when its search is in the URL,
 * and where it does, it is this one.
 */
function PersonaLinks({ state }: { state: PreviewState }) {
  return (
    <nav aria-label="Persona">
      <ul className="flex justify-between">
        {bundledProfiles.map((profile) => {
          const isCurrent = profile.id === state.persona.id;
          return (
            <li key={profile.id}>
              <Link
                to="/lens"
                search={personaSearch(state, profile.id)}
                resetScroll={false}
                aria-current={isCurrent ? "page" : undefined}
                className="block rounded-lg aria-[current=page]:ring-2 aria-[current=page]:ring-(--p) aria-[current=page]:ring-offset-2 aria-[current=page]:ring-offset-paper"
                style={slotStyle(slotOf(profile.id))}
              >
                <span aria-hidden="true" className="block">
                  <PersonaAvatar profile={profile} className="size-12" />
                </span>
                <span className="sr-only">{profile.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * One metric's gauge, its softness row under it. The threshold's lowest position switches it off;
 * the softness changes nothing while it is off, and is disabled then. The provenance tag is the
 * threshold's that `perceive` gets, so a moved one reads `folk · no source`, as `resolvePreview`
 * sets it, and an off one shows none. `was` is the persona's own threshold, given only once the
 * slider has moved off it.
 */
function MetricGauge({
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
  const { off, step } = CUT_SLIDERS[metric];
  const { rule, label, unit, max, ticks } = GAUGES[metric];
  const cut = state.cuts[metric];
  const key = softnessKey(metric);
  const own = state.persona.perception[metric]?.threshold ?? off;
  // The threshold `perceive` gets, absent while the gauge is off: this metric gates when it is set.
  const gating = state.profile.perception[metric];
  return (
    <ThresholdGauge
      id={`preview-${metric}`}
      label={label}
      value={cut.threshold}
      min={off}
      max={max}
      step={step}
      ticks={ticks}
      softness={cut.softness}
      // The lowest position does not gate, so it reads `off`, not `1:1` or `0 px`.
      format={(value) => (isOff(metric, value) ? "off" : `${value}${unit}`)}
      {...(own === cut.threshold ? {} : { was: own })}
      tags={
        <>
          <Tag variant="rule">{rule}</Tag>
          {gating === undefined ? null : <ProvenanceTag provenance={gating.provenance} />}
        </>
      }
      onMove={(next) => onMove(metric, next)}
      onRelease={onRelease}
    >
      <SearchSlider
        id={`preview-${key}`}
        metricLabel={label}
        value={cut.softness}
        disabled={gating === undefined}
        onMove={(next) => onMove(key, next)}
        onRelease={onRelease}
      />
    </ThresholdGauge>
  );
}

/**
 * The seed, as a stepper: `−` and `+`, and between them a box that reads `seed 1` over a native
 * range input, transparent, which pointer, keyboard and screen reader use. A step is one move and
 * its release, so a click is one replace write, as a slider's keypress is. A seed past the slider's
 * end, such as a run's, puts its thumb at the end and reads as itself.
 */
function SeedStepper({
  seed,
  onMove,
  onRelease,
}: {
  seed: number;
  onMove: (key: SliderKey, value: number) => void;
  onRelease: () => void;
}) {
  const { readout, input } = useHeldRange({
    value: seed,
    format: String,
    onMove: (next) => onMove("seed", next),
    onRelease,
  });
  function step(next: number) {
    onMove("seed", next);
    onRelease();
  }
  return (
    <div className="mt-auto flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon"
        aria-label="Previous seed"
        disabled={seed <= SEED_ENDS.min}
        onClick={() => step(seed - 1)}
      >
        <Minus aria-hidden="true" strokeWidth={1.75} />
      </Button>
      <div
        title="Stands in for a run seed. The profile seed only draws the avatar."
        className={cn(
          RANGE_HOST,
          "flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-sm border border-line-strong bg-surface",
        )}
      >
        <label htmlFor="preview-seed" className="mono-label font-normal text-ink-3 lowercase">
          Seed
        </label>
        <output htmlFor="preview-seed" aria-live="off" className="mono-label text-ink">
          {readout}
        </output>
        <input
          type="range"
          className={TRANSPARENT_RANGE}
          id="preview-seed"
          min={SEED_SLIDER.min}
          max={SEED_SLIDER.max}
          step={SEED_SLIDER.step}
          {...input}
        />
      </div>
      <Button
        variant="outline"
        size="icon"
        aria-label="Next seed"
        disabled={seed >= SEED_ENDS.max}
        onClick={() => step(seed + 1)}
      >
        <Plus aria-hidden="true" strokeWidth={1.75} />
      </Button>
    </div>
  );
}

/** The input side: the persona links, the persona, a gauge per metric, then the seed. */
function Rail({
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
  // Spaced to fit 1280 × 720 with every threshold moved: a moved gauge's "was" sits on its head
  // row, before the readout, and costs no line. The gauges sit 4 px apart, since each softness
  // row's 32 px already leave air round its slider, and the seed takes whatever is left above it.
  return (
    <aside
      className="flex min-h-0 flex-col border-e border-line p-4"
      style={slotStyle(slotOf(state.persona.id))}
    >
      <PersonaLinks state={state} />
      <div className="mt-2 grid gap-1">
        <h1 className="display-m text-ink">{state.persona.label}</h1>
        <p className="line-clamp-2 body text-ink-2">{state.persona.description}</p>
      </div>
      <div className="mt-3 grid gap-1">
        {METRIC_NAMES.map((metric) => (
          <MetricGauge
            key={`${entry}:${metric}`}
            metric={metric}
            state={state}
            onMove={onMove}
            onRelease={onRelease}
          />
        ))}
      </div>
      <SeedStepper key={`${entry}:seed`} seed={state.seed} onMove={onMove} onRelease={onRelease} />
    </aside>
  );
}

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

const VIEWS: readonly { value: LensView; label: string }[] = [
  { value: "perceived", label: "Perceived" },
  { value: "evidence", label: "Evidence" },
  { value: "illustration", label: "Illustration" },
];

/**
 * What the stage holds, read once from the measurement's query: nothing yet while io measures, the
 * live page, the stored `/deliveries` with why once a target-app page failed, or, once a URL page
 * failed, only why. A URL page has no stored page to fall back on: the bundled `/deliveries` would
 * be the wrong site.
 */
export type Stage =
  | { kind: "measuring" }
  | { kind: "live"; observation: FullObservation }
  | { kind: "stored"; observation: FullObservation; failure: string }
  | { kind: "failed"; failure: string };

/**
 * One link per Lens page, to this Lens on that page, with persona, seed, sliders and view as they
 * are, drawn as a mono segmented control. A page is a place, so it is a link and Back returns to
 * the page before, as for the persona links.
 *
 * TanStack marks a link current when its search is part of the URL's, so the `/deliveries` link,
 * which leaves `page` out, would read as current on every page. `explicitUndefined` makes a key the
 * link sets to `undefined` one the URL must not have, so only the current page's link is marked.
 * `pageSearch` drops `url` rather than setting it so, and each link sets it here: on a URL page
 * (s3-16) no link is current, as `current`, a whole URL, matches none of them.
 */
function PagePicker({ search, current }: { search: PreviewSearch; current: string }) {
  return (
    <nav aria-label="Page" className="shrink-0">
      <ul className={SEGMENT_GROUP}>
        {PREVIEW_PAGES.map((page) => (
          <li key={page} className="flex">
            <Link
              to="/lens"
              search={{ ...pageSearch(search, page), url: undefined }}
              activeOptions={{ explicitUndefined: true }}
              resetScroll={false}
              aria-current={page === current ? "page" : undefined}
              className={segmentItem(true)}
            >
              {page}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** `n` and `noun`, plural unless `n` is 1: `1 violation`, `0 violations`. */
function counted(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * axe-core's scan of the page, as io stores it (s4-06). The scan is by page, not by run, so the
 * card reads the page alone, never the persona or the device. While io scans, a plain line says
 * so, not a status: the stage's one status line is its measurement's. A failed scan says axe did
 * not run and why, never a count, since no scan is not "no violations". Its note, from the screen,
 * says the scan is the page's alone, and the parameters it was opened at whenever no `Live:` line
 * above it names them (#224).
 */
function AxeCard({ page, note }: { page: string; note: string }) {
  const scan = useQuery(axeQuery(page));
  return (
    <section
      aria-label="axe-core"
      className="ms-auto flex min-w-0 gap-3 self-center rounded-md border border-line bg-surface px-4 py-3"
    >
      <ScanLine
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-ink-2"
        strokeWidth={1.75}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {scan.data !== undefined ? (
          <>
            <p className="body text-ink-2">
              {"axe-core, WCAG 2.2 A and AA: "}
              <span className="font-semibold text-ink">
                {counted(scan.data.violations.length, "violation")}
              </span>
            </p>
            {scan.data.violations.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {scan.data.violations.map((violation) => (
                  <li key={violation.ruleId}>
                    {/* Any axe rule id: one wider than the card breaks inside it (#269). */}
                    <Tag variant="plain" breaks>
                      {`${violation.ruleId}, ${counted(violation.nodes, "element")}`}
                    </Tag>
                  </li>
                ))}
              </ul>
            )}
            <p className="basis-full body text-ink-3">{note}</p>
          </>
        ) : scan.isError ? (
          <>
            {/* A long URL is cut short on its line, whole in its `title`, and io's message breaks
                anywhere, so neither widens the Lens (#245). */}
            <p className="min-w-0 basis-full truncate body text-ink" title={page}>
              {`axe did not run on ${page}`}
            </p>
            <p className="basis-full body text-ink-2 [overflow-wrap:anywhere]">
              {scan.error.message}
            </p>
          </>
        ) : (
          // Cut short, not wrapped: a wrapped line would grow the strip and shrink the page (#224).
          <p className="min-w-0 truncate body text-ink-2" title={page}>
            {`axe-core is scanning ${page}…`}
          </p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The readout strip
// ---------------------------------------------------------------------------

/**
 * The observation's elements by their look, as the stage draws them (`looksOf`). Read off the one
 * observation the screen has, never a second `perceive` call.
 */
export function lensCounts(observation: FullObservation): Record<Look, number> {
  const counts: Record<Look, number> = { visible: 0, degraded: 0, removed: 0 };
  for (const look of looksOf(observation)) counts[look] += 1;
  return counts;
}

/**
 * The rules that fired on the observation, each once, in `RULE_WORDS`' order, with the elements
 * each fired on. A rule fired on an element that carries its decision, whatever state it gave: a
 * K2 renames, a P1 may degrade, so the count is not of elements removed (#244). A knowledge rule
 * counts only on an element that reaches the model: the filter renames removed ones too, and a
 * rename nothing reads did nothing.
 */
export function rulesFired(observation: FullObservation): { rule: RuleId; count: number }[] {
  const counts = new Map<RuleId, number>();
  for (const element of observation.elements) {
    const decisions = element.decisions.filter(
      (d) => d.stage !== "knowledge" || element.state !== "invisible",
    );
    for (const rule of new Set(decisions.map((d) => d.rule))) {
      counts.set(rule, (counts.get(rule) ?? 0) + 1);
    }
  }
  return [...RULE_WORDS.keys()].flatMap((rule) => {
    const count = counts.get(rule);
    return count === undefined ? [] : [{ rule, count }];
  });
}

const COUNTED: readonly Look[] = ["visible", "degraded", "removed"];

/** The rules fired cell's rows for one, two, and three or more tags. */
const TAG_ROWS = ["grid-rows-1", "grid-rows-2", "grid-rows-3"] as const;

/**
 * Under the page: what it holds by state, the rules that fired, and the axe-core card. A
 * description list, so each number is read with its word. Each term and value is a paragraph or
 * a list item, the blocks the self-check measures. While the page is measured, skeletons. Once a
 * URL page failed, each count reads `—` and the rules `none`: nothing was measured, and a skeleton
 * would say it is still loading.
 */
function ReadoutStrip({ stage, page, axeNote }: { stage: Stage; page: string; axeNote: string }) {
  const observation =
    stage.kind === "live" || stage.kind === "stored" ? stage.observation : undefined;
  const failed = stage.kind === "failed";
  const counts = observation === undefined ? undefined : lensCounts(observation);
  const rules = failed ? [] : observation === undefined ? undefined : rulesFired(observation);
  return (
    // At least as tall as the rules cell with three rows of tags, 116 px: the cell is then the
    // tallest the strip can hold, so a slider move that fires a rule more or less never resizes the
    // strip, nor the page drawn above it (#224).
    <div className="flex min-h-29 min-w-0 items-stretch gap-6">
      <dl className="flex shrink-0 items-stretch">
        {COUNTED.map((state) => (
          <div key={state} className="grid content-center gap-1 pe-6">
            <dt>
              <p className="flex items-center gap-2 mono-label text-ink-3">
                <StateSwatch state={state} />
                {state}
              </p>
            </dt>
            <dd>
              {failed ? (
                <p className="readout text-ink-3">—</p>
              ) : counts === undefined ? (
                <Skeleton className="h-12 w-14" />
              ) : (
                <p className="readout text-ink">{counts[state]}</p>
              )}
            </dd>
          </div>
        ))}
        <div className="grid content-center gap-1.5 border-s border-line ps-6">
          <dt>
            <p className="mono-label text-ink-3">rules fired</p>
          </dt>
          <dd>
            {rules === undefined ? (
              <Skeleton className="h-6.5 w-28" />
            ) : rules.length === 0 ? (
              <p className="mono-label text-ink-3">none</p>
            ) : (
              // Up to three tags a column, column after column, so the cell stays narrow and leaves
              // the axe-core card its width. Three rows set the strip's floor.
              <ul
                className={cn(
                  "grid grid-flow-col justify-start justify-items-start gap-1.5",
                  TAG_ROWS[Math.min(rules.length, 3) - 1],
                )}
              >
                {rules.map(({ rule, count }) => (
                  <li key={rule}>
                    <RuleTag rule={rule} words count={count} />
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
      <AxeCard page={page} note={axeNote} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The URL form (s3-16)
// ---------------------------------------------------------------------------

/** The URL field's id, which its label names. */
const URL_FIELD_ID = "lens-url";

/** What the form says under its row when `LensUrl` refuses the value. */
const URL_REFUSED = "Enter a whole http(s) URL, such as https://example.com/";

/**
 * The search the URL form navigates to for the value typed, `raw`: `urlSearch` on it, read as
 * `LensUrl` reads a `url=` link, so the form opens exactly the page the link would. Undefined when
 * `LensUrl` refuses it, such as `example.com` with no scheme, or a `file:` URL: the form then
 * opens nothing.
 */
export function openedSearch(search: PreviewSearch, raw: string): PreviewSearch | undefined {
  const url = LensUrl.safeParse(raw);
  return url.success ? urlSearch(search, url.data) : undefined;
}

/** The URL row's id, which the button that shows it controls. */
const URL_ROW_ID = "lens-url-row";

/**
 * The URL form's row, a view of its props: a mono `url` label, the field, which fills the row, and
 * an outline Open button, with the one alert under the row once a value was refused. The field is
 * uncontrolled from `value`, and the screen unmounts it on a page change. The form is `noValidate`, so the
 * browser's own bubble for a `type="url"` field never stands in for the alert. `Escape` in the
 * field calls `onClose`.
 */
export function UrlForm({
  value,
  refused,
  onOpen,
  onClose,
  fieldRef,
}: {
  /** What the field holds at first: the current URL page's URL, or nothing on a target-app page. */
  value: string;
  /** Whether the last value submitted was refused, so the alert shows. */
  refused: boolean;
  /** Called with the field's value on submit. */
  onOpen: (raw: string) => void;
  /** Called on `Escape` in the field. */
  onClose: () => void;
  /** The field, for the screen to focus once it shows the row. */
  fieldRef?: Ref<HTMLInputElement>;
}) {
  const alertId = useId();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = new FormData(event.currentTarget).get("url");
    onOpen(typeof raw === "string" ? raw : "");
  }
  function closeOnEscape(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onClose();
  }
  return (
    <div id={URL_ROW_ID} className="grid gap-1">
      <form
        aria-label="Open a page by URL"
        noValidate
        onSubmit={submit}
        className="flex h-10 min-w-0 items-center gap-3"
      >
        <label htmlFor={URL_FIELD_ID} className="mono-label font-normal text-ink-3 lowercase">
          url
        </label>
        <input
          ref={fieldRef}
          id={URL_FIELD_ID}
          type="url"
          name="url"
          defaultValue={value}
          onKeyDown={closeOnEscape}
          spellCheck={false}
          autoComplete="url"
          aria-invalid={refused ? true : undefined}
          aria-describedby={refused ? alertId : undefined}
          className="h-(--control-h) min-w-0 flex-1 rounded-sm border border-line-strong bg-surface px-3 mono text-ink aria-invalid:border-fault"
        />
        <Button type="submit" variant="outline">
          Open
        </Button>
      </form>
      {refused ? (
        <p id={alertId} role="alert" className="body text-fault">
          {URL_REFUSED}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What the URL form does with the value submitted, `raw`: a value `LensUrl` takes navigates to
 * `openedSearch`, a push, so Back returns to the page before, and clears the alert; a refused one
 * shows the alert through `setRefused` and navigates nowhere.
 */
export function openUrl(
  search: PreviewSearch,
  raw: string,
  navigate: Navigate,
  setRefused: (refused: boolean) => void,
): void {
  const next = openedSearch(search, raw);
  setRefused(next === undefined);
  if (next !== undefined) void navigate({ search: next, resetScroll: false });
}

/**
 * The URL form on the screen, which opens a value by `openUrl`. It shows only once asked for, and
 * its field takes the focus then. A navigation to another page hides it, so the field and the alert
 * start afresh when it is shown again.
 */
function UrlRow({
  search,
  state,
  onClose,
}: {
  search: PreviewSearch;
  state: PreviewState;
  onClose: () => void;
}) {
  const navigate = lensRoute.useNavigate();
  const [refused, setRefused] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  // An accepted value closes the row as Escape does, so the focus goes back to its button rather
  // than falling to the body when the navigation unmounts the field.
  const open = (raw: string) =>
    openUrl(search, raw, navigate, (refused) => {
      setRefused(refused);
      if (!refused) onClose();
    });
  return (
    <UrlForm
      value={state.onTargetApp ? "" : state.page}
      refused={refused}
      onOpen={open}
      onClose={onClose}
      fieldRef={field}
    />
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export function LensScreen() {
  const navigate = lensRoute.useNavigate();
  const search = lensRoute.useSearch();
  const state = resolvePreview(search);
  // The page the URL row was shown on (#224): the row costs the stage its height only while it is
  // shown, which its button, Escape or an opened URL ends. A navigation to another page forgets it,
  // adjusted during render, so Back to the page it was shown on finds it hidden. A persona link or a
  // slider keeps the page, and the row with it.
  const [urlRowOn, setUrlRowOn] = useState<string | null>(null);
  if (urlRowOn !== null && urlRowOn !== state.page) setUrlRowOn(null);
  const urlRowShown = urlRowOn === state.page;
  // Keyed by the persona's device and the page alone, and never stale, so a slider move finds it
  // in the cache and asks io nothing (`src/api/measure.ts`).
  const device = state.persona.device;
  const live = useQuery(measurementQuery(device, state.page));
  // The picture follows the persona alone: keyed by the persona's device and emulation, which no
  // slider writes, and asked for only in the Illustration view on the target app's /deliveries, so
  // no other view, page or slider move asks io for one (`src/api/illustration.ts`).
  const emulation = state.persona.perception.emulation;
  const pictured = state.view === "illustration" && state.page === ILLUSTRATED_PAGE;
  const picture = useQuery({ ...illustrationQuery(device, emulation), enabled: pictured });
  // Perceived again on every render, with no memo: a render follows a URL change, and `perceive`
  // on a page stays far inside its 5 ms budget (`bench:perceive`). It gets the whole persona, so
  // the caps and unknown patterns a run applies apply here too (F2 AC3). On the target app it gets
  // the app's jargon list too, so K2 masks here what it masks in a run there; off it, by `url=`,
  // none, as a run off the target app gets none (ADR 0003, D3).
  const options = state.onTargetApp ? { jargon: bundledJargon } : {};
  const perceived = (measurement: PageMeasurement) =>
    perceive(measurement, state.profile, state.seed, options);
  // What the stage draws: the live page, or, once it failed, the stored `/deliveries` with why on
  // a target-app page, and only why on a URL page. While it loads, nothing: the stored
  // `/deliveries` drawn under another page's name would be the wrong page.
  const stage: Stage =
    live.data !== undefined
      ? { kind: "live", observation: perceived(live.data) }
      : !live.isError
        ? { kind: "measuring" }
        : state.onTargetApp
          ? {
              kind: "stored",
              observation: perceived(bundledMeasurement),
              failure: live.error.message,
            }
          : { kind: "failed", failure: live.error.message };
  // Who the page was perceived for. "thresholds edited" whenever a slider moved them, so a moved
  // bundle is never presented as the persona.
  const subject = `${state.persona.label}${state.edited ? ", thresholds edited" : ""}, seed ${state.seed}`;
  const { move, release } = useSliderWrites(navigate);
  useRedrawTiming();
  const urlToggle = useRef<HTMLButtonElement>(null);
  function hideUrlRow() {
    setUrlRowOn(null);
    urlToggle.current?.focus();
  }
  // Where the stage was scrolled at full size, per measured page: its device and page, as the
  // measurement is keyed (#224). A view or persona switch mounts a fresh page, which starts where
  // the last one on this page was left, so beat 2's flip to evidence keeps the link in view. In
  // memory only: a pixel offset is no link to share.
  const scrolls = useRef(new Map<string, Scroll>());
  const scrollKey = `${device}|${state.page}`;

  // The View control replaces the history entry, as a slider does; a persona link pushes one. It
  // writes both view keys, so the URL holds the one view picked.
  function showView(view: LensView) {
    void navigate({
      search: (prev) => ({
        ...prev,
        evidence: view === "evidence" ? true : undefined,
        illustration: view === "illustration" ? true : undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  }

  const title =
    stage.kind === "live" || stage.kind === "stored" ? stage.observation.title : state.page;
  // What the drawing is of. The page is keyed by it, so a persona, page, source or view switch
  // draws a fresh page, which animates nothing, while a threshold move animates what it changes.
  const scene = `${state.persona.id}|${state.page}|${stage.kind}|${state.view}`;
  // How the page was opened, said once: by the `Live:` line under a live page, or else by the axe
  // card's note, so the card never drops it where no `Live:` line stands.
  const opened = state.onTargetApp ? "at the target app's default parameters" : "opened as given";
  const liveLine = state.view !== "illustration" && stage.kind === "live";
  const axeNote = liveLine
    ? "Scanned once per page, on desktop."
    : `Scanned once per page on desktop, ${opened}.`;
  return (
    <div className="mx-auto grid h-[calc(100dvh_-_var(--header-h))] min-h-166 max-w-(--content-max) grid-cols-[var(--rail-w)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
      <Rail state={state} onMove={move} onRelease={release} />
      <section
        aria-labelledby={PAGE_TITLE_ID}
        className="flex min-h-0 min-w-0 flex-col gap-3 px-6 py-4"
      >
        <div className="flex h-10 min-w-0 items-center gap-4">
          <PagePicker search={search} current={state.page} />
          <h2 id={PAGE_TITLE_ID} title={title} className="min-w-0 flex-1 truncate label text-ink-2">
            {title}
          </h2>
          <Button
            ref={urlToggle}
            variant="outline"
            size="icon"
            aria-label="Open a URL"
            aria-expanded={urlRowShown}
            aria-controls={urlRowShown ? URL_ROW_ID : undefined}
            onClick={() => (urlRowShown ? hideUrlRow() : setUrlRowOn(state.page))}
          >
            <Link2 aria-hidden="true" strokeWidth={1.75} />
          </Button>
          {/* The page at its measured size, in a stage that scrolls, so its text reads from
              across a room (#224). Off in the illustration view, a picture it does not draw;
              disabled rather than hidden, so the View control never moves. It replaces the
              history entry, as the View control does. */}
          <Button
            variant={state.zoom ? "default" : "outline"}
            size="icon"
            aria-label="Full size"
            aria-pressed={state.zoom}
            disabled={state.view === "illustration"}
            onClick={() =>
              void navigate({
                search: (prev) => ({ ...prev, zoom: state.zoom ? undefined : true }),
                replace: true,
                resetScroll: false,
              })
            }
          >
            <ZoomIn aria-hidden="true" strokeWidth={1.75} />
          </Button>
          <SegmentedControl
            label="View"
            options={VIEWS}
            value={state.view}
            onValueChange={showView}
          />
        </div>
        {/* A row of its own while shown, so nothing in the header row moves; the stage gives up
            its height only then. */}
        {urlRowShown ? <UrlRow search={search} state={state} onClose={hideUrlRow} /> : null}
        {stage.kind === "stored" || stage.kind === "failed" ? (
          <Banner
            kind={stage.kind === "stored" ? "stored" : "fault"}
            action={
              // Asking again puts the query back to pending, so the stage shows its "Measuring"
              // line until io answers.
              <Button variant="outline" size="sm" onClick={() => void live.refetch()}>
                Try again
              </Button>
            }
          >
            {stage.kind === "stored"
              ? `The live page is unavailable: ${stage.failure}. Showing ${STORED_PAGE}.`
              : `The page could not be measured: ${stage.failure}. The Lens draws a page only from its own measurement.`}
          </Banner>
        ) : null}
        {/* A URL page that failed draws nothing here: its banner says why, and the bundled
            `/deliveries` would be the wrong site. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {state.view === "illustration" ? (
            // The stage depends on the picture alone: no line about the measurement shows here, so
            // a stored picture never sits under "Live:". The strip's skeletons cover the rest.
            <IllustrationStage
              device={device}
              emulation={emulation}
              page={state.page}
              search={search}
              picture={picture}
            />
          ) : stage.kind === "measuring" ? (
            <>
              {/* No page is drawn yet, so a long URL wraps here at no cost (#245). */}
              <p role="status" className="body text-ink-2 [overflow-wrap:anywhere]">
                {state.onTargetApp
                  ? `Measuring ${state.page} on the target app, on ${device}…`
                  : `Measuring ${state.page} on ${device}…`}
              </p>
              {/* On a measuring surface of its own, as the frame is: the frame's shape, 16:9 and
                  fitted to the surface as the frame is, edged as the frame is, since the
                  skeleton's paper is the surface's own. */}
              <div className={MEASURING_SURFACE}>
                <Skeleton className="aspect-video w-[min(100cqw,100cqh*16/9)] rounded-md border border-line-strong" />
              </div>
            </>
          ) : stage.kind === "failed" ? null : (
            <PerceivedPage
              key={scene}
              observation={stage.observation}
              evidence={state.view === "evidence"}
              subject={subject}
              zoom={state.zoom}
              initialScroll={scrolls.current.get(scrollKey)}
              onScroll={(scroll) => scrolls.current.set(scrollKey, scroll)}
              // The `Live:` line, under the page, where it costs the stage no height (#224). A
              // stored page has none: its banner says where it came from. One line whatever the
              // URL: a long one is cut short with an ellipsis, whole in its `title` and its text,
              // so it neither widens the page nor grows the caption and shrinks the page (#245).
              source={
                liveLine ? (
                  <span className="flex whitespace-pre">
                    Live:{" "}
                    <span className="min-w-0 truncate font-mono" title={stage.observation.url}>
                      {stage.observation.url}
                    </span>
                    {` on ${device}, ${opened}.`}
                  </span>
                ) : undefined
              }
            />
          )}
        </div>
        <ReadoutStrip stage={stage} page={state.page} axeNote={axeNote} />
      </section>
    </div>
  );
}

export const lensRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lens",
  // A zod schema is a Standard Schema, which TanStack validates with directly. Every key is
  // optional, so a link may leave out any of them.
  validateSearch: PreviewSearch,
  component: LensScreen,
});
