import type { Profile } from "@wayford/core";
import { profileFixture, profileFixtures } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Avatar } from "./avatar.js";
import { AVATAR_STATES, type AvatarState, STATE_WORDS } from "./state.js";

function render(profile: Profile): string {
  return renderToStaticMarkup(<Avatar profile={profile} />);
}

function renderAt(profile: Profile, state: AvatarState): string {
  return renderToStaticMarkup(<Avatar profile={profile} state={state} />);
}

/** Vera with only her contrast threshold moved: her softness and provenance stay. */
function veraAt(threshold: number): Profile {
  const vera = profileFixture("prof_vera");
  const { contrast } = vera.perception;
  if (!contrast) throw new Error("Vera sets a contrast threshold");
  return { ...vera, perception: { ...vera.perception, contrast: { ...contrast, threshold } } };
}

/** No fixture holds a tablet, so a copy of Ada does, to reach the third held part. */
function tabletAda(): Profile {
  return { ...profileFixture("prof_ada"), device: "tablet" };
}

/** The `stroke-width` the glasses' group carries, read off its own tag. */
function glassesStrokeWidth(profile: Profile): string | undefined {
  return render(profile).match(/<g data-part="glasses"[^>]* stroke-width="([^"]*)"/)?.[1];
}

/** Ada with only her time budget moved. */
function adaWithBudget(budgetSeconds: number): Profile {
  const ada = profileFixture("prof_ada");
  return { ...ada, behaviour: { ...ada.behaviour, budgetSeconds } };
}

/** The hourglass's top bulb and its sand, each as the `d` of its path. */
function bulbAndSand(profile: Profile): { topBulb: string; sand: string } {
  const group = render(profile).match(/<g data-part="hourglass">(.*?)<\/g>/)?.[1] ?? "";
  // The group draws the glass, both bulbs in one path with the top one first, then the sand, then
  // the glass's outline.
  const [glass = "", sand = ""] = [...group.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1]);
  return { topBulb: glass.slice(0, glass.indexOf(" M")), sand };
}

