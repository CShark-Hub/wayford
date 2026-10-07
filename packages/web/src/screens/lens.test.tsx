/**
 * The Lens through the app's own router, against "Screen" and "Acceptance mapping" in
 * `docs/specs/2026-10-01-s3-01-preview.md` and `docs/specs/2026-10-06-s3-11-lens-redesign.md`.
 * Each test loads a URL into a memory history and renders the page with `renderToStaticMarkup`, as
 * `router.test.tsx` does: what a copied link opens with, read off the markup, with no DOM library.
 *
 * `perceive` is the filter's own, wrapped in a spy, so every call the screen makes is recorded and
 * the drawing is still real. Expected observations come from the unwrapped `perceive`, so they add
 * no call, and the spy is cleared before each render whose calls a test reads.
 *
 * Drawn boxes are read as `perceived-page.test.tsx` reads them: found by `data-state`, and read by
 * `data-ref`, `data-state`, text and the measured px inside each `calc(N * var(--px))`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import {
  type AxeScan,
  type DeviceKind,
  type FullObservation,
  METRIC_NAMES,
  type MetricName,
  type ObservedElement,
  type PageMeasurement,
  type Profile,
} from "@wayford/core";
import {
  axeScanFixture,
  axeScanFixtures,
  measurementFixture,
  observationFixture,
  profileFixture,
  profileFixtures,
  targetAppJargon,
} from "@wayford/core/fixtures";
import { perceive } from "@wayford/filter/perceive";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { axeQuery } from "../api/axe.js";
import { measurementQuery } from "../api/measure.js";
import {
  attributesOf,
  captionOf,
  type Drawn,
  detailsOf,
  drawnBoxes,
  elementOf,
  lineOf,
  shownElements,
  styleOf,
  textOf,
  withoutNested,
} from "../preview/rendered-markup.js";
import { PREVIEW_PAGES } from "../preview/search.js";
import { createAppRouter } from "../router.js";
import { lensCounts, rulesFired } from "./lens.js";

vi.mock("@wayford/filter/perceive", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wayford/filter/perceive")>();
  return { ...actual, perceive: vi.fn(actual.perceive) };
});

/** Every call the screen makes to `perceive`, through the mock above. */
const perceiveSpy = vi.mocked(perceive);

/** The filter's `perceive` itself, for expectations: a call to it records nothing. */
const { perceive: realPerceive } = await vi.importActual<typeof import("@wayford/filter/perceive")>(
  "@wayford/filter/perceive",
);

const kai = profileFixture("prof_kai");
const vera = profileFixture("prof_vera");
const zoya = profileFixture("prof_zoya");

const ARCHIVE = "Order archive";

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

/** The app's router, loaded at `path`. */
async function routerAt(path: string) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return router;
}

type AppRouter = Awaited<ReturnType<typeof routerAt>>;

/** io's answer for one device and page. */
type LiveAnswer = [device: DeviceKind, page: string, measurement: PageMeasurement];

/** The stored fixture as io's answer for every Lens page on both devices. */
const FIXTURE_EVERYWHERE: LiveAnswer[] = (["desktop", "mobile"] as const).flatMap((device) =>
  PREVIEW_PAGES.map((page): LiveAnswer => [device, page, measurementFixture]),
);

/**
 * io's axe-core scan of `page`: the stored one where there is one (`/deliveries` with its
 * `color-contrast`, `/settings/data` with none), else one that found nothing, at the same query.
 */
function axeScanOf(page: string): AxeScan {
  if (axeScanFixtures.some((scan) => scan.url.startsWith(`${page}?`))) return axeScanFixture(page);
  const { url, ...deliveries } = axeScanFixture("/deliveries");
  return { ...deliveries, url: `${page}${url.slice(url.indexOf("?"))}`, violations: [] };
}

/**
 * A query client that holds io's `answers`, so a render fetches nothing. By default the stored
 * fixture everywhere: the screen then draws `measurementFixture`, whatever the persona and page.
 * It holds io's axe-core scan of every Lens page too, whatever the answers, so the card is
 * settled and adds no status line.
 */
function liveClient(answers: LiveAnswer[] = FIXTURE_EVERYWHERE): QueryClient {
  const client = new QueryClient();
  for (const [device, page, measurement] of answers) {
    client.setQueryData(measurementQuery(device, page).queryKey, measurement);
  }
  for (const page of PREVIEW_PAGES) {
    client.setQueryData(axeQuery(page).queryKey, axeScanOf(page));
  }
  return client;
}

/**
 * A client whose measurement of `page` on `device` failed, as it does while io or the target app
 * is down. The query neither retries nor retries on mount (`src/api/measure.ts`), so a static
 * render keeps the failure.
 */
async function failedClient(device: DeviceKind, page: string): Promise<QueryClient> {
  const client = new QueryClient();
  await client.prefetchQuery({
    ...measurementQuery(device, page),
    queryFn: () => Promise.reject(new Error("target_app_unavailable: the target app did not load")),
  });
  return client;
}

