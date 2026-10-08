/**
 * The target app's three routes to the hard goal, against the browser boxes of
 * `tasks/s1-04-target-app-routes.md` (`docs/specs/2026-10-02-s1-04-target-app-routes.md`,
 * "Acceptance mapping"). The setup follows `collect.browser.test.ts`: the app built and served on
 * a free port, every page in a fresh 1280 × 720 context, the bundled font checked. Every page is
 * collected once, at the app's defaults, for the `perceive` boxes.
 *
 * The desktop boxes of `tasks/s1-03-knowledge-attention.md` run on the same pages
 * (`docs/specs/2026-10-03-s1-03-knowledge-attention.md`, "Tests on real pages"): Kai reads the
 * kebab on `/account` by its bare role, the kebab detector fires there and not on `/settings`,
 * Zoya and Kai stay under their attention caps, and A1 never cuts Vera's route A (#89). For
 * s1-03, the same Actor text twice and a smaller cap showing a subset are `attention.test.ts`'s:
 * `perceive` is pure, so a real page adds nothing to them.
 *
 * The K2 boxes of `tasks/s1-05-vocabulary.md` run on `/settings/data` with the target app's jargon
 * list (`docs/specs/2026-10-05-s1-05-vocabulary.md`, "Acceptance mapping"): Kai reads the ledger
 * as `[unfamiliar term]`, and the decision names the term and leaves the state alone. The
 * five-persona test of the same Actor text twice is here, not in `attention.test.ts`, because
 * s1-05's box needs it with K2 firing on a real page: the fixture holds no term on the list.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type Bbox,
  FullObservation,
  type PageMeasurement,
  type Profile,
  worstState,
} from "@wayford/core";
import { profileFixture, profileFixtures, targetAppJargon } from "@wayford/core/fixtures";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { collect } from "./collect.js";
import { detectPattern, isKebab } from "./knowledge.js";
import { perceive } from "./perceive.js";
import {
  serveTargetApp,
  TARGET_APP_DEFAULT_QUERY,
  TARGET_APP_PATHS,
  type TargetApp,
} from "./serve-target-app.js";
import {
  actorText,
  K1_K4,
  observed,
  PERSONA_IDS,
  seeds,
  WITH_JARGON,
  withKnowledge,
} from "./test-support.js";
import { UNFAMILIAR } from "./vocabulary.js";

const ARCHIVE = "/deliveries/archive";
const HARD_LINK = "main//link:Order archive";
/** Route A's home step: the nav link "Deliveries" on `/`. */
const NAV_DELIVERIES = "banner/navigation:Main//link:Deliveries";
/** Route B's entrance, on `/account`, and route C's, on `/settings`. */
const KEBAB = "main//button:More options";
const YOUR_DATA = "main//link:Your data";
const ENTRANCES = [
  ["/account", KEBAB],
  ["/settings", YOUR_DATA],
] as const;
const SEEDS = seeds(100);

let app: TargetApp;
let browser: Browser;
const measured = new Map<string, PageMeasurement>();

beforeAll(async () => {
  browser = await chromium.launch().catch((error: unknown) => {
    throw new Error(
      "Chromium did not launch. If it is not installed, run " +
        "`pnpm --filter @wayford/filter exec playwright install --only-shell chromium`.",
      { cause: error },
    );
  });
  app = await serveTargetApp();
}, 60_000);

// Its own hook and timeout, so seven page loads do not share the build's budget.
beforeAll(async () => {
  for (const path of TARGET_APP_PATHS) {
    measured.set(
      path,
      await withPage(`${path}${TARGET_APP_DEFAULT_QUERY}`, (page) => collect(page)),
    );
  }
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await app?.close();
}, 60_000);

async function withPage<T>(url: string, use: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    await page.goto(app.origin + url);
    // A font that failed to load falls back to a system one, and the page would be measured in it.
    const inter = await page.evaluate(() => document.fonts.check('16px "Inter"'));
    expect(inter, `the bundled Inter font on ${url}`).toBe(true);
    return await use(page);
  } finally {
    await context.close();
  }
}

function measurement(path: string): PageMeasurement {
  const found = measured.get(path);
  if (!found) throw new Error(`${path} was not collected`);
  return found;
}