/** The height of a path such as "M122 9 L152 9 L137 37 Z": its lowest y less its highest. */
function heightOf(d: string): number {
  const ys = [...d.matchAll(/[\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
  return Math.max(...ys) - Math.min(...ys);
}

/** The text of the `<title>`, found only when it is the first child of the `<svg>`. */
function titleOf(svg: string): string | undefined {
  return svg.match(/^<svg [^>]*><title>([^<]*)<\/title>/)?.[1];
}

test("the same profile renders the same SVG string twice", () => {
  for (const profile of profileFixtures) {
    const first = render(profile);
    expect(render(profile), profile.label).toBe(first);
    // A copy has none of the original's object identity, so only the values can shape the SVG.
    expect(render(structuredClone(profile)), profile.label).toBe(first);
  }
});

test("Ada and Vera render different SVGs", () => {
  expect(render(profileFixture("prof_ada"))).not.toBe(render(profileFixture("prof_vera")));
});

test("the glasses' stroke width follows the contrast threshold", () => {
  const thin = glassesStrokeWidth(veraAt(3));
  const thick = glassesStrokeWidth(veraAt(7));
  expect(thin).toBe("2.5");
  expect(thick).toBe("4.5");
  expect(Number(thick)).toBeGreaterThan(Number(thin));
});

test("Milo holds a phone", () => {
  const milo = render(profileFixture("prof_milo"));
  expect(milo).toContain('data-part="phone"');
  const ada = render(profileFixture("prof_ada"));
  expect(ada).not.toContain('data-part="phone"');
  expect(ada).not.toContain('data-part="tablet"');
  expect(ada).not.toContain('data-part="glasses"');
});

test("the sand's area is the patience share of the top bulb", () => {
  // 300 s fills the top bulb (`parts.ts`), so the sand is the whole bulb.
  const full = bulbAndSand(adaWithBudget(300));
  expect(full.sand).toBe(full.topBulb);
  // 75 s gives a patience of 0.25. A triangle's area goes with the square of its height, so a
  // quarter of the bulb's area is half its height.
  const quarter = bulbAndSand(adaWithBudget(75));
  expect(heightOf(quarter.sand)).toBe(heightOf(quarter.topBulb) / 2);
});

test("the title names the drawn parts", () => {
  expect(titleOf(render(profileFixture("prof_vera")))).toBe(
    "Glasses for a contrast threshold of 3:1. Hourglass for a budget of 120 s.",
  );
  expect(titleOf(render(profileFixture("prof_milo")))).toBe(
    "Phone in hand for a mobile device. Hourglass for a budget of 90 s.",
  );
  expect(titleOf(render(profileFixture("prof_ada")))).toBe("Hourglass for a budget of 120 s.");
  const tablet = render(tabletAda());
  expect(tablet).toContain('data-part="tablet"');
  expect(titleOf(tablet)).toBe(
    "Tablet in hand for a tablet device. Hourglass for a budget of 120 s.",
  );
});

/** Every avatar the tests know: each fixture and tablet Ada, without a state and in every state. */
function everyAvatar(): { name: string; svg: string }[] {
  return [...profileFixtures, tabletAda()].flatMap((profile) => {
    const name = profile.device === "tablet" ? "tablet Ada" : profile.label;
    return [
      { name, svg: render(profile) },
      ...AVATAR_STATES.map((state) => ({
        name: `${name}, ${state}`,
        svg: renderAt(profile, state),
      })),
    ];
  });
}

/** The only colours an avatar may name: its slot's and the avatar tokens, the eyes' white, none. */
const AVATAR_COLOURS = [
  "var(--p)",
  "var(--p-ink)",
  "var(--avatar-line)",
  "var(--avatar-head)",
  "white",
  "none",
];

test("the markup holds no colour literal, only the avatar's CSS variables, white and none", () => {
  for (const { name, svg } of everyAvatar()) {
    expect(svg, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(/);
    const colours = [...svg.matchAll(/\s(?:fill|stroke)="([^"]*)"/g)].map((m) => m[1]);
    // The background disc, the body and the head carry both, so an empty list is a broken match.
    expect(colours.length, name).toBeGreaterThan(0);
    for (const colour of colours) expect(AVATAR_COLOURS, name).toContain(colour);
  }
});

test("no id, gradient or clipPath in the markup", () => {
  // An id, and the url(#…) that points at it, must be unique on the page, so markup holding one
  // would depend on where it renders. Gradients and clip paths are reached only through ids.
  for (const profile of [...profileFixtures, tabletAda()]) {
    const svg = render(profile);
    expect(svg, profile.label).not.toMatch(/\sid="/);
    expect(svg, profile.label).not.toContain("url(");
    expect(svg, profile.label).not.toMatch(/gradient/i);
    expect(svg, profile.label).not.toMatch(/clippath/i);
  }
});

/** The `data-state` the `<svg>` carries, read off its own tag. */
function svgState(svg: string): string | undefined {
  return svg.match(/^<svg [^>]*data-state="([^"]*)"/)?.[1];
}

/** Every run-state badge in the markup, each as its whole group. */
function badgesOf(svg: string): string[] {
  return [...svg.matchAll(/<g data-part="state">.*?<\/g>/g)].map((m) => m[0]);
}

test("without a state, the avatar carries no state, badge or state sentence", () => {
  for (const profile of [...profileFixtures, tabletAda()]) {
    const svg = render(profile);
    expect(svg, profile.label).not.toContain("data-state");
    expect(svg, profile.label).not.toContain('data-part="state"');
    expect(titleOf(svg), profile.label).not.toContain("Run state");
  }
});

test("a state adds its data-state, its badge and its title sentence, and nothing else", () => {
  // So the face, and every other part, never changes with the state: a mood would diagnose the
  // persona (`docs/DEMO.md`, "Words we do not use").
  for (const profile of [...profileFixtures, tabletAda()]) {
    for (const state of AVATAR_STATES) {
      const stripped = renderAt(profile, state)
        .replace(` data-state="${state}"`, "")
        .replace(/<g data-part="state">.*?<\/g>/, "")
        .replace(` Run state: ${STATE_WORDS[state].toLowerCase()}.`, "");
      expect(stripped, `${profile.label}, ${state}`).toBe(render(profile));
    }
  }
});

test("each state sets data-state on the svg, idle included", () => {
  const vera = profileFixture("prof_vera");
  for (const state of AVATAR_STATES) expect(svgState(renderAt(vera, state))).toBe(state);
});

test("idle draws no badge, and every other state draws exactly one", () => {
  const vera = profileFixture("prof_vera");
  for (const state of AVATAR_STATES) {
    expect(badgesOf(renderAt(vera, state)), state).toHaveLength(state === "idle" ? 0 : 1);
  }
});

test("each state's badge differs from every other's, and holds no id", () => {
  const vera = profileFixture("prof_vera");
  const badges = AVATAR_STATES.filter((state) => state !== "idle").map(
    (state) => badgesOf(renderAt(vera, state))[0] ?? "",
  );
  expect(new Set(badges).size).toBe(badges.length);
  for (const badge of badges) {
    expect(badge).not.toMatch(/\sid="/);
    expect(badge).not.toContain("url(");
  }
});

test("the title's last sentence names the run state", () => {
  const vera = profileFixture("prof_vera");
  const persona = "Glasses for a contrast threshold of 3:1. Hourglass for a budget of 120 s.";
  expect(AVATAR_STATES.map((state) => titleOf(renderAt(vera, state)))).toStrictEqual([
    `${persona} Run state: waiting.`,
    `${persona} Run state: moving.`,
    `${persona} Run state: stuck.`,
    `${persona} Run state: done.`,
    `${persona} Run state: gave up.`,
    `${persona} Run state: error.`,
  ]);
});

test("the same profile and state render the same SVG string twice", () => {
  for (const profile of profileFixtures) {
    for (const state of AVATAR_STATES) {
      const first = renderAt(profile, state);
      expect(renderAt(profile, state), `${profile.label}, ${state}`).toBe(first);
      expect(renderAt(structuredClone(profile), state), `${profile.label}, ${state}`).toBe(first);
    }
  }
});