/** What `router` shows now: the shell and the matched screen, inside `client`. */
function renderRouter(router: AppRouter, client: QueryClient = liveClient()): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** The page at `path`. The spy is cleared first, so it holds this render's calls alone. */
async function render(path: string, client?: QueryClient): Promise<string> {
  const router = await routerAt(path);
  perceiveSpy.mockClear();
  return renderRouter(router, client);
}

/**
 * The query of the URL `router` is at, as its parser read it. The router builds it with no
 * prototype, so it is copied into a plain object for a strict comparison.
 */
function searchAt(router: AppRouter): Record<string, unknown> {
  return { ...router.state.location.search };
}

// ---------------------------------------------------------------------------
// Reading the markup
// ---------------------------------------------------------------------------

/**
 * `html` without the elements hidden from assistive technology, so a name reads as it is
 * announced. None of them holds an element of its own tag, so each ends at its first closing tag,
 * and one that does throws.
 */
function withoutHidden(html: string): string {
  return html.replace(
    /<(\w+)(?=[^>]*\saria-hidden="true")[^>]*>(.*?)<\/\1>/gs,
    (_hidden, tag: string, inner: string) => {
      withoutNested(tag, inner);
      return "";
    },
  );
}

/** A drawn box without its ref: where it sits and what it reads. */
function placed({ state, name, bbox, fontPx }: Drawn) {
  return { state, name, bbox, fontPx };
}

/** One slider: its input's attributes, the text of the label and the readout that name its id. */
type Slider = {
  input: Record<string, string>;
  label: string | undefined;
  output: string | undefined;
};

/** The text of the `<tag>` whose `for` is `id`. */
function textFor(html: string, tag: string, id: string | undefined): string | undefined {
  if (id === undefined) return undefined;
  return textOf(elementOf(html, tag, `for="${id}"`));
}

/** Every range input on the page, in order, with its label and readout. */
function slidersOf(html: string): Slider[] {
  return [...html.matchAll(/<input(\s[^>]*)>/g)]
    .map((m) => attributesOf(m[1] ?? ""))
    .filter((input) => input.type === "range")
    .map((input) => ({
      input,
      label: textFor(html, "label", input.id),
      output: textFor(html, "output", input.id),
    }));
}

function sliderOf(html: string, id: string): Slider {
  const found = slidersOf(html).find((slider) => slider.input.id === id);
  if (!found) throw new Error(`No slider ${id}`);
  return found;
}

/** A link: its attributes and its name as announced. */
type Anchor = { attributes: Record<string, string>; name: string };

function linksOf(html: string): Anchor[] {
  return [...html.matchAll(/<a(\s[^>]*)?>(.*?)<\/a>/gs)].map((m) => ({
    attributes: attributesOf(m[1] ?? ""),
    name: textOf(withoutHidden(m[2] ?? "")),
  }));
}

/** The query of a link's `href`. */
function searchOf(href: string | undefined): URLSearchParams {
  return new URL(href ?? "", "http://wayford.test").searchParams;
}

/** The persona control's links, one per persona. */
function personaLinks(html: string): Anchor[] {
  return linksOf(elementOf(html, "nav", 'aria-label="Persona"'));
}

function personaLink(html: string, id: string): Anchor {
  const found = personaLinks(html).find(
    (link) => searchOf(link.attributes.href).get("persona") === id,
  );
  if (!found) throw new Error(`No persona link for ${id}`);
  return found;
}

/**
 * The View control's radios, each name to its `aria-checked`: the control is a `SegmentedControl`,
 * a `div` with the radio group role, labelled "View".
 */
