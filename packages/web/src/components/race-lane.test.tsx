import { createMemoryHistory, RouterContextProvider } from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { attributesOf, classesOf, elementOf, lineOf, textOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { OUTCOME_WORDS, type OutcomeKind } from "./outcome.js";
import { type Pip, RaceLane } from "./race-lane.js";

type Props = Parameters<typeof RaceLane>[0];

/** Vera before her first step: nothing landed, nothing ended. Each test changes what it reads. */
const RUNNING: Props = {
  headingId: "race-run_vera",
  slot: "cobalt",
  avatar: <span data-avatar="Vera" />,
  name: "Vera",
  pips: [],
  place: undefined,
  shot: undefined,
  outcome: "waiting",
  clock: "—",
  steps: "0 steps so far",
  detail: undefined,
  narration: undefined,
  runId: undefined,
};

/** Vera's run as the fixture ends it: four pips, then the give-up, which makes none. */
const VERA_PIPS: Pip[] = [
  { kind: "act", word: "click" },
  { kind: "scroll", word: "scroll" },
  { kind: "act", word: "doubleClick" },
  { kind: "wasted", word: "wasted" },
];

/** Kai mid-race: one pip of each kind, the last a step under way. */
const KAI_PIPS: Pip[] = [
  { kind: "act", word: "click" },
  { kind: "scroll", word: "scroll" },
  { kind: "back", word: "back" },
  { kind: "wasted", word: "wasted" },
  { kind: "now", word: "under way" },
];

/** The lane inside the app's router, so a run link builds its href. A static render runs no effect. */
function lane(over: Partial<Props> = {}): string {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/race"] }) });
  return renderToStaticMarkup(
    <RouterContextProvider router={router}>
      <RaceLane {...RUNNING} {...over} />
    </RouterContextProvider>,
  );
}

/** The attributes of every start tag in `html` that carries `attribute`, in order. */
function tagsWith(html: string, attribute: string): Record<string, string>[] {
  const pattern = new RegExp(`<[a-z0-9]+(?=[^>]*\\s${attribute}[=\\s>])[^>]*>`, "g");
  return [...html.matchAll(pattern)].map((m) => attributesOf(m[0]));
}

/**
 * The attributes of the first `tag` whose text reads `text`. Only a `tag` holding no `tag` of its
 * own is read, so an outer span never answers for the span inside it.
 */
function tagReading(html: string, tag: string, text: string): Record<string, string> {
  const pattern = new RegExp(`<${tag}(\\s[^>]*)?>((?:(?!<${tag}[\\s>]).)*?)</${tag}>`, "gs");
  const found = [...html.matchAll(pattern)].find((m) => lineOf(m[2] ?? "") === text);
  if (found === undefined) throw new Error(`No <${tag}> reads ${text}`);
  return attributesOf(found[1] ?? "");
}

/** The track's markup: the `role="img"` box, which holds no div. */
function trackOf(html: string): string {
  return elementOf(html, "div", 'role="img"');
}

/** The track's start tag. */
function trackTag(html: string): Record<string, string> {
  const [track] = tagsWith(html, 'role="img"');
  if (track === undefined) throw new Error("No track");
  return track;
}

describe("the lane", () => {
  test("is an article its h3 names", () => {
    const html = lane();
    const article = attributesOf(html.match(/^<article[^>]*>/)?.[0] ?? "");
    expect(article["aria-labelledby"]).toBe("race-run_vera");
    expect(tagReading(html, "h3", "Vera").id).toBe("race-run_vera");
  });

  test("holds the avatar it is given, before the name", () => {
    const html = lane();
    expect(html).toContain('<span data-avatar="Vera"></span>');
    expect(html.indexOf("data-avatar")).toBeLessThan(html.indexOf("<h3"));
  });

  test.each<[string, Partial<Props>]>([
    ["its run goes on", { outcome: "moving" }],
    [
      "its stream is lost, since the run never ended",
      { outcome: "lost", detail: "Stream lost: last seen moving" },
    ],
  ])("is flat while %s", (_case, over) => {
    expect(lane(over)).not.toContain("shadow-(--shadow-raised)");
  });

  test.each<OutcomeKind>(["through", "gaveUp", "outOfTime", "stepCap", "overBudget", "error"])(
    "is raised once it ends %s",
    (outcome) => {
      const article = attributesOf(lane({ outcome }).match(/^<article[^>]*>/)?.[0] ?? "");
      expect(classesOf(article)).toContain("shadow-(--shadow-raised)");
    },
  );
});

describe("the track", () => {
  test("draws the pips in the order given, each by its kind, and nothing else as a pip", () => {
    const pips = tagsWith(trackOf(lane({ pips: KAI_PIPS })), "data-pip");
    expect(pips.map((pip) => pip["data-pip"])).toStrictEqual(KAI_PIPS.map((pip) => pip.kind));
  });

  test.each<OutcomeKind>(["gaveUp", "outOfTime", "stepCap", "overBudget", "error"])(
    "ends %s with that outcome's glyph after the pips, before the post",
    (end) => {
      const track = trackOf(lane({ pips: VERA_PIPS, outcome: end }));
      const [mark, ...more] = tagsWith(track, "data-end");
      expect(more).toStrictEqual([]);
      expect(mark?.["data-end"]).toBe(end);
      expect(track).toMatch(
        new RegExp(`<span[^>]*data-end="${end}"[^>]*><svg[^>]*data-outcome="${end}"`),
      );
      expect(track.lastIndexOf("data-pip")).toBeLessThan(track.indexOf("data-end"));
      expect(track.indexOf("data-end")).toBeLessThan(track.indexOf("data-goal"));
    },
  );

  test.each<[string, Partial<Props>]>([
    ["a run going on", { outcome: "moving" }],
    ["a lost lane, whose run never ended", { outcome: "lost" }],
    ["a run that got through", { outcome: "through", place: 1 }],
  ])("draws no end mark for %s", (_run, over) => {
    expect(trackOf(lane({ pips: VERA_PIPS, ...over }))).not.toContain("data-end");
  });

  test.each<[string, Partial<Props>, string, string]>([
    ["a run going on", { pips: KAI_PIPS }, "open", ""],
    ["a give-up, even given a place", { outcome: "gaveUp", place: 2 }, "open", ""],
    [
      "a run that got through, with no place",
      { outcome: "through", place: undefined },
      "reached",
      "",
    ],
    [
      "a run that got through 1st",
      { pips: VERA_PIPS.slice(0, 2), outcome: "through", place: 1 },
      "reached",
      "1st",
    ],
  ])("the post for %s: only a reached post carries a place", (_run, over, goal, place) => {
    const track = trackOf(lane(over));
    const [post, ...more] = tagsWith(track, "data-goal");
    expect(more).toStrictEqual([]);
    expect(post?.["data-goal"]).toBe(goal);
    expect(lineOf(track)).toBe(place);
  });

  test("is an image to assistive technology, labelled in words", () => {
    expect(trackTag(lane())).toMatchObject({ role: "img", "aria-label": "0 steps so far" });
  });

  test.each<[string, Partial<Props>, string]>([
    [
      "running, every pip by its word",
      { pips: KAI_PIPS, steps: "5 steps so far" },
      "5 steps so far: click, scroll, back, wasted, under way",
    ],
    [
      "a give-up, counted as a step",
      { pips: VERA_PIPS, outcome: "gaveUp", steps: "5 steps" },
      "5 steps: click, scroll, doubleClick, wasted, gave up",
    ],
    [
      "out of time",
      { pips: VERA_PIPS, outcome: "outOfTime", steps: "4 steps" },
      "4 steps: click, scroll, doubleClick, wasted, out of time",
    ],
    [
      "the step cap hit",
      { pips: VERA_PIPS, outcome: "stepCap", steps: "4 steps" },
      "4 steps: click, scroll, doubleClick, wasted, hit the step cap",
    ],
    [
      "over budget, a run recorded before its limit was",
      { pips: VERA_PIPS, outcome: "overBudget", steps: "4 steps" },
      "4 steps: click, scroll, doubleClick, wasted, over budget",
    ],
    [
      "an error",
      { pips: VERA_PIPS.slice(0, 1), outcome: "error", steps: "2 steps" },
      "2 steps: click, error",
    ],
    [
      "a lost stream, with no end word: the run never ended",
      { pips: KAI_PIPS.slice(0, -1), outcome: "lost", steps: "5 steps so far" },
      "5 steps so far: click, scroll, back, wasted",
    ],
    [
      "a run that got through, with its place",
      { pips: VERA_PIPS.slice(0, 2), outcome: "through", place: 2, steps: "2 steps" },
      "2 steps: click, scroll; got through, 2nd",
    ],
  ])("reads %s", (_case, over, label) => {
    expect(trackTag(lane(over))["aria-label"]).toBe(label);
  });
});

describe("the screenshot", () => {
  test("is the latest one, by its src and alt", () => {
    const html = lane({
      shot: { src: "/api/runs/run_vera/steps/3/screenshot", alt: "Vera, after step 3" },
    });
    const [img, ...more] = tagsWith(html, "src");
    expect(more).toStrictEqual([]);
    expect(img).toMatchObject({
      src: "/api/runs/run_vera/steps/3/screenshot",
      alt: "Vera, after step 3",
    });
    expect(html).not.toContain("No screenshot yet");
  });

  test("before the first one, a box in its place says so", () => {
    const html = lane();
    expect(html).not.toContain("<img");
    expect(lineOf(html)).toContain("No screenshot yet");
  });
});

describe("the right column", () => {
  test.each(Object.keys(OUTCOME_WORDS) as OutcomeKind[])("says %s in its word", (outcome) => {
    expect(lineOf(lane({ outcome }))).toContain(OUTCOME_WORDS[outcome]);
  });

  test("the outcome, then the clock, then the steps", () => {
    const words = lineOf(lane({ outcome: "gaveUp", clock: "0:15.5", steps: "5 steps" }));
    expect(words.indexOf("Gave up")).toBeLessThan(words.indexOf("0:15.5"));
    expect(words.indexOf("0:15.5")).toBeLessThan(words.indexOf("5 steps"));
  });

  test("the clock reads as given, in readout, and is a timer named as simulated time", () => {
    for (const clock of ["0:15.5", "—"]) {
      const attributes = tagReading(lane({ clock }), "span", clock);
      expect(classesOf(attributes), clock).toContain("readout");
      // A timer, which may carry a name where a plain span may not; its updates are not announced.
      expect(attributes.role, clock).toBe("timer");
      expect(attributes["aria-live"], clock).toBeUndefined();
      expect(attributes["aria-label"], clock).toBe(`simulated time ${clock}`);
    }
  });

  test("links to the run's detail once given its id, last, a 32 px target named by its words", () => {
    const html = lane({ outcome: "gaveUp", steps: "5 steps", runId: "run_vera-hard-1" });
    const [link, ...more] = [...html.matchAll(/(<a\s[^>]*>)(.*?)<\/a>/gs)];
    expect(more).toStrictEqual([]);
    const attributes = attributesOf(link?.[1] ?? "");
    expect(attributes.href).toBe("/runs/run_vera-hard-1");
    expect(classesOf(attributes)).toContain("min-h-(--target-min)");
    // The arrow is hidden, so the link's name is its words alone.
    expect(link?.[2]).toMatch(/^See the run<span aria-hidden="true"[^>]*>→<\/span>$/);
    const words = lineOf(html);
    expect(words.indexOf("5 steps")).toBeLessThan(words.indexOf("See the run"));
  });

  test("draws no link with no run id: run detail has nothing before the run is stored", () => {
    expect(lane({ outcome: "moving" })).not.toMatch(/<a\s/);
  });
});

describe("the detail line", () => {
  test("is not drawn when there is no detail", () => {
    expect(lane({ detail: undefined })).not.toContain("data-detail");
  });

  test("is one line, clamped in CSS alone: a long message stays whole in the markup", () => {
    const message =
      "Actor model answered 500: the upstream provider timed out after 30 s while the request was still streaming its answer back";
    const html = lane({ outcome: "error", detail: message });
    const [line] = tagsWith(html, "data-detail");
    expect(classesOf(line ?? {})).toContain("line-clamp-1");
    expect(textOf(html)).toContain(message);
  });

  test("says what a state rests on, out of fault when it is no failure", () => {
    const detail = (
      <>
        Stuck: the last 2 steps left <span className="mono">/settings</span> as it was
      </>
    );
    const html = lane({ outcome: "stuck", detail });
    const [line] = tagsWith(html, "data-detail");
    expect(classesOf(line ?? {})).not.toContain("text-fault");
    expect(lineOf(html)).toContain("Stuck: the last 2 steps left /settings as it was");
  });

  test.each<[OutcomeKind, string]>([
    ["error", "Actor model answered 500"],
    ["lost", "Stream lost: last seen moving"],
  ])("is set in fault on %s, the tool failing", (outcome, detail) => {
    const html = lane({ outcome, detail });
    const [line] = tagsWith(html, "data-detail");
    expect(classesOf(line ?? {})).toContain("text-fault");
    expect(textOf(html)).toContain(detail);
  });

  // Where the bubble lands, under the avatar, is measured in the self-check's lane pass.
  test("comes after the narration's bubble in the markup (#195)", () => {
    const html = lane({
      outcome: "lost",
      detail: "Stream lost: last seen moving",
      narration: "Opening it.",
    });
    expect(html.indexOf("data-narration")).toBeGreaterThan(-1);
    expect(html.indexOf("data-narration")).toBeLessThan(html.indexOf("data-detail"));
  });
});

describe("the narration", () => {
  /** What a screen reader hears before the narration, where the eye sees a dashed bubble. */
  const HIDDEN_PREFIX = "Narration, written after the action:";
  const LONG =
    "A link at the bottom reads Order archive, but the letters are faint. Going back to the account page to look for another way in.";

  // Row 2 holds two lines in every state, so a stuck, errored or lost lane is no taller than a
  // running one, and three lanes still fit 1280 by 720.
  test.each<[string, Partial<Props>, string, string]>([
    ["two lines with no detail line", {}, "line-clamp-2", "line-clamp-1"],
    [
      "one line over a detail line",
      { outcome: "lost", detail: "Stream lost: last seen moving" },
      "line-clamp-1",
      "line-clamp-2",
    ],
  ])(
    "is clamped to %s, in CSS alone: every word stays in the markup",
    (_case, over, clamp, not) => {
      const html = lane({ ...over, narration: LONG });
      const paragraph = tagReading(html, "p", `${HIDDEN_PREFIX} ${LONG}`);
      expect(classesOf(paragraph)).toContain(clamp);
      expect(classesOf(paragraph)).not.toContain(not);
      expect(textOf(html)).toContain(LONG);
    },
  );

  // The bubble's border marks the narration as a hypothesis, so the eye reads the words alone (#236).
  test("shows the persona's words alone, in ink", () => {
    const bubble = elementOf(lane({ narration: "Opening it." }), "div", "data-narration");
    const [, start = "", inner = ""] = bubble.match(/<p(\s[^>]*)>(.*?)<\/p>/s) ?? [];
    expect(classesOf(attributesOf(start))).toContain("text-ink");
    expect(lineOf(inner.replace(/<span class="sr-only">.*?<\/span>/gs, ""))).toBe("Opening it.");
  });

  test("tells a screen reader first that the words were written after the action", () => {
    const bubble = elementOf(lane({ narration: "Opening it." }), "div", "data-narration");
    const [, inner = ""] = bubble.match(/<p\s[^>]*>(.*?)<\/p>/s) ?? [];
    const prefix = inner.match(/^<span(\s[^>]*)>(.*?)<\/span>/s);
    expect(classesOf(attributesOf(prefix?.[1] ?? ""))).toStrictEqual(["sr-only"]);
    expect(prefix?.[2]).toBe(HIDDEN_PREFIX);
    expect(lineOf(inner)).toBe(`${HIDDEN_PREFIX} Opening it.`);
  });

  // That the tail points at the avatar, and that the bubble is painted over the lane, is measured
  // in the self-check's lane pass: classes alone cannot show either.
  test("draws its outline dashed, a hypothesis, and its tail, in the persona's fill, on paper, hidden from assistive technology", () => {
    const bubble = elementOf(lane({ narration: "Opening it." }), "div", "data-narration");
    const drawn = tagsWith(bubble, 'aria-hidden="true"');
    expect(drawn).toHaveLength(1);
    // The ground is paper, never the persona's colour: a persona colour is never behind body text.
    expect(classesOf(drawn[0] ?? {})).toEqual(
      expect.arrayContaining([
        "border-dashed",
        "border-(--p)",
        "bg-paper",
        "after:border-(--p)",
        "after:bg-paper",
      ]),
    );
  });

  test("is not drawn when there is no narration, as on a Jev run: no bubble and no prefix", () => {
    const html = lane();
    expect(html).not.toContain("data-narration");
    expect(textOf(html)).not.toContain("after the");
  });

  test("is not drawn when the narration is only whitespace: no bubble to shrink beside its tail", () => {
    expect(lane({ narration: " " })).not.toContain("data-narration");
  });
});