function element(path: string, key: string) {
  const found = measurement(path).elements.find((e) => e.key === key);
  if (!found) throw new Error(`No measured element ${key} on ${path}`);
  return found;
}

const decisions = (full: FullObservation, key: string) => observed(full, key).decisions;

/** True when the element carries `rule` with the state `invisible`. */
const removedBy = (full: FullObservation, key: string, rule: "P1" | "P3" | "P4") =>
  decisions(full, key).some(
    (d) => d.stage === "perception" && d.rule === rule && d.state === "invisible",
  );

test("TARGET_APP_PATHS equals the paths in target-app's PAGES", () => {
  // Read as text: filter may not import target-app (`biome.json`).
  const file = fileURLToPath(new URL("../../target-app/src/pages.ts", import.meta.url));
  const source = readFileSync(file, "utf8");
  const start = source.indexOf("export const PAGES");
  expect(start, "PAGES in pages.ts").toBeGreaterThanOrEqual(0);
  const list = source.slice(start, source.indexOf("];", start));
  const paths = [...list.matchAll(/path: "([^"]+)"/g)].map((match) => match[1]);
  expect(paths).toStrictEqual([...TARGET_APP_PATHS]);
});

test("route B: the kebab opens its menu, and Past orders reaches the archive", async () => {
  await withPage(`/account${TARGET_APP_DEFAULT_QUERY}`, async (page) => {
    const kebab = page.getByRole("button", { name: "More options" });
    const pastOrders = page.getByRole("menuitem", { name: "Past orders" });
    await expect.poll(() => kebab.getAttribute("aria-expanded")).toBe("false");
    expect(await pastOrders.isVisible(), "Past orders before the click").toBe(false);
    await kebab.click();
    await expect.poll(() => kebab.getAttribute("aria-expanded")).toBe("true");
    expect(await pastOrders.isVisible(), "Past orders after the click").toBe(true);
    await pastOrders.click();
    await page.waitForURL(`**${ARCHIVE}`);
    expect(new URL(page.url()).pathname).toBe(ARCHIVE);
  });
});

test("the closed menu's entries are not measured", () => {
  const { elements } = measurement("/account");
  expect(element("/account", KEBAB).key).toBe(KEBAB);
  expect(elements.filter((e) => e.role === "menuitem").map((e) => e.key)).toStrictEqual([]);
});

/** True when two boxes share more than an edge. Boxes that only touch do not overlap. */
function overlaps(a: Bbox, b: Bbox, epsilon = 0.5): boolean {
  return (
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > epsilon &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > epsilon
  );
}

test("the open kebab menu covers nothing the filter measures", async () => {
  await withPage(`/account${TARGET_APP_DEFAULT_QUERY}`, async (page) => {
    await page.getByRole("button", { name: "More options" }).click();
    const { elements, viewport } = await collect(page);
    const items = elements.filter((e) => e.role === "menuitem");
    const others = elements.filter((e) => e.role !== "menuitem");
    // Not vacuous: the open menu's entries are measured, Past orders among them.
    expect(items.map((e) => e.key)).toContain("main//menuitem:Past orders");
    for (const item of items) {
      for (const other of others) {
        expect(overlaps(item.bbox, other.bbox), `${other.key} under ${item.key}`).toBe(false);
      }
    }
    // A click at an element's centre, the way the Actor clicks, lands on the element itself.
    // `bbox` is in viewport coordinates and nothing scrolled since `collect`, so the centre is
    // the point `elementFromPoint` takes. Centres outside the viewport have nothing to hit.
    const centres = elements
      .map(({ key, bbox }) => ({
        key,
        bbox,
        x: bbox.x + bbox.width / 2,
        y: bbox.y + bbox.height / 2,
      }))
      .filter(({ x, y }) => x >= 0 && y >= 0 && x < viewport.width && y < viewport.height);
    expect(centres.length, "centres in the viewport").toBeGreaterThan(items.length);
    const hits = await page.evaluate((points) => {
      // The hit, or one of its ancestors, must be the element: the one whose box is `bbox`.
      const same = (r: DOMRect, b: (typeof points)[number]["bbox"]) =>
        Math.abs(r.x - b.x) < 0.5 &&
        Math.abs(r.y - b.y) < 0.5 &&
        Math.abs(r.width - b.width) < 0.5 &&
        Math.abs(r.height - b.height) < 0.5;
      return points.map(({ key, bbox, x, y }) => {
        let hit = document.elementFromPoint(x, y);
        const landed = hit?.outerHTML.slice(0, 80) ?? "nothing";
        while (hit && !same(hit.getBoundingClientRect(), bbox)) hit = hit.parentElement;
        return { key, found: hit !== null, landed };
      });
    }, centres);
    for (const { key, found, landed } of hits) {
      expect(found, `the centre of ${key} lands on ${landed}`).toBe(true);
    }
  });
});