function viewOf(html: string): Record<string, string | undefined> {
  const group = html.match(
    /<div(?=[^>]*\srole="radiogroup")(?=[^>]*\saria-label="View")[^>]*>(.*?)<\/div>/s,
  )?.[1];
  if (group === undefined) throw new Error('No <div role="radiogroup" aria-label="View">');
  return Object.fromEntries(
    [...withoutNested("div", group).matchAll(/<button(\s[^>]*)?>(.*?)<\/button>/gs)].map((m) => [
      textOf(withoutHidden(m[2] ?? "")),
      attributesOf(m[1] ?? "")["aria-checked"],
    ]),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const VERA = "/lens?persona=prof_vera&seed=1";

/** Every slider in panel order: each threshold above its softness, then the seed. */
const SLIDER_IDS = [
  "preview-contrast",
  "preview-contrastSoftness",
  "preview-fontPx",
  "preview-fontPxSoftness",
  "preview-targetPx",
  "preview-targetPxSoftness",
  "preview-seed",
];

/**
 * `profile` with each threshold's softness written out, 0 where it sets none: the hard cut
 * `perceive` reads either way, and what the Lens resolves a softness the URL leaves out to.
 */
function softnessWrittenOut(profile: Profile): Profile {
  const perception = { ...profile.perception };
  for (const metric of METRIC_NAMES) {
    const cut = perception[metric];
    if (cut !== undefined) perception[metric] = { ...cut, softness: cut.softness ?? 0 };
  }
  return { ...profile, perception };
}

test("Order archive is drawn at a contrast threshold of 2 and not at 3, softness 0", async () => {
  const at2 = drawnBoxes(await render(`${VERA}&contrast=2&contrastSoftness=0`));
  const at3 = drawnBoxes(await render(`${VERA}&contrast=3&contrastSoftness=0`));
  const archive = (box: Drawn) => box.name === ARCHIVE;
  // Its contrast is 2.005:1, so 2 lets it through and 3 cuts it, with no band at softness 0.
  expect(at2.filter(archive).map((box) => box.state)).toEqual(["visible"]);
  expect(at3.filter(archive)).toEqual([]);
  // One element changes, and every other drawn box stays where it was, reading what it read.
  const rest = (boxes: Drawn[]) => boxes.filter((box) => !archive(box)).map(placed);
  expect(rest(at3)).toEqual(rest(at2));
  expect(at3).toHaveLength(at2.length - 1);
});

test("the drawn elements are exactly the shown elements of perceive for the URL's values", async () => {
  // Each URL's profile, written out by hand rather than resolved by the screen's own code: a
  // persona at its own values is the persona, and moved sliders are the values the URL names, on
  // the rest of the persona. Kai sets no threshold, so a moved slider is his whole perception.
  const moved: Profile = {
    ...vera,
    perception: {
      contrast: { threshold: 4.5, softness: 0.6, provenance: "folk" },
      fontPx: { threshold: 18, softness: 0.25, provenance: "folk" },
      targetPx: { threshold: 40, softness: 0.5, provenance: "folk" },
      emulation: vera.perception.emulation,
    },
  };
  const cases: { url: string; profile: Profile; seed: number }[] = [
    ...profileFixtures.map((profile) => ({
      url: `/lens?persona=${profile.id}&seed=1`,
      profile,
      seed: 1,
    })),
    {
      url: "/lens?persona=prof_vera&seed=7&contrast=4.5&contrastSoftness=0.6&fontPx=18&fontPxSoftness=0.25&targetPx=40&targetPxSoftness=0.5",
      profile: moved,
      seed: 7,
    },
    {
      url: "/lens?persona=prof_kai&seed=1&contrast=4.5&contrastSoftness=0.5",
      profile: {
        ...kai,
        perception: {
          contrast: { threshold: 4.5, softness: 0.5, provenance: "folk" },
          emulation: "none",
        },
      },
      seed: 1,
    },
  ];
  for (const { url, profile, seed } of cases) {
    const expected = realPerceive(measurementFixture, profile, seed, { jargon: targetAppJargon });
    const html = await render(url);
    expect(drawnBoxes(html), url).toEqual(shownElements(expected));
    // The screen perceives the stored page itself, with the URL's profile and seed, and the target
    // app's jargon list, so K2 masks in the Lens what it masks in a run.
    expect(perceiveSpy.mock.calls.length, url).toBeGreaterThan(0);
    for (const [measurement, callProfile, callSeed, callOptions] of perceiveSpy.mock.calls) {
      expect(measurement, url).toStrictEqual(measurementFixture);
      expect(callProfile, url).toStrictEqual(softnessWrittenOut(profile));
      expect(callSeed, url).toBe(seed);
      expect(callOptions, url).toStrictEqual({ jargon: targetAppJargon });
    }
  }
  // The moved URL holds every state, so the comparison cannot pass on a page with nothing removed
  // or nothing degraded.
  const states = new Set(realPerceive(measurementFixture, moved, 7).elements.map((e) => e.state));
  expect([...states].sort()).toEqual(["degraded", "invisible", "visible"]);
});

test("with no seed in the URL, the seed slider reads 1 and every perceive call gets 1", async () => {
  // The seed is defaulted when the URL resolves, not written into it, so this URL renders as it is.
  const router = await routerAt("/lens?persona=prof_vera");
  perceiveSpy.mockClear();
  const html = renderRouter(router);
  expect(searchAt(router)).toStrictEqual({ persona: "prof_vera" });
  const seed = sliderOf(html, "preview-seed");
  expect(seed.input.value).toBe("1");
  expect(seed.output).toBe("1");
  expect(perceiveSpy.mock.calls.length).toBeGreaterThan(0);
  for (const call of perceiveSpy.mock.calls) expect(call[2]).toBe(1);
});

test("switching to Zoya with the persona control keeps seed 7", async () => {
  // From Vera's own values, and from Vera with sliders moved, whose values the switch drops.
  for (const start of [
    "/lens?persona=prof_vera&seed=7",
    "/lens?persona=prof_vera&seed=7&contrast=2&fontPxSoftness=0.5",
  ]) {
    const router = await routerAt(start);
    const href = personaLink(renderRouter(router), "prof_zoya").attributes.href;
    const query = searchOf(href);
    expect(query.get("seed"), start).toBe("7");
    expect([...query.keys()].sort(), start).toEqual(["persona", "seed"]);
    perceiveSpy.mockClear();
    router.history.push(href ?? "");
    await router.load();
    const html = renderRouter(router);
    expect(searchAt(router), start).toStrictEqual({ persona: "prof_zoya", seed: 7 });
    expect(drawnBoxes(html), start).toEqual(
      shownElements(realPerceive(measurementFixture, zoya, 7)),
    );
    expect(personaLink(html, "prof_zoya").attributes["aria-current"]).toBe("page");
    expect(perceiveSpy.mock.calls.length, start).toBeGreaterThan(0);
    for (const call of perceiveSpy.mock.calls) expect(call[2], start).toBe(7);
  }
});

test("a URL that sets every control restores every control", async () => {
  const html = await render(
    "/lens?persona=prof_zoya&seed=7&contrast=2.5&contrastSoftness=0.2&fontPx=20&targetPx=40&targetPxSoftness=0.1&evidence=true",
  );
  // Each slider's value and readout. The font softness is not in the URL, so it is Zoya's own:
  // she sets none, which reads 0.
  const expected: Record<string, [value: string, readout: string]> = {
    "preview-contrast": ["2.5", "2.5:1"],
    "preview-contrastSoftness": ["0.2", "0.2"],
    "preview-fontPx": ["20", "20 px"],
    "preview-fontPxSoftness": ["0", "0"],
    "preview-targetPx": ["40", "40 px"],
    "preview-targetPxSoftness": ["0.1", "0.1"],
    "preview-seed": ["7", "7"],
  };
  for (const [id, [value, readout]] of Object.entries(expected)) {
    const slider = sliderOf(html, id);
    expect(slider.input.value, id).toBe(value);
    expect(slider.output, id).toBe(readout);
  }
  // Zoya is the current persona, and only she.
  const current = personaLinks(html).filter((link) => link.attributes["aria-current"] === "page");
  expect(current.map((link) => link.name)).toEqual(["Zoya"]);
  expect(viewOf(html)).toEqual({ Perceived: "false", Evidence: "true" });
  // And the drawing is the one those values give, on the rest of Zoya.
  const profile: Profile = {
    ...zoya,
    perception: {
      contrast: { threshold: 2.5, softness: 0.2, provenance: "folk" },
      fontPx: { threshold: 20, provenance: "folk" },
      targetPx: { threshold: 40, softness: 0.1, provenance: "folk" },
      emulation: zoya.perception.emulation,
    },
  };
  expect(drawnBoxes(html)).toEqual(shownElements(realPerceive(measurementFixture, profile, 7)));
});

test("Ada's thresholds read off, her softness sliders are disabled, and every element is drawn", async () => {
  const html = await render("/lens?persona=prof_ada&seed=1");
  for (const metric of METRIC_NAMES) {
    const threshold = sliderOf(html, `preview-${metric}`);
    expect(threshold.output, metric).toBe("off");
    expect(threshold.input["aria-valuetext"], metric).toBe("off");
    expect(threshold.input, metric).not.toHaveProperty("disabled");
    expect(sliderOf(html, `preview-${metric}Softness`).input, metric).toHaveProperty(
      "disabled",
      "",
    );
  }
  expect(sliderOf(html, "preview-seed").input).not.toHaveProperty("disabled");
  const drawn = drawnBoxes(html);
  expect(drawn.map((box) => box.name)).toEqual(measurementFixture.elements.map((e) => e.name));
  expect(drawn.every((box) => box.state === "visible")).toBe(true);
});

test("a softness slider is disabled exactly while its threshold is off", async () => {
  const own = await render(VERA);
  for (const metric of METRIC_NAMES) {
    expect(sliderOf(own, `preview-${metric}Softness`).input, metric).not.toHaveProperty("disabled");
  }
  // Vera's contrast switched off at the slider's lowest position, the rest left as they are.
  const off = await render(`${VERA}&contrast=1`);
  expect(sliderOf(off, "preview-contrast").output).toBe("off");
  expect(sliderOf(off, "preview-contrastSoftness").input).toHaveProperty("disabled", "");
  expect(sliderOf(off, "preview-fontPxSoftness").input).not.toHaveProperty("disabled");
});

test("every slider has a label pointing at its input and an aria-valuetext", async () => {
  for (const url of [VERA, "/lens?persona=prof_ada&seed=1"]) {
    const sliders = slidersOf(await render(url));
    expect(
      sliders.map((slider) => slider.input.id),
      url,
    ).toEqual(SLIDER_IDS);
    expect(
      sliders.map((slider) => slider.label),
      url,
    ).toEqual([
      "Contrast",
      "Contrast softness",
      "Font size",
      "Font size softness",
      "Target size",
      "Target size softness",
      "Seed",
    ]);
    for (const { input, output } of sliders) {
      expect(input["aria-valuetext"], input.id).toBeTruthy();
      // The readout and the slider say the same thing.
      expect(input["aria-valuetext"], input.id).toBe(output);
    }
  }
});

test("Perceived and Evidence carry aria-checked in both views", async () => {
  expect(viewOf(await render(VERA))).toEqual({ Perceived: "true", Evidence: "false" });
  const evidence = await render(`${VERA}&evidence=true`);
  expect(viewOf(evidence)).toEqual({ Perceived: "false", Evidence: "true" });
  // The evidence view outlines what perception removed; the perceived view does not.
  expect(evidence).toContain("data-removed");
  expect(await render(VERA)).not.toContain("data-removed");
});

test("the caption names the persona, and says thresholds edited once they move", async () => {
  expect(captionOf(await render(VERA))).toBe("The page as perceive returns it for Vera, seed 1.");
  expect(captionOf(await render(`${VERA}&contrast=2`))).toBe(
    "The page as perceive returns it for Vera, thresholds edited, seed 1.",
  );
});

test("with every threshold at its maximum nothing is drawn", async () => {
  const html = await render(
    `${VERA}&contrast=21&contrastSoftness=0&fontPx=48&fontPxSoftness=0&targetPx=96&targetPxSoftness=0`,
  );
  expect(drawnBoxes(html)).toEqual([]);
});

test("the top bar's story nav has a Lens link to /lens, between Cast and Race", async () => {
  const onLens = linksOf(elementOf(await render(VERA), "nav", 'aria-label="Story"'));
  expect(onLens.map((link) => [link.name, link.attributes.href])).toEqual([
    ["Cast", "/cast"],
    ["Lens", "/lens"],
    ["Race", "/race"],
    ["Report", "/report/task_past-order"],
    ["Boundary", "/boundary"],
  ]);
  expect(onLens[1]?.attributes["aria-current"]).toBe("page");
  const onCast = linksOf(elementOf(await render("/cast"), "nav", 'aria-label="Story"'));
  const lens = onCast.find((link) => link.name === "Lens");
  expect(lens?.attributes.href).toBe("/lens");
  expect(lens?.attributes["aria-current"]).toBeUndefined();
});

test("the persona control links every persona on the seed and view the URL holds", async () => {
  const html = await render("/lens?persona=prof_vera&seed=7&contrast=2&evidence=true");
  expect(personaLinks(html).map((link) => [link.name, link.attributes.href])).toEqual(
    profileFixtures.map((profile) => [
      profile.label,
      `/lens?persona=${profile.id}&seed=7&evidence=true`,
    ]),
  );
});

// ---------------------------------------------------------------------------
// The live page (s3-05)
// ---------------------------------------------------------------------------

/** `measurementFixture` with its own title and fewer elements, so a test can tell it was drawn. */
function liveOf(path: string, isMobile = false): PageMeasurement {
  return {
    ...measurementFixture,
    url: `http://localhost:5174${path}`,
    title: `${path} live${isMobile ? " on a phone" : ""}`,
    viewport: isMobile
      ? { width: 412, height: 839, deviceScaleFactor: 2.625, isMobile: true }
      : measurementFixture.viewport,
    elements: measurementFixture.elements.slice(0, 6),
  };
}

/** The stage's title. */
function titleOf(html: string): string {
  return textOf(elementOf(html, "h2", `id="preview-page-title"`));
}

/** The text of the stage's `role="status"` banner or line, or `undefined` when it shows none. */
function statusOf(html: string): string | undefined {
  const banner = html.match(/<(div|p)(?=[^>]*\srole="status")[^>]*>(.*?)<\/\1>/s);
  return banner === null ? undefined : textOf(withoutHidden(banner[2] ?? ""));
}

/** The page control's links: each name, href and `aria-current`. */
function pageLinks(html: string) {
  return linksOf(elementOf(html, "nav", 'aria-label="Page"')).map((link) => ({
    name: link.name,
    href: link.attributes.href,
    current: link.attributes["aria-current"],
  }));
}

test("the screen draws io's live measurement of the page, for the persona's device", async () => {
  const live = liveOf("/deliveries");
  const html = await render(VERA, liveClient([["desktop", "/deliveries", live]]));
  expect(titleOf(html)).toBe("/deliveries live");
  expect(drawnBoxes(html)).toEqual(shownElements(realPerceive(live, vera, 1)));
  // Every perceive call was on the live page.
  expect(perceiveSpy.mock.calls.length).toBeGreaterThan(0);
  for (const call of perceiveSpy.mock.calls) expect(call[0]).toBe(live);
  // No banner: a line names where the page came from.
  expect(statusOf(html)).toBeUndefined();
  expect(textOf(html)).toContain(
    "Live: http://localhost:5174/deliveries on desktop, at the target app's default parameters.",
  );
});

test("Milo, on a phone, gets the phone's measurement, drawn no wider than the phone", async () => {
  const phone = liveOf("/deliveries", true);
  const html = await render(
    "/lens?persona=prof_milo",
    liveClient([
      ["desktop", "/deliveries", liveOf("/deliveries")],
      ["mobile", "/deliveries", phone],
    ]),
  );
  expect(titleOf(html)).toBe("/deliveries live on a phone");
  expect(drawnBoxes(html)).toEqual(
    shownElements(realPerceive(phone, profileFixture("prof_milo"), 1)),
  );
  const frame = html.match(/<div(?=[^>]*\sdata-lens-stage="")[^>]*>/)?.[0] ?? "";
  expect(styleOf(attributesOf(frame))["max-width"]).toBe("412px");
});

test("the page in the URL is the page measured and drawn", async () => {
  const data = liveOf("/settings/data");
  const html = await render(
    "/lens?persona=prof_kai&page=/settings/data",
    liveClient([["desktop", "/settings/data", data]]),
  );
  expect(titleOf(html)).toBe("/settings/data live");
  expect(drawnBoxes(html)).toEqual(shownElements(realPerceive(data, kai, 1)));
});

test("while the page is measured, nothing is drawn and a status line says so", async () => {
  // A fresh client: the query is pending, as on the first visit.
  const html = await render("/lens?persona=prof_vera&page=/account", new QueryClient());
  expect(drawnBoxes(html)).toEqual([]);
  expect(perceiveSpy).not.toHaveBeenCalled();
  expect(titleOf(html)).toBe("/account");
  expect(statusOf(html)).toBe("Measuring /account on the target app, on desktop…");
});

test("with the live page unavailable, the stored page is drawn under a banner that says so", async () => {
  const html = await render(VERA, await failedClient("desktop", "/deliveries"));
  expect(drawnBoxes(html)).toEqual(shownElements(realPerceive(measurementFixture, vera, 1)));
  expect(titleOf(html)).toBe(measurementFixture.title);
  expect(statusOf(html)).toBe(
    "The live page is unavailable: target_app_unavailable: the target app did not load. " +
      "Showing the stored /deliveries, measured on desktop at the target app's default " +
      "parameters (1280 × 720).Try again",
  );
  expect(textOf(html)).not.toContain("Live: ");
});

test("on another page, the fallback is still the stored /deliveries, and the banner names it", async () => {
  const html = await render(
    "/lens?persona=prof_kai&page=/settings/data",
    await failedClient("desktop", "/settings/data"),
  );
  expect(drawnBoxes(html)).toEqual(shownElements(realPerceive(measurementFixture, kai, 1)));
  expect(statusOf(html)).toContain("Showing the stored /deliveries");
  // The picker still says which page was asked for.
  expect(pageLinks(html).find((link) => link.current === "page")?.name).toBe("/settings/data");
});

test("the page control links each page with persona, seed, sliders and view kept", async () => {
  const html = await render("/lens?persona=prof_zoya&seed=7&contrast=2.5&evidence=true");
  const kept = "persona=prof_zoya&seed=7&contrast=2.5&evidence=true";
  expect(pageLinks(html)).toEqual([
    { name: "/deliveries", href: `/lens?${kept}`, current: "page" },
    { name: "/account", href: `/lens?${kept}&page=%2Faccount`, current: undefined },
    {
      name: "/settings/data",
      href: `/lens?${kept}&page=%2Fsettings%2Fdata`,
      current: undefined,
    },
  ]);
});

test("a persona link keeps the page the URL holds", async () => {
  const html = await render("/lens?persona=prof_vera&seed=7&page=/account");
  expect(personaLink(html, "prof_kai").attributes.href).toBe(
    "/lens?persona=prof_kai&seed=7&page=%2Faccount",
  );
});

// ---------------------------------------------------------------------------
// The axe-core card (s4-06)
// ---------------------------------------------------------------------------

/** The axe-core card's inner markup. */
function axeCardOf(html: string): string {
  return elementOf(html, "section", 'aria-label="axe-core"');
}

/** The card's rule list, each item as it reads: `color-contrast, 1 element`. */
function axeRulesOf(card: string): string[] {
  return [...card.matchAll(/<li(?:\s[^>]*)?>(.*?)<\/li>/gs)].map((m) => textOf(m[1] ?? ""));
}

const SCANNED_ONCE = "Scanned once per page on desktop, at the target app's default parameters.";

/**
 * A client that holds io's answers as `liveClient` does, except that its axe-core scan of `page`
 * failed with `reason`, as it does while the target app is down. The query neither retries nor
 * retries on mount (`src/api/axe.ts`), so a static render keeps the failure.
 */
async function axeFailedClient(page: string, reason: string): Promise<QueryClient> {
  const client = liveClient();
  client.removeQueries({ queryKey: axeQuery(page).queryKey, exact: true });
  await client.prefetchQuery({
    ...axeQuery(page),
    queryFn: () => Promise.reject(new Error(reason)),
  });
  return client;
}

test("on /deliveries the card counts axe-core's one violation and names its rule", async () => {
  const html = await render(VERA);
  const card = axeCardOf(html);
  expect(lineOf(card)).toMatch(/^axe-core, WCAG 2\.2 A and AA: 1 violation /);
  expect(axeRulesOf(card)).toEqual(["color-contrast, 1 element"]);
  expect(lineOf(card)).toContain(SCANNED_ONCE);
  // In the stage's readout strip, after the page's drawing.
  const at = html.indexOf('aria-label="axe-core"');
  expect(html).toContain("data-lens-stage");
  expect(at).toBeGreaterThan(html.indexOf("data-lens-stage"));
  // The scan is by page: Milo, on a phone, sees the same card.
  expect(axeCardOf(await render("/lens?persona=prof_milo"))).toBe(card);
});

test("on /settings/data the card counts no violation and lists no rule", async () => {
  const card = axeCardOf(await render("/lens?persona=prof_kai&page=/settings/data"));
  expect(lineOf(card)).toMatch(/^axe-core, WCAG 2\.2 A and AA: 0 violations /);
  expect(card).not.toContain("<ul");
  expect(lineOf(card)).toContain(SCANNED_ONCE);
});

test("the card lists every rule axe-core found, each with its own element count", async () => {
  // Two rules, the first on two elements: a card that showed only the first rule, or one count
  // for all of them, would read otherwise.
  const client = liveClient();
  client.setQueryData(axeQuery("/deliveries").queryKey, {
    ...axeScanFixture("/deliveries"),
    violations: [
      {
        ruleId: "color-contrast",
        impact: "serious",
        tags: ["wcag2aa", "wcag143"],
        help: "Elements must meet minimum color contrast ratio thresholds",
        nodes: 2,
      },
      {
        ruleId: "target-size",
        impact: "serious",
        tags: ["wcag22aa", "wcag258"],
        help: "All touch targets must be 24px large, or leave sufficient space",
        nodes: 1,
      },
    ],
  });
  const card = axeCardOf(await render(VERA, client));
  expect(lineOf(card)).toMatch(/^axe-core, WCAG 2\.2 A and AA: 2 violations /);
  expect(axeRulesOf(card)).toEqual(["color-contrast, 2 elements", "target-size, 1 element"]);
});

test("a failed scan says axe did not run, with io's reason, and never a count", async () => {
  const reason = "target_app_unavailable: the target app did not load";
  const html = await render(VERA, await axeFailedClient("/deliveries", reason));
  const card = axeCardOf(html);
  expect(lineOf(card)).toBe(`axe did not run on /deliveries ${reason}`);
  // The page itself is still drawn from its measurement, with no banner.
  expect(drawnBoxes(html)).toEqual(shownElements(realPerceive(measurementFixture, vera, 1)));
  expect(statusOf(html)).toBeUndefined();
});

test("while the page is scanned the card says so, and the stage's status line stays the measurement's", async () => {
  // A fresh client: both the measurement and the scan are pending, as on the first visit.
  const fresh = await render("/lens?persona=prof_vera&page=/account", new QueryClient());
  expect(lineOf(axeCardOf(fresh))).toBe("axe-core is scanning /account…");
  expect(statusOf(fresh)).toBe("Measuring /account on the target app, on desktop…");
  // The page measured and the scan still pending: the card adds no status line of its own.
  const measured = liveClient();
  measured.removeQueries({ queryKey: axeQuery("/account").queryKey, exact: true });
  const html = await render("/lens?persona=prof_vera&page=/account", measured);
  expect(lineOf(axeCardOf(html))).toBe("axe-core is scanning /account…");
  expect(statusOf(html)).toBeUndefined();
  expect(axeCardOf(html)).not.toContain("role=");
});

// ---------------------------------------------------------------------------
// The gauges and the readout strip (s3-11)
// ---------------------------------------------------------------------------

/**
 * The rail's gauge for `metric`, as it reads: its label, readout, tags and softness row. Each
 * gauge runs from its start to the next one's, the last to the end of the rail.
 */
function gaugeOf(html: string, metric: MetricName): string {
  const rail = html.match(/<aside(?:\s[^>]*)?>(.*?)<\/aside>/s)?.[1] ?? "";
  const gauge = rail
    .split(/(?=<div[^>]*\sdata-slot="threshold-gauge")/)
    .find((part) => part.includes(`id="preview-${metric}"`));
  if (gauge === undefined) throw new Error(`No gauge for ${metric}`);
  return lineOf(gauge);
}

/**
 * The strip's description list, each term to what it reads: the three counts, and the rules fired,
 * their tags joined by spaces. The strip holds the page's one `<dl>`.
 */
function stripOf(html: string): Record<string, string> {
  const list = html.match(/<dl(?:\s[^>]*)?>(.*?)<\/dl>/s)?.[1];
  if (list === undefined) throw new Error("No <dl>");
  return detailsOf(list);
}

/** What the strip reads for `observation`, by `lensCounts` and `rulesFired`. */
function expectedStrip(observation: FullObservation): Record<string, string> {
  const counts = lensCounts(observation);
  const rules = rulesFired(observation);
  return {
    visible: String(counts.visible),
    degraded: String(counts.degraded),
    removed: String(counts.removed),
    "rules fired": rules.length === 0 ? "none" : rules.join(" "),
  };
}

test("a moved threshold reads folk with no source and what it was; the persona's own, her source", async () => {
  // Beat 2: Vera's contrast dragged from her 3:1 to 4.5:1. A slider value cites nothing.
  const moved = gaugeOf(await render(`${VERA}&contrast=4.5`), "contrast");
  expect(moved).toContain("4.5:1");
  expect(moved).toContain("P1 folk · no source");
  expect(moved).toContain("was 3:1");
  expect(moved).not.toContain("wcag22");
  // At her own values the threshold is hers, with her source, and nothing was moved.
  const own = gaugeOf(await render(VERA), "contrast");
  expect(own).toContain("P1 wcag22");
  expect(own).not.toContain("no source");
  expect(own).not.toContain("was");
  // The gauges she did not move keep their own sources.
  expect(gaugeOf(await render(`${VERA}&contrast=4.5`), "fontPx")).toContain("P3 legge2011");
});

test("the strip's counts and rules fired are those of the observation drawn", async () => {
  const beat2: Profile = {
    ...vera,
    perception: {
      ...vera.perception,
      contrast: { threshold: 4.5, softness: 0.5, provenance: "folk" },
    },
  };
  const cases: { url: string; profile: Profile }[] = [
    { url: VERA, profile: vera },
    { url: `${VERA}&contrast=4.5`, profile: beat2 },
    { url: "/lens?persona=prof_zoya&seed=1", profile: zoya },
    { url: "/lens?persona=prof_ada&seed=1", profile: profileFixture("prof_ada") },
  ];
  for (const { url, profile } of cases) {
    const expected = realPerceive(measurementFixture, profile, 1, { jargon: targetAppJargon });
    const html = await render(url);
    expect(stripOf(html), url).toEqual(expectedStrip(expected));
    // The counts add up to the page, and the shown ones are the boxes drawn.
    const counts = lensCounts(expected);
    expect(counts.visible + counts.degraded + counts.removed, url).toBe(expected.elements.length);
    expect(counts.visible + counts.degraded, url).toBe(drawnBoxes(html).length);
  }
  // Beat 2 removes and fires: the comparison cannot pass on an empty strip.
  expect(expectedStrip(realPerceive(measurementFixture, beat2, 1))).toMatchObject({
    removed: "2",
    "rules fired": "P1 contrast P4 target",
  });
  expect(stripOf(await render("/lens?persona=prof_ada&seed=1"))["rules fired"]).toBe("none");
});

test("Kai's strip names the attention cap that cut his page", async () => {
  const expected = realPerceive(measurementFixture, kai, 1, { jargon: targetAppJargon });
  expect(rulesFired(expected)).toContain("A1 attention");
  expect(stripOf(await render("/lens?persona=prof_kai"))["rules fired"]).toBe(
    rulesFired(expected).join(" "),
  );
});

test("while the page is measured, the strip's counts and rules are skeletons", async () => {
  const strip = stripOf(await render("/lens?persona=prof_vera&page=/account", new QueryClient()));
  expect(strip).toEqual({ visible: "", degraded: "", removed: "", "rules fired": "" });
});

test("lensCounts splits an observation by how the stage draws it", () => {
  // The fixture: five visible, the archive link degraded, ten removed by perception, attention
  // and the viewport.
  expect(lensCounts(observationFixture)).toEqual({ visible: 5, degraded: 1, removed: 10 });
  // Renamed by a knowledge rule, the degraded link reaches the Actor visible, read whole, and is
  // drawn so.
  expect(lensCounts(renamedArchive())).toEqual({ visible: 6, degraded: 0, removed: 10 });
});

test("rulesFired names each rule that fired once, in the strip's order", () => {
  // P1 on three elements and P3 on one, A1 on three, V2 on five: each once, perception first.
  expect(rulesFired(observationFixture)).toEqual([
    "P1 contrast",
    "P3 font size",
    "V2 viewport",
    "A1 attention",
  ]);
  expect(rulesFired(renamedArchive())).toEqual([
    "P1 contrast",
    "P3 font size",
    "V2 viewport",
    "K1 pattern",
    "A1 attention",
  ]);
  expect(rulesFired({ ...observationFixture, elements: [] })).toEqual([]);
});

/** The observation fixture with its degraded archive link renamed by K1. */
function renamedArchive(): FullObservation {
  return {
    ...observationFixture,
    elements: observationFixture.elements.map((element): ObservedElement => {
      if (element.state !== "degraded") return element;
      const { maskedName: _masked, ...rest } = element;
      return {
        ...rest,
        decisions: [...element.decisions, { stage: "knowledge", rule: "K1" }],
        renamedName: "link",
      };
    }),
  };
}
