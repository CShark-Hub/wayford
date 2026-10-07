import { createMemoryHistory, RouterContextProvider } from "@tanstack/react-router";
import { type RunOutcome, RunStep } from "@wayford/core";
import { runResultFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { attributesOf, classesOf, elementOf, lineOf, textOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { neighbourStep, StepTimeline, stepKeyDelta } from "./step-timeline.js";

const RUN_ID = runResultFixture.id;
/** Vera's five steps: click, scroll, doubleClick, wasted on `/settings`, then the give-up. */
const STEPS = runResultFixture.steps.toSorted((a, b) => a.stepIndex - b.stepIndex);

/**
 * The timeline, rendered statically inside the app's own router, so its links resolve their
 * hrefs. A static render runs no effect, so no key listener is added. The run ended as the
 * fixture's did, in Vera's give-up, unless `outcome` says otherwise.
 */
async function render(
  position: number,
  {
    steps = STEPS,
    outcome = runResultFixture.outcome,
  }: { steps?: readonly RunStep[]; outcome?: RunOutcome } = {},
): Promise<string> {
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [`/runs/${RUN_ID}`] }),
  });
  await router.load();
  return renderToStaticMarkup(
    <RouterContextProvider router={router}>
      <StepTimeline runId={RUN_ID} steps={steps} position={position} outcome={outcome} />
    </RouterContextProvider>,
  );
}

/** Each step link in `html`: its attributes, its classes and its inner markup. */
function entriesOf(html: string) {
  return [
    ...elementOf(html, "fieldset", 'aria-label="Steps"').matchAll(/<a(\s[^>]*)>(.*?)<\/a>/gs),
  ].map((m) => {
    const attributes = attributesOf(m[1] ?? "");
    return { attributes, classes: classesOf(attributes), inner: m[2] ?? "" };
  });
}

/** Step 0 of the fixture, stored as the step a run stopped in: `planned` keeps its action. */
function stoppedStep(planned: boolean): RunStep {
  const {
    proposedAction,
    performedAction,
    dice,
    decision: _,
    cost,
    urlAfter: __,
    ...base
  } = STEPS[0] as Extract<RunStep, { urlAfter: string }>;
  return RunStep.parse({
    ...base,
    ...(planned ? { proposedAction, performedAction, dice, cost } : {}),
    incomplete: true,
  });
}

describe("the steps", () => {
  test("a group labelled Steps holds one link per step, each numbered by its stepIndex", async () => {
    const html = await render(0);
    // The native group element: a `fieldset` is role `group` with no role written on it.
    const groups = [...html.matchAll(/<fieldset(\s[^>]*)?>/g)].map((m) => attributesOf(m[1] ?? ""));
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ "aria-label": "Steps" });
    expect(groups[0]).not.toHaveProperty("role");
    expect(entriesOf(html).map((entry) => lineOf(entry.inner))).toEqual(["0", "1", "2", "3", "4"]);
  });

  test("each links to its own ?step on the run, the replay's permalink", async () => {
    const entries = entriesOf(await render(0));
    expect(entries.map((entry) => entry.attributes.href)).toEqual(
      STEPS.map((step) => `/runs/${RUN_ID}?step=${step.stepIndex}`),
    );
  });

  test("each is named step N: the path it observed · what it did, wasted when nothing ran", async () => {
    const entries = entriesOf(await render(0));
    expect(entries.map((entry) => entry.attributes["aria-label"])).toEqual([
      "step 0: / · click e3",
      "step 1: /deliveries · scroll down",
      "step 2: /deliveries · doubleClick e2",
      "step 3: /settings · wasted",
      "step 4: /settings · giveUp",
    ]);
  });

  test("a step the run stopped in reads stopped, or its action and that it never landed", async () => {
    const before = await render(0, { steps: [stoppedStep(false)], outcome: "error" });
    expect(entriesOf(before)[0]?.attributes["aria-label"]).toBe("step 0: / · stopped");
    const planned = await render(0, { steps: [stoppedStep(true)], outcome: "budget_exceeded" });
    expect(entriesOf(planned)[0]?.attributes["aria-label"]).toBe(
      "step 0: / · click e3, never landed",
    );
  });

  test("the current entry alone carries aria-current=step and the ink fill", async () => {
    const entries = entriesOf(await render(2));
    expect(entries.map((entry) => entry.attributes["aria-current"])).toEqual([
      undefined,
      undefined,
      "step",
      undefined,
      undefined,
    ]);
    expect(entries[2]?.classes).toEqual(
      expect.arrayContaining(["bg-ink", "border-ink", "text-paper"]),
    );
    for (const entry of entries.filter((_, index) => index !== 2)) {
      expect(entry.classes).toEqual(expect.arrayContaining(["bg-surface", "text-ink-2"]));
      expect(entry.classes).not.toContain("bg-ink");
      expect(entry.classes).not.toContain("text-paper");
    }
  });

  test("at -1, after a ?step no step holds, no entry is current", async () => {
    const entries = entriesOf(await render(-1));
    expect(entries.some((entry) => "aria-current" in entry.attributes)).toBe(false);
  });

  test("the wasted step alone is hatched, its number on a patch of the step's own ground", async () => {
    const entries = entriesOf(await render(0));
    expect(entries.map((entry) => entry.classes.includes("hatch"))).toEqual([
      false,
      false,
      false,
      true,
      false,
    ]);
    // A background image leaves text unmeasured by the self-check: the number sits on a solid
    // patch that inherits the step's fill, so its contrast is the step's own.
    const patch = entries[3]?.inner.match(/^<span([^>]*)>3<\/span>$/)?.[1];
    expect(classesOf(attributesOf(patch ?? ""))).toContain("bg-inherit");
  });

  test("the wasted step keeps its hatch when it is the current one", async () => {
    const entries = entriesOf(await render(3));
    expect(entries[3]?.classes).toEqual(expect.arrayContaining(["hatch", "bg-ink", "text-paper"]));
  });

  test.each([
    ["gave_up", "gaveUp"],
    ["budget_exceeded", "overBudget"],
    ["error", "error"],
  ] as const)(
    "a run that ended %s draws the %s glyph after the last step's number",
    async (outcome, kind) => {
      const entries = entriesOf(await render(0, { outcome }));
      expect(entries[4]?.inner).toMatch(
        new RegExp(`^4<svg[^>]*aria-hidden="true"[^>]*data-outcome="${kind}"`),
      );
      expect(entries.slice(0, 4).some((entry) => entry.inner.includes("<svg"))).toBe(false);
    },
  );

  test("a run that ended success draws no glyph", async () => {
    const entries = entriesOf(await render(0, { outcome: "success" }));
    expect(entries.some((entry) => entry.inner.includes("<svg"))).toBe(false);
  });

  test("the step links are named by their labels alone: the glyph says nothing", async () => {
    const entries = entriesOf(await render(0, { outcome: "gave_up" }));
    expect(textOf(entries[4]?.inner ?? "")).toBe("4");
  });

  test("after the steps, the ← and → hints, hidden from assistive technology", async () => {
    const html = await render(0);
    const hints = html.match(/<span([^>]*)><kbd[^>]*>←<\/kbd><kbd[^>]*>→<\/kbd><\/span>/);
    expect(attributesOf(hints?.[1] ?? "")["aria-hidden"]).toBe("true");
    expect(hints?.index).toBeGreaterThan(html.lastIndexOf("</a>"));
  });
});