test("route C: Your data, then Fulfilment ledger, reaches the archive", async () => {
  await withPage(`/settings${TARGET_APP_DEFAULT_QUERY}`, async (page) => {
    await page.getByRole("link", { name: "Your data" }).click();
    await page.waitForURL("**/settings/data");
    await page.getByRole("link", { name: "Fulfilment ledger" }).click();
    await page.waitForURL(`**${ARCHIVE}`);
    expect(new URL(page.url()).pathname).toBe(ARCHIVE);
  });
});

test("the entrances measure a target from 24 to 31 px", () => {
  for (const [path, key] of ENTRANCES) {
    const targetPx = element(path, key).metrics.targetPx ?? Number.NaN;
    expect(targetPx, `${key} on ${path}`).toBeGreaterThanOrEqual(24);
    expect(targetPx, `${key} on ${path}`).toBeLessThanOrEqual(31);
  }
});

test("/settings/data passes AA on every measured metric", () => {
  const { elements } = measurement("/settings/data");
  const controls = elements.filter((e) => e.kind === "control");
  // Not vacuous: the page has controls and text blocks, the ledger among them.
  expect(controls.length, "controls").toBeGreaterThan(0);
  expect(elements.length - controls.length, "text blocks").toBeGreaterThan(0);
  expect(elements.map((e) => e.key)).toContain("main//link:Fulfilment ledger");
  for (const { key, kind, metrics } of elements) {
    if (metrics.fontPx !== undefined) expect(metrics.contrast, `${key} contrast`).toBeDefined();
    if (metrics.contrast !== undefined) {
      expect(metrics.contrast, `${key} contrast`).toBeGreaterThanOrEqual(4.5);
    }
    if (kind === "control") {
      expect(metrics.targetPx ?? 0, `${key} target`).toBeGreaterThanOrEqual(24);
    }
  }
});

test("Kai: no perception decision on any page, seeds 1 to 100", () => {
  const kai = profileFixture("prof_kai");
  for (const path of TARGET_APP_PATHS) {
    expect(measurement(path).elements.length, `elements on ${path}`).toBeGreaterThan(0);
    for (const seed of SEEDS) {
      const cut = perceive(measurement(path), kai, seed)
        .elements.filter((e) => e.decisions.some((d) => d.stage === "perception"))
        .map((e) => e.key);
      expect(cut, `${path}, seed ${seed}`).toStrictEqual([]);
    }
  }
});

test("Vera: P4 on both entrances, invisible, seeds 1 to 100", () => {
  const vera = profileFixture("prof_vera");
  for (const seed of SEEDS) {
    for (const [path, key] of ENTRANCES) {
      expect(
        removedBy(perceive(measurement(path), vera, seed), key, "P4"),
        `${key}, seed ${seed}`,
      ).toBe(true);
    }
  }
});

test("Vera with a hard contrast cut of 3.0 loses all three routes, seeds 1 to 100", () => {
  const vera = profileFixture("prof_vera");
  const hard: Profile = {
    ...vera,
    perception: {
      ...vera.perception,
      contrast: { threshold: 3, provenance: vera.perception.contrast?.provenance ?? "wcag22" },
    },
  };
  for (const seed of SEEDS) {
    const deliveries = perceive(measurement("/deliveries"), hard, seed);
    expect(removedBy(deliveries, HARD_LINK, "P1"), `${HARD_LINK}, seed ${seed}`).toBe(true);
    for (const [path, key] of ENTRANCES) {
      expect(
        removedBy(perceive(measurement(path), hard, seed), key, "P4"),
        `${key}, seed ${seed}`,
      ).toBe(true);
    }
  }
});

