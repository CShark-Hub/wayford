/**
 * The preview screen through the app's own router, against "Screen" and "Acceptance mapping" in
 * `docs/specs/2026-10-01-s3-01-preview.md`. Each test loads a URL into a memory history and
 * renders the page with `renderToStaticMarkup`, as `router.test.tsx` does: what a copied link
 * opens with, read off the markup, with no DOM library.
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
import { METRIC_NAMES, type Profile } from "@wayford/core";
import { measurementFixture, profileFixture, profileFixtures } from "@wayford/core/fixtures";
import { perceive } from "@wayford/filter/perceive";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import {
  attributesOf,
  captionOf,
  type Drawn,
  drawnBoxes,
  shownElements,
  textOf,
  withoutNested,
} from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";

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

/** What `router` shows now: the shell and the matched screen, inside a fresh query client. */
function renderRouter(router: AppRouter): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** The page at `path`. The spy is cleared first, so it holds this render's calls alone. */
async function render(path: string): Promise<string> {
  const router = await routerAt(path);
  perceiveSpy.mockClear();
  return renderRouter(router);
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

/**
 * The content of the first `<tag>` whose start tag holds `attribute`, up to the first `</tag>`
 * after it. Every element read this way holds none of its own tag, and one that does throws.
 */
function elementOf(html: string, tag: string, attribute: string): string {
  const pattern = new RegExp(`<${tag}(?=[^>]*\\s${attribute})[^>]*>(.*?)</${tag}>`, "s");
  const inner = html.match(pattern)?.[1];
  if (inner === undefined) throw new Error(`No <${tag} ${attribute}>`);
  return withoutNested(tag, inner);
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

/** The View control's buttons, each name to its `aria-pressed`. */
function viewOf(html: string): Record<string, string | undefined> {
  const group = elementOf(html, "fieldset", 'aria-label="View"');
  return Object.fromEntries(
    [...group.matchAll(/<button(\s[^>]*)?>(.*?)<\/button>/gs)].map((m) => [
      textOf(withoutHidden(m[2] ?? "")),
      attributesOf(m[1] ?? "")["aria-pressed"],
    ]),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const VERA = "/preview?persona=prof_vera&seed=1";

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
  // persona at its own values is the persona, and moved sliders are the values the URL names.
  const moved: Pick<Profile, "perception"> = {
    perception: {
      contrast: { threshold: 4.5, softness: 0.6, provenance: "folk" },
      fontPx: { threshold: 18, softness: 0.25, provenance: "folk" },
      targetPx: { threshold: 40, softness: 0.5, provenance: "folk" },
      emulation: vera.perception.emulation,
    },
  };
  const cases: { url: string; profile: Pick<Profile, "perception">; seed: number }[] = [
    ...profileFixtures.map((profile) => ({
      url: `/preview?persona=${profile.id}&seed=1`,
      profile,
      seed: 1,
    })),
    {
      url: "/preview?persona=prof_vera&seed=7&contrast=4.5&contrastSoftness=0.6&fontPx=18&fontPxSoftness=0.25&targetPx=40&targetPxSoftness=0.5",
      profile: moved,
      seed: 7,
    },
  ];
  for (const { url, profile, seed } of cases) {
    const expected = realPerceive(measurementFixture, profile, seed);
    const html = await render(url);
    expect(drawnBoxes(html), url).toEqual(shownElements(expected));
    // The screen perceives the stored page itself, on the URL's seed.
    expect(perceiveSpy.mock.calls.length, url).toBeGreaterThan(0);
    for (const [measurement, , callSeed] of perceiveSpy.mock.calls) {
      expect(measurement, url).toStrictEqual(measurementFixture);
      expect(callSeed, url).toBe(seed);
    }
  }
  // The moved URL holds every state, so the comparison cannot pass on a page with nothing removed
  // or nothing degraded.
  const states = new Set(realPerceive(measurementFixture, moved, 7).elements.map((e) => e.state));
  expect([...states].sort()).toEqual(["degraded", "invisible", "visible"]);
});

test("with no seed in the URL, the seed slider reads 1 and every perceive call gets 1", async () => {
  // The seed is defaulted when the URL resolves, not written into it, so this URL renders as it is.
  const router = await routerAt("/preview?persona=prof_vera");
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
    "/preview?persona=prof_vera&seed=7",
    "/preview?persona=prof_vera&seed=7&contrast=2&fontPxSoftness=0.5",
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
    "/preview?persona=prof_zoya&seed=7&contrast=2.5&contrastSoftness=0.2&fontPx=20&targetPx=40&targetPxSoftness=0.1&evidence=true",
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
  // And the drawing is the one those values give.
  const profile: Pick<Profile, "perception"> = {
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
  const html = await render("/preview?persona=prof_ada&seed=1");
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
  for (const url of [VERA, "/preview?persona=prof_ada&seed=1"]) {
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

test("Perceived and Evidence carry aria-pressed in both views", async () => {
  expect(viewOf(await render(VERA))).toEqual({ Perceived: "true", Evidence: "false" });
  const evidence = await render(`${VERA}&evidence=true`);
  expect(viewOf(evidence)).toEqual({ Perceived: "false", Evidence: "true" });
  // The evidence view outlines what perception removed; the perceived view does not.
  expect(evidence).toContain("data-removed");
  expect(await render(VERA)).not.toContain("data-removed");
});

test("the caption names whose thresholds, and says edited once they move", async () => {
  expect(captionOf(await render(VERA))).toBe(
    "The page as perceive returns it for Vera's thresholds, seed 1.",
  );
  expect(captionOf(await render(`${VERA}&contrast=2`))).toBe(
    "The page as perceive returns it for Vera's thresholds, edited, seed 1.",
  );
});

test("with every threshold at its maximum nothing is drawn", async () => {
  const html = await render(
    `${VERA}&contrast=21&contrastSoftness=0&fontPx=48&fontPxSoftness=0&targetPx=96&targetPxSoftness=0`,
  );
  expect(drawnBoxes(html)).toEqual([]);
});

test("the shell's nav has a Preview link to /preview, between Personas and Events", async () => {
  const onPreview = linksOf(elementOf(await render(VERA), "nav", 'aria-label="Main"'));
  expect(onPreview.map((link) => [link.name, link.attributes.href])).toEqual([
    ["Personas", "/personas"],
    ["Preview", "/preview"],
    ["Events", "/events"],
  ]);
  expect(onPreview[1]?.attributes["aria-current"]).toBe("page");
  const onPersonas = linksOf(elementOf(await render("/personas"), "nav", 'aria-label="Main"'));
  const preview = onPersonas.find((link) => link.name === "Preview");
  expect(preview?.attributes.href).toBe("/preview");
  expect(preview?.attributes["aria-current"]).toBeUndefined();
});

test("the persona control links every persona on the seed and view the URL holds", async () => {
  const html = await render("/preview?persona=prof_vera&seed=7&contrast=2&evidence=true");
  expect(personaLinks(html).map((link) => [link.name, link.attributes.href])).toEqual(
    profileFixtures.map((profile) => [
      profile.label,
      `/preview?persona=${profile.id}&seed=7&evidence=true`,
    ]),
  );
});