/** A key that `stepKeyDelta` reads as a move: → with no modifier, on the page itself. */
const KEY = {
  key: "ArrowRight",
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  defaultPrevented: false,
  target: null,
};

/** What a row changes of `KEY`. */
type KeyChange = Partial<Parameters<typeof stepKeyDelta>[0]>;

describe("stepKeyDelta", () => {
  test.each<[string, KeyChange[], -1 | 1 | undefined]>([
    [
      "← moves back one step, from the window too",
      [{ key: "ArrowLeft" }, { key: "ArrowLeft", target: {} }],
      -1,
    ],
    [
      "→ moves forward one, from a link, a button, a plain element or the page",
      [
        {},
        { target: { tagName: "A" } },
        { target: { tagName: "BUTTON", isContentEditable: false } },
        { target: { tagName: "DIV", isContentEditable: false } },
      ],
      1,
    ],
    [
      "any other key moves nothing",
      [{ key: "ArrowUp" }, { key: "Enter" }, { key: "Left" }],
      undefined,
    ],
    [
      "a key pressed with a modifier is left to the browser",
      [
        { altKey: true },
        { ctrlKey: true },
        { metaKey: true },
        { key: "ArrowLeft", shiftKey: true },
      ],
      undefined,
    ],
    [
      "a key a widget already handled, such as a tab list's arrows, moves nothing",
      [{ defaultPrevented: true }],
      undefined,
    ],
    [
      "a key typed into a field, a select, a video or editable content stays there",
      [
        ...["INPUT", "TEXTAREA", "SELECT", "VIDEO", "input"].map((tagName) => ({
          target: { tagName },
        })),
        { target: { tagName: "DIV", isContentEditable: true } },
      ],
      undefined,
    ],
  ])("%s", (_, changes, delta) => {
    for (const change of changes) {
      expect(stepKeyDelta({ ...KEY, ...change }), JSON.stringify(change)).toBe(delta);
    }
  });
});

describe("neighbourStep", () => {
  test("the step before and the step after the current one", () => {
    expect(neighbourStep(STEPS, 2, -1)).toBe(STEPS[1]);
    expect(neighbourStep(STEPS, 2, 1)).toBe(STEPS[3]);
  });

  test("nothing before the first step, and nothing after the last", () => {
    expect(neighbourStep(STEPS, 0, -1)).toBeUndefined();
    expect(neighbourStep(STEPS, STEPS.length - 1, 1)).toBeUndefined();
  });

  test("at -1, either key opens the first step", () => {
    expect(neighbourStep(STEPS, -1, -1)).toBe(STEPS[0]);
    expect(neighbourStep(STEPS, -1, 1)).toBe(STEPS[0]);
  });

  test("a run with no step has no neighbour at all", () => {
    expect(neighbourStep([], -1, 1)).toBeUndefined();
    expect(neighbourStep([], -1, -1)).toBeUndefined();
  });
});