// ---------------------------------------------------------------------------
// s1-03: knowledge and attention on the real pages
// ---------------------------------------------------------------------------

const shown = (full: FullObservation) => full.elements.filter((e) => e.state !== "invisible");
const cutByA1 = (full: FullObservation) =>
  full.elements.filter((e) => e.decisions.some((d) => d.stage === "attention" && d.rule === "A1"));
/** A box's position as the Actor text gives it: its top-left corner, rounded. */
const position = ({ x, y }: Bbox) => `${Math.round(x)},${Math.round(y)}`;

test('Kai reads the kebab on /account as button "button", 10th of 16 inside his cap of 11', () => {
  const kai = profileFixture("prof_kai");
  const ada = profileFixture("prof_ada");
  expect(kai.knowledge.unknownPatterns).toContain("kebab");
  expect(ada.knowledge.unknownPatterns).not.toContain("kebab");
  expect(kai.behaviour.maxElements).toBe(11);
  const at = position(element("/account", KEBAB).bbox);
  for (const seed of SEEDS) {
    const full = perceive(measurement("/account"), kai, seed);
    const kebab = observed(full, KEBAB);
    // Salience order puts it 10th of the page's 16, so A1 keeps it: shown, under its bare role.
    expect(full.elements, `seed ${seed}`).toHaveLength(16);
    expect(full.elements.indexOf(kebab), `seed ${seed}`).toBe(9);
    expect(full.hiddenCount, `seed ${seed}`).toBe(5);
    expect(kebab.decisions, `seed ${seed}`).toStrictEqual(K1_K4);
    expect(kebab.state, `seed ${seed}`).toBe("visible");
    expect(kebab.ref, `seed ${seed}`).toBe("e10");
    expect(kebab.renamedName, `seed ${seed}`).toBe("button");
    const text = actorText(full);
    expect(text.split("\n"), `seed ${seed}`).toContain(`[e10] button "button" at ${at}`);
    expect(text, `seed ${seed}`).not.toContain("More options");
    // Ada knows the pattern and has no cap: the same control under its own name.
    const adaFull = perceive(measurement("/account"), ada, seed);
    const adaKebab = observed(adaFull, KEBAB);
    expect(adaKebab.decisions, `seed ${seed}`).toStrictEqual([]);
    expect(actorText(adaFull).split("\n"), `seed ${seed}`).toContain(
      `[${adaKebab.ref}] button "More options" at ${at}`,
    );
  }
});

test("the kebab detector fires on /account, on the kebab alone, and on no element of /settings", () => {
  // What it reads: a button that draws no text and whose markup says it opens a menu.
  const kebab = element("/account", KEBAB);
  expect(kebab.metrics.fontPx).toBeUndefined();
  expect(kebab.hasPopup).toBe("menu");
  expect(kebab.controls).toBe("menu");
  // The hamburger is tried first, so this also says it does not fire on the desktop kebab.
  expect(detectPattern(kebab)).toBe("kebab");
  expect(
    measurement("/account")
      .elements.filter(isKebab)
      .map((e) => e.key),
  ).toStrictEqual([KEBAB]);
  const settings = measurement("/settings").elements;
  // Not vacuous: `/settings` has buttons for the detector to turn down.
  expect(settings.filter((e) => e.role === "button").length, "buttons").toBeGreaterThan(0);
  expect(settings.filter(isKebab).map((e) => e.key)).toStrictEqual([]);
});

test("Kai on /settings/data: 11 shown, 7 cut by A1, seeds 1 to 100", () => {
  // The box of `tasks/s1-03-knowledge-attention.md`, shown ≤ cap and A1 accounting for every
  // hide, here and for Zoya below: the counts are exact, and the parse holds `hiddenCount` to the
  // elements with an attention decision, which perceive only ever makes A1.
  const kai = profileFixture("prof_kai");
  expect(kai.behaviour.maxElements).toBe(11);
  for (const seed of SEEDS) {
    const at = `seed ${seed}`;
    const full = FullObservation.parse(perceive(measurement("/settings/data"), kai, seed));
    expect(shown(full), at).toHaveLength(11);
    expect(full.hiddenCount, at).toBe(7);
    // Kai has no perception threshold and the page fits the viewport: A1 is all that hides.
    for (const element of cutByA1(full)) {
      expect(element.decisions, `${at}: ${element.key}`).toStrictEqual([
        { stage: "attention", rule: "A1" },
      ]);
    }
  }
});

