/**
 * The phone boxes of `tasks/s1-03-knowledge-attention.md` and its route table
 * (`docs/specs/2026-10-03-s1-03-knowledge-attention.md`, "Acceptance mapping"). The target app is
 * served once, by one walk of its routes on every persona's device, and every test reads the
 * measurements that walk took. The copy of target-app's routes the walk needs is checked against
 * its source here.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DeviceKind, PageMeasurement, Profile } from "@wayford/core";
import { profileFixture, profileFixtures } from "@wayford/core/fixtures";
import { beforeAll, expect, test } from "vitest";
import { detectPattern, isHamburger, isKebab } from "./knowledge.js";
import { perceive } from "./perceive.js";
import { routeSummary, type WalkedRoute } from "./route-table.js";
import { walkRoutes } from "./route-walk.js";
import { TARGET_APP_ROUTES } from "./serve-target-app.js";
import { actorText } from "./test-support.js";

const RULES_MD = new URL("../../../docs/RULES.md", import.meta.url);
const TOGGLE = "banner//button:Menu";
const KEBAB = "main//button:More options";
const RUN_SEED = 1;

let walks: Map<DeviceKind, WalkedRoute[]>;

beforeAll(async () => {
  walks = await walkRoutes(profileFixtures.map((profile) => profile.device));
}, 120_000);

function routesOn(device: DeviceKind): WalkedRoute[] {
  const routes = walks.get(device);
  if (!routes) throw new Error(`the routes were not walked on ${device}`);
  return routes;
}

/** A page as the walk measured it, as loaded, with no control clicked first. */
function asLoaded(device: DeviceKind, page: string): PageMeasurement {
  for (const route of routesOn(device)) {
    const step = route.steps.find((s) => s.page === page && s.after.length === 0);
    if (step) return step.measurement;
  }
  throw new Error(`the walk on ${device} measured no ${page} as loaded`);
}

function element(measurement: PageMeasurement, key: string) {
  const found = measurement.elements.find((e) => e.key === key);
  if (!found) throw new Error(`No measured element ${key} on ${measurement.url}`);
  return found;
}

/** The text a block of source holds between `start` and the first `end` after it. */
function sourceBlock(path: string, start: string, end: string): string {
  const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  const from = source.indexOf(start);
  expect(from, `${start} in ${path}`).toBeGreaterThanOrEqual(0);
  return source.slice(from, source.indexOf(end, from));
}

test("TARGET_APP_ROUTES equals ROUTES in target-app's pages.ts", () => {
  // Read as text: filter may not import target-app (`biome.json`).
  const block = sourceBlock("../../target-app/src/pages.ts", "export const ROUTES", "];");
  const routes = block
    .split(/\bid: /)
    .slice(1)
    .map((chunk) => ({
      id: /^"([^"]+)"/.exec(chunk)?.[1],
      steps: [
        ...chunk.matchAll(/page:\s*"([^"]+)",\s*role:\s*"([^"]+)",\s*name:\s*"([^"]+)"/g),
      ].map(([, page, role, name]) => ({ page, role, name })),
    }));
  // Not vacuous: three routes, every one with steps.
  expect(routes.map((route) => route.steps.length)).toStrictEqual([2, 3, 3]);
  expect(routes).toStrictEqual(
    TARGET_APP_ROUTES.map(({ id, steps }) => ({ id, steps: steps.map((step) => ({ ...step })) })),
  );
});

test('on Pixel 7, Milo reads the menu toggle as "Menu"', () => {
  const home = asLoaded("mobile", "/");
  const milo = profileFixture("prof_milo");
  const text = actorText(perceive(home, milo, RUN_SEED));
  expect(text).toMatch(/^\[e\d+\] button "Menu" at /m);
  expect(text).not.toContain('button "button"');
});

test("on Pixel 7, a persona that does not know the hamburger still reads the toggle's word", () => {
  const home = asLoaded("mobile", "/");
  const milo = profileFixture("prof_milo");
  const unknown: Profile = {
    ...milo,
    knowledge: {
      ...milo.knowledge,
      knownPatterns: milo.knowledge.knownPatterns.filter((p) => p !== "hamburger"),
      unknownPatterns: [...milo.knowledge.unknownPatterns, "hamburger"],
    },
  };
  const full = perceive(home, unknown, RUN_SEED);
  // The toggle draws the word "Menu", so it is read by that word: K1 and K4 rename only a control
  // that draws no text (RULES stage 4).
  expect(element(home, TOGGLE).metrics.fontPx).toBeDefined();
  expect(actorText(full)).toMatch(/^\[e\d+\] button "Menu" at /m);
  const toggle = full.elements.find((e) => e.key === TOGGLE);
  expect(toggle?.state).toBe("visible");
  expect(toggle?.renamedName).toBeUndefined();
  expect(toggle?.decisions.filter((d) => d.stage === "knowledge")).toStrictEqual([]);
  // The walk records the toggle as a home step, shown as it is for Milo.
  const [routeA] = routesOn("mobile").map((route) => routeSummary(route, unknown));
  expect(routeA?.steps[0]).toMatchObject({
    place: "home",
    step: { page: "/", role: "button", name: "Menu" },
    outcomes: [{ value: "shown", seeds: 100 }],
  });
});

test("the hamburger detector fires on the Pixel 7 toggle, and on no other element there", () => {
  const home = asLoaded("mobile", "/");
  expect(home.elements.filter(isHamburger).map((e) => e.key)).toStrictEqual([TOGGLE]);
  expect(detectPattern(element(home, TOGGLE))).toBe("hamburger");
  // The kebab must not fire on the toggle either: `detectPattern` tries the hamburger first, so
  // only the kebab detector itself can show it.
  expect(home.elements.filter(isKebab)).toStrictEqual([]);
});

test("the hamburger detector does not fire on the kebab", () => {
  // On Pixel 7: `target-app-routes.browser.test.ts` has the desktop kebab.
  const kebab = element(asLoaded("mobile", "/account"), KEBAB);
  expect(isHamburger(kebab)).toBe(false);
  expect(detectPattern(kebab)).toBe("kebab");
});

/**
 * The route table of `docs/RULES.md`, by header name: for each persona, each route's cell up to
 * its first colon. The text after the colon is a note (`docs/RULES.md`, the route preamble).
 */
function rulesRouteTable(): Record<string, Record<string, string>> {
  const lines = readFileSync(RULES_MD, "utf8").split("\n");
  const header = lines.findIndex((line) => line.startsWith("| Route |"));
  if (header === -1) throw new Error("docs/RULES.md has no route table");
  const cells = (line: string) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
  const [, ...personas] = cells(lines[header] ?? "");
  const table: Record<string, Record<string, string>> = {};
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith("|")) break;
    const [route = "", ...row] = cells(line);
    personas.forEach((persona, i) => {
      table[persona] = { ...table[persona], [route]: beforeColon(row[i] ?? "") };
    });
  }
  return table;
}

const beforeColon = (cell: string) => cell.split(":")[0]?.trim() ?? "";

test("the walked route table matches docs/RULES.md for all five personas", () => {
  const walked: Record<string, Record<string, string>> = {};
  for (const profile of profileFixtures) {
    const summaries = routesOn(profile.device).map((route) => routeSummary(route, profile));
    walked[profile.label] = Object.fromEntries(summaries.map((s) => [s.id, beforeColon(s.cell)]));
  }
  expect(Object.keys(walked)).toStrictEqual(["Ada", "Kai", "Milo", "Vera", "Zoya"]);
  expect(walked).toStrictEqual(rulesRouteTable());
});