test("Zoya on /: P3 leaves her 1, so her cap of 5 cuts nothing, seeds 1 to 100", () => {
  const zoya = profileFixture("prof_zoya");
  expect(zoya.behaviour.maxElements).toBe(5);
  for (const seed of SEEDS) {
    const at = `seed ${seed}`;
    const full = FullObservation.parse(perceive(measurement("/"), zoya, seed));
    expect(shown(full), at).toHaveLength(1);
    expect(full.hiddenCount, at).toBe(0);
    // The rest is her 24 px font cut's, not her attention's.
    for (const element of full.elements.filter((e) => e.state === "invisible")) {
      expect(removedBy(full, element.key, "P3"), `${at}: ${element.key}`).toBe(true);
    }
  }
});

test("Zoya on / with her perception thresholds removed: 5 shown, 12 cut by A1, seeds 1 to 100", () => {
  // Her real profile leaves her cap nothing to cut (above). With no thresholds every element of
  // `/` is a candidate, so the cap alone decides what she reads first.
  const zoya = profileFixture("prof_zoya");
  const unfiltered: Profile = { ...zoya, perception: { emulation: zoya.perception.emulation } };
  expect(zoya.behaviour.maxElements).toBe(5);
  for (const seed of SEEDS) {
    const at = `seed ${seed}`;
    const full = FullObservation.parse(perceive(measurement("/"), unfiltered, seed));
    expect(shown(full), at).toHaveLength(5);
    expect(full.hiddenCount, at).toBe(12);
  }
});

test("#89 holds on headroom: / and /deliveries measure at most Vera's cap of 20", () => {
  // At most 20 elements, so Vera's cap of 20 cannot cut on either page. Should a page grow past
  // it, A1 can cut there, and the #89 test below must be read again on rank, not on headroom.
  const cap = profileFixture("prof_vera").behaviour.maxElements;
  if (cap === undefined) throw new Error("Vera sets an attention cap");
  expect(cap).toBe(20);
  for (const path of ["/", "/deliveries"]) {
    expect(
      measurement(path).elements.length,
      `${path} measures more than Vera's cap: #89 no longer holds on headroom`,
    ).toBeLessThanOrEqual(cap);
  }
});

test("#89: A1 never cuts Vera's Order archive or nav Deliveries where perception shows them", () => {
  // Her own profile, then her contrast threshold from 1.0 to 8.0 in steps of 0.25, softness kept.
  const vera = profileFixture("prof_vera");
  const contrast = vera.perception.contrast;
  if (!contrast) throw new Error("Vera sets a contrast threshold");
  const swept = Array.from({ length: 29 }, (_, i) => 1 + i * 0.25).map(
    (threshold) =>
      [
        threshold.toFixed(2),
        { ...vera, perception: { ...vera.perception, contrast: { ...contrast, threshold } } },
      ] as const,
  );
  const profiles = [["her own", vera] as const, ...swept];
  const steps = [
    ["/", NAV_DELIVERIES],
    ["/deliveries", HARD_LINK],
  ] as const;
  for (const [path, key] of steps) {
    let shownAtOne = 0;
    const cut: string[] = [];
    for (const [label, profile] of profiles) {
      for (const seed of seeds(1000)) {
        const target = observed(perceive(measurement(path), profile, seed), key);
        // Removed by stages 1 to 3: A1 never ranks it.
        const before = target.decisions.filter((d) => d.stage !== "attention");
        if (worstState(before) === "invisible") continue;
        if (label === "1.00") shownAtOne += 1;
        if (target.decisions.some((d) => d.stage === "attention")) cut.push(`${label}, ${seed}`);
      }
    }
    // Not vacuous: at a contrast threshold of 1.0 perception shows both, so A1 had its chance.
    expect(shownAtOne, `${key} shown by perception at threshold 1.0`).toBeGreaterThan(0);
    expect(cut, `${key} cut by A1 (threshold, seed)`).toStrictEqual([]);
  }
}, 60_000);

// ---------------------------------------------------------------------------
// s1-05: vocabulary (K2) on the real page
// ---------------------------------------------------------------------------

const DATA = "/settings/data";
const LEDGER = "main//link:Fulfilment ledger";

/** Kai with `words` added to his vocabulary. */
function kaiKnowing(...words: string[]): Profile {
  const kai = profileFixture("prof_kai");
  const known = kai.knowledge.domainVocabulary ?? [];
  return withKnowledge(kai, { domainVocabulary: [...known, ...words] });
}

test("K2: Kai reads the ledger as [unfamiliar term], Ada and a full vocabulary read it whole", () => {
  expect(targetAppJargon).toStrictEqual(["Fulfilment ledger"]);
  const kai = profileFixture("prof_kai");
  // Not vacuous: neither word is in his vocabulary.
  for (const word of ["fulfilment", "ledger"]) {
    expect(kai.knowledge.domainVocabulary, word).not.toContain(word);
  }
  const at = position(element(DATA, LEDGER).bbox);
  const readers = [
    ["Ada", profileFixture("prof_ada")],
    ["Kai knowing both words", kaiKnowing("fulfilment", "ledger")],
    ["Kai knowing the phrase", kaiKnowing("fulfilment ledger")],
  ] as const;
  for (const seed of SEEDS) {
    const full = perceive(measurement(DATA), kai, seed, WITH_JARGON);
    const ledger = observed(full, LEDGER);
    const text = actorText(full);
    expect(text.split("\n"), `Kai, seed ${seed}`).toContain(
      `[${ledger.ref}] link "${UNFAMILIAR}" at ${at}`,
    );
    expect(text, `Kai, seed ${seed}`).not.toContain("Fulfilment");
    for (const [label, profile] of readers) {
      const whole = perceive(measurement(DATA), profile, seed, WITH_JARGON);
      const read = observed(whole, LEDGER);
      const wholeText = actorText(whole);
      expect(wholeText.split("\n"), `${label}, seed ${seed}`).toContain(
        `[${read.ref}] link "Fulfilment ledger" at ${at}`,
      );
      expect(wholeText, `${label}, seed ${seed}`).not.toContain(UNFAMILIAR);
      expect(read.decisions, `${label}, seed ${seed}`).toStrictEqual([]);
    }
  }
});

test("K2 is recorded with its terms and leaves the state alone", () => {
  const kai = profileFixture("prof_kai");
  for (const seed of SEEDS) {
    const at = `seed ${seed}`;
    const without = perceive(measurement(DATA), kai, seed);
    const full = FullObservation.parse(perceive(measurement(DATA), kai, seed, WITH_JARGON));
    const ledger = observed(full, LEDGER);
    expect(ledger.decisions, at).toStrictEqual([
      { stage: "knowledge", rule: "K2", terms: ["Fulfilment ledger"] },
    ]);
    expect(ledger.renamedName, at).toBe(UNFAMILIAR);
    expect(ledger.state, at).toBe("visible");
    expect("maskedName" in ledger, at).toBe(false);
    // The ledger is the one element K2 renames on the page.
    expect(
      full.elements.filter((e) => e.decisions.some((d) => d.rule === "K2")).map((e) => e.key),
      at,
    ).toStrictEqual([LEDGER]);
    // Every element's place, state and ref as without the list; A1 cuts the same 7.
    const states = (o: FullObservation) => o.elements.map((e) => [e.key, e.state, e.ref]);
    expect(states(full), at).toStrictEqual(states(without));
    expect(shown(full), at).toHaveLength(11);
    expect(full.hiddenCount, at).toBe(7);
    expect(full.belowFoldCount, at).toBe(without.belowFoldCount);
  }
});

test("five personas, seeds 1 to 100, the same Actor text twice on /settings/data", () => {
  expect(profileFixtures.map((p) => p.id)).toStrictEqual(PERSONA_IDS);
  for (const profile of profileFixtures) {
    for (const seed of SEEDS) {
      const at = `${profile.id}, seed ${seed}`;
      const first = perceive(measurement(DATA), profile, seed, WITH_JARGON);
      const second = perceive(measurement(DATA), profile, seed, WITH_JARGON);
      expect(actorText(second), at).toBe(actorText(first));
      expect(JSON.stringify(second), at).toBe(JSON.stringify(first));
    }
  }
});
