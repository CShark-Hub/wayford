import {
  type CompleteRunStep,
  type ElementDecision,
  type IncompleteRunStep,
  RunResult,
} from "@wayford/core";
import { decisionRecordFixture, runResultFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { screenshotUrl } from "../api/runs.js";
import {
  attributesOf,
  classesOf,
  decode,
  detailsOf,
  divsWith,
  lineOf,
  rowsOf,
  sectionOf,
  styleOf,
  textOf,
} from "../preview/rendered-markup.js";
import { fixtureJevRun, fixtureStep } from "./fixture-runs.js";
import { decisionLine, modelReadMeta, StepReplay, usd } from "./step-replay.js";

/** The headings an LLM step draws, in document order: the left column's, then the right's. */
const LLM_HEADINGS = [
  "Screenshot",
  "Filtered out",
  "Dice",
  "What the model read",
  "narration · after the fact",
];

/** The narration section's heading. */
const NARRATION = "narration · after the fact";

/** One step of `run`, replayed on its own. */
function replay(stepIndex: number, run: RunResult = runResultFixture): string {
  const step = run.steps.find((s) => s.stepIndex === stepIndex);
  if (step === undefined) throw new Error(`${run.id} has no step ${stepIndex}`);
  return renderToStaticMarkup(<StepReplay run={run} step={step} />);
}

/** The fixture run's step with this `stepIndex`, which must be one whose action landed. */
function completeStep(stepIndex: number): CompleteRunStep {
  const step = fixtureStep(stepIndex);
  if ("wasted" in step || "incomplete" in step) {
    throw new Error(`the fixture's step ${stepIndex} is not complete`);
  }
  return step;
}

/** The text of every `<h3>`, in document order. */
function h3Texts(html: string): string[] {
  return [...html.matchAll(/<h3(?:\s[^>]*)?>(.*?)<\/h3>/gs)].map((h) => lineOf(h[1] ?? ""));
}

/** How often `text` occurs in the markup, React's escaping undone: in text or in an attribute. */
function occurrences(html: string, text: string): number {
  return decode(html).split(text).length - 1;
}

/** The body rows of a table whose header row is `header`, as objects keyed by that header. */
function recordsOf(html: string): Record<string, string>[] {
  const [header, ...rows] = rowsOf(html);
  if (header === undefined) return [];
  return rows.map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""])));
}

/** Each tab: its name and whether it is the one selected. */
function tabsOf(html: string): { name: string; selected: boolean }[] {
  return [...html.matchAll(/<button([^>]*role="tab"[^>]*)>(.*?)<\/button>/gs)].map((tab) => ({
    name: lineOf(tab[2] ?? ""),
    selected: attributesOf(tab[1] ?? "")["aria-selected"] === "true",
  }));
}

/**
 * Each tab panel: the heading of the section it holds, its Radix state, and whether it hides
 * itself while inactive. Every panel is in the markup, the inactive ones included.
 */
function panelsOf(html: string): { heading: string; state: string; hidesInactive: boolean }[] {
  return [
    ...html.matchAll(/<div([^>]*role="tabpanel"[^>]*)>\s*<section [^>]*aria-labelledby="([^"]+)"/g),
  ].map((panel) => {
    const attributes = attributesOf(panel[1] ?? "");
    const heading = html.match(new RegExp(`<h3 [^>]*id="${panel[2]}"[^>]*>(.*?)</h3>`, "s"));
    return {
      heading: lineOf(heading?.[1] ?? ""),
      state: attributes["data-state"] ?? "",
      hidesInactive: (attributes.class ?? "").split(" ").includes("data-[state=inactive]:hidden"),
    };
  });
}

/**
 * A figure of the Screenshot section: which shot it is, whether it is hidden, its image's `src`
 * if any, its caption, and the click point drawn on it, if any.
 */
type Figure = {
  shot: string;
  hidden: boolean;
  src: string | undefined;
  caption: string;
  click: { style: Record<string, string>; flag: string; hidden: boolean } | undefined;
};

/** Each figure of the Screenshot section, in order. */
function figuresOf(html: string): Figure[] {
  const figures = sectionOf(html, "Screenshot").matchAll(/<figure((?:\s[^>]*)?)>(.*?)<\/figure>/gs);
  return [...figures].map((figure) => {
    const attributes = attributesOf(figure[1] ?? "");
    const body = figure[2] ?? "";
    const [click] = divsWith(body, "data-click");
    return {
      shot: attributes["data-shot"] ?? "",
      hidden: "hidden" in attributes,
      src: body.match(/<img [^>]*src="([^"]*)"/)?.[1],
      caption: lineOf(body.match(/<figcaption(?:\s[^>]*)?>(.*?)<\/figcaption>/s)?.[1] ?? ""),
      click:
        click === undefined
          ? undefined
          : {
              style: styleOf(click.attributes),
              flag: lineOf(click.inner),
              hidden: click.attributes["aria-hidden"] === "true",
            },
    };
  });
}

/** The screenshots without their click points, for the cases that draw none. */
function shotsOf(html: string): Omit<Figure, "click">[] {
  return figuresOf(html).map(({ click: _, ...figure }) => figure);
}

/** Each line of the model's text: its number, its text, whether it is marked, and its mark. */
function modelLines(html: string) {
  const list = sectionOf(html, "What the model read").match(/<ol(?:\s[^>]*)?>(.*?)<\/ol>/s)?.[1];
  if (list === undefined) throw new Error("no <ol> holds the model's text");
  return [...list.matchAll(/<li((?:\s[^>]*)?)>(.*?)<\/li>/gs)].map((item) => {
    const inner = item[2] ?? "";
    const code = inner.match(/<code(?:\s[^>]*)?>(.*?)<\/code>/s)?.[1];
    if (code === undefined) throw new Error(`a line holds no <code>: ${inner}`);
    const [number = "", ...rest] = inner.replace(/<code.*?<\/code>/s, "").split("</span>");
    return {
      number: lineOf(number),
      text: textOf(code),
      marked: "data-marked" in attributesOf(item[1] ?? ""),
      mark: lineOf(rest.join("</span>")),
    };
  });
}

/** The marked lines of the model's text, each as its text and its mark. */
function markedLines(html: string): { text: string; mark: string }[] {
  return modelLines(html)
    .filter((line) => line.marked)
    .map(({ text, mark }) => ({ text, mark }));
}

test("every LLM step draws the screenshot, two tabs, the model's text and the narration, each labelled by its <h3>", () => {
  for (const { stepIndex } of runResultFixture.steps) {
    const html = replay(stepIndex);
    expect(h3Texts(html), `step ${stepIndex}`).toEqual(LLM_HEADINGS);
    for (const heading of LLM_HEADINGS) expect(() => sectionOf(html, heading)).not.toThrow();
    expect(tabsOf(html).map((tab) => tab.name.replace(/ \(\d+\)$/, ""))).toEqual([
      "Filtered out",
      "Dice",
    ]);
    expect(lineOf(html)).not.toContain("confidence");
  }
});

test("an LLM step opens on Filtered out, and every panel is in the markup, hidden while inactive", () => {
  const html = replay(1);
  expect(tabsOf(html)).toEqual([
    { name: "Filtered out (4)", selected: true },
    { name: "Dice (0)", selected: false },
  ]);
  expect(panelsOf(html)).toEqual([
    { heading: "Filtered out", state: "active", hidesInactive: true },
    { heading: "Dice", state: "inactive", hidesInactive: true },
  ]);
});

describe("a step Jev chose", () => {
  const html = replay(0, fixtureJevRun);

  test("adds a Jev tab after Dice, open by default, and its section", () => {
    expect(h3Texts(html)).toEqual([
      "Screenshot",
      "Filtered out",
      "Dice",
      "Jev",
      "What the model read",
      NARRATION,
    ]);
    expect(tabsOf(html)).toEqual([
      { name: "Filtered out (0)", selected: false },
      { name: "Dice (1)", selected: false },
      { name: "Jev", selected: true },
    ]);
    expect(panelsOf(html).map((panel) => [panel.heading, panel.state])).toEqual([
      ["Filtered out", "inactive"],
      ["Dice", "inactive"],
      ["Jev", "active"],
    ]);
  });

  test("its Jev section is the panel: the draw, every option, the drawn one", () => {
    const jev = sectionOf(html, "Jev");
    expect(jev).toContain('role="img"');
    expect([...jev.matchAll(/<li[\s>]/g)]).toHaveLength(decisionRecordFixture.options.length);
    expect(lineOf(jev)).toContain("click e3 drawn");
  });

  test("beside the tabs, the confidence, labelled as the model's and not Vera's", () => {
    const note = "confidence 0.71 · the model's, not Vera's";
    expect(lineOf(html)).toContain(note);
    expect(lineOf(sectionOf(html, "Jev"))).not.toContain(note);
  });

  test("a step of the same run with no decision has no Jev tab and no confidence", () => {
    const step1 = replay(1, fixtureJevRun);
    expect(tabsOf(step1).map((tab) => tab.name)).toEqual(["Filtered out (4)", "Dice (0)"]);
    expect(() => sectionOf(step1, "Jev")).toThrow();
    expect(lineOf(step1)).not.toContain("confidence");
  });
});

describe("narration is interpretation, so it sits under narration · after the fact and nowhere else", () => {
  test("a complete step: step 0's narration, once", () => {
    const html = replay(0);
    const { narration } = fixtureStep(0);
    expect(lineOf(sectionOf(html, NARRATION))).toContain(narration);
    expect(occurrences(html, narration)).toBe(1);
  });

  test("a wasted step: step 3's refused answers, each labelled by the ref it was not shown", () => {
    const html = replay(3);
    const step = fixtureStep(3);
    if (!("wasted" in step)) throw new Error("the fixture's step 3 is wasted");
    const narrations = step.rejected.map((answer) => answer.narration);
    expect(narrations).toHaveLength(2);

    const section = lineOf(sectionOf(html, NARRATION));
    expect(section).toContain(`Answer 1, not shown: click e3 ${narrations[0]}`);
    expect(section).toContain(`Answer 2, not shown: click e5 ${narrations[1]}`);
    for (const narration of narrations) expect(occurrences(html, narration)).toBe(1);
  });

  test("an empty narration says there is none, and on a Jev run that Jev writes none", () => {
    const silent = RunResult.parse({
      ...runResultFixture,
      steps: runResultFixture.steps.map((s) => (s.stepIndex === 0 ? { ...s, narration: "" } : s)),
    });
    // The section's text opens with its own heading.
    expect(lineOf(sectionOf(replay(0, silent), NARRATION))).toBe(`${NARRATION} No narration`);
    // The Jev run stores no narration, as Jev writes none.
    expect(lineOf(sectionOf(replay(0, fixtureJevRun), NARRATION))).toBe(
      `${NARRATION} Jev writes no narration`,
    );
    // The run decides, as the run's `backend` fact does: step 1 of the Jev run carries no decision.
    expect(lineOf(sectionOf(replay(1, fixtureJevRun), NARRATION))).toBe(
      `${NARRATION} Jev writes no narration`,
    );
    // Nor does any answer its wasted step refused.
    expect(lineOf(sectionOf(replay(3, fixtureJevRun), NARRATION))).toBe(
      `${NARRATION} Answer 1, not shown: click e3 Jev writes no narration` +
        " Answer 2, not shown: click e5 Jev writes no narration",
    );
  });
});

test("a wasted step's Dice lists the refused answers as refs the Actor was not shown, its cost, and no roll", () => {
  const html = replay(3);
  const dice = sectionOf(html, "Dice");
  expect(dice).toMatch(/<h4[^>]*>Refs the Actor was not shown<\/h4>/);
  const items = [...dice.matchAll(/<li(?:\s[^>]*)?>(.*?)<\/li>/gs)].map((li) =>
    lineOf(li[1] ?? ""),
  );
  expect(items).toEqual(["click e3", "click e5"]);
  expect(lineOf(dice)).not.toContain("Proposed");
  expect(detailsOf(dice)).toEqual({ Cost: "$0.0058, 2900 tokens in, 300 out" });
  // The tab counts rolls, and the panel says what the count is.
  expect(tabsOf(html)[1]).toEqual({ name: "Dice (0)", selected: false });
  expect(lineOf(dice)).toContain("No dice rolled");
});

test("step 2's Dice: the proposed click, the performed doubleClick and the B1 roll that fired", () => {
  const html = replay(2);
  const dice = sectionOf(html, "Dice");
  expect(detailsOf(dice)).toEqual({
    Proposed: "click e2",
    Performed: "doubleClick e2",
    Cost: "$0.0037, 1340 tokens in, 220 out",
  });
  expect(recordsOf(dice)).toEqual([{ Rule: "B1", p: "0.8", Rolled: "0.62", Fired: "fired" }]);
  expect(tabsOf(html)[1]).toEqual({ name: "Dice (1)", selected: false });
});

test("a billed cost never reads as $0.0000", () => {
  const dollars = [0.0201, 0.0037, 0.000244, 0.000019992, 0].map((value) =>
    usd({ tokensIn: 0, tokensOut: 0, usd: value }),
  );
  expect(dollars).toEqual(["$0.0201", "$0.0037", "$0.00024", "$0.000020", "$0.0000"]);
});

// A real roll runs to 17 digits. Three would print this one as 0.8, not below the p it fired under.
test("a full-precision roll reads short in Dice, on its side of p, and whole in its title", () => {
  const step = completeStep(2);
  const dice = (step.dice ?? []).map((roll) => ({ ...roll, rolled: 0.7999612 }));
  const run = RunResult.parse({
    ...runResultFixture,
    steps: runResultFixture.steps.map((s) => (s.stepIndex === 2 ? { ...step, dice } : s)),
  });
  const html = sectionOf(replay(2, run), "Dice");
  expect(recordsOf(html)).toEqual([{ Rule: "B1", p: "0.8", Rolled: "0.79996", Fired: "fired" }]);
  expect(html).toContain('title="0.7999612"');
});

test("a roll that did not fire reads so, and a step with no roll says none was rolled", () => {
  expect(recordsOf(sectionOf(replay(0), "Dice"))).toEqual([
    { Rule: "B1", p: "0.8", Rolled: "0.91", Fired: "not fired" },
  ]);
  const scroll = sectionOf(replay(1), "Dice");
  expect(rowsOf(scroll)).toEqual([]);
  expect(lineOf(scroll)).toContain("No dice rolled");
});

/**
 * Each row of Filtered out's table, its cells taken apart: the ref, the role, the name, what the
 * Actor read and the state, and the decisions with the metrics measured.
 */
function filteredRowsOf(html: string) {
  return [...html.matchAll(/<tr(?:\s[^>]*)?>(.*?)<\/tr>/gs)].flatMap((row) => {
    const cells = [...(row[1] ?? "").matchAll(/<td(?:\s[^>]*)?>(.*?)<\/td>/gs)].map((c) => c[1]);
    const [ref = "", role = "", name = "", read = "", decisions = ""] = cells;
    if (cells.length === 0) return [];
    const paragraphs = (cell: string) =>
      [...cell.matchAll(/<p(?:\s[^>]*)?>(.*?)<\/p>/gs)].map((p) => lineOf(p[1] ?? ""));
    const [shown, state] = paragraphs(read);
    return [
      {
        ref: lineOf(ref),
        role: lineOf(role),
        name: lineOf(name),
        read: shown,
        state,
        decisions: [...decisions.matchAll(/<li(?:\s[^>]*)?>(.*?)<\/li>/gs)].map((li) =>
          lineOf(li[1] ?? ""),
        ),
        metrics: paragraphs(decisions)[0],
      },
    ];
  });
}

describe("step 1: Filtered out has the real name, the model's text the masked one", () => {
  const html = replay(1);
  const filtered = sectionOf(html, "Filtered out");
  const rows = filteredRowsOf(filtered);
  const byName = (name: string) => {
    const row = rows.find((r) => r.name === name);
    if (row === undefined) throw new Error(`no Filtered out row names ${name}`);
    return row;
  };

  test("five columns, so the table fits under the screenshot", () => {
    expect(rowsOf(filtered)[0]).toEqual(["Ref", "Role", "Name", "Actor read", "Decisions"]);
  });

  test("Archive: degraded, read as Ar▒▒ive, by P1 and its roll", () => {
    expect(byName("Archive")).toEqual({
      ref: "e4",
      role: "link",
      name: "Archive",
      read: "Ar▒▒ive",
      state: "degraded",
      decisions: ["P1 contrast 2.1 < 3, rolled 0.37: degraded"],
      metrics: "contrast 2.1, fontPx 16, targetPx 36",
    });
  });

  test("every element some rule touched is a row, in stored order, removed ones not shown", () => {
    expect(rows.map((r) => r.name)).toEqual(["Sort by date", "Archive", "Privacy", "Terms"]);
    expect(byName("Sort by date")).toMatchObject({
      ref: "none",
      read: "not shown",
      state: "invisible",
      decisions: ["P3 fontPx 11 < 16: invisible"],
    });
    expect(byName("Privacy")).toMatchObject({ ref: "none", decisions: ["V2 below"] });
  });

  test("a decision's line carries its roll as stored in its title", () => {
    expect(filtered).toContain('title="rolled 0.37"');
  });

  test("above the table, both counts", () => {
    expect(detailsOf(filtered)).toEqual({ "Hidden (A1, A3)": "0", "Below the fold (V2)": "2" });
  });

  test("the model's text reads Ar▒▒ive and never Archive", () => {
    const read = lineOf(sectionOf(html, "What the model read"));
    expect(read).toContain("Ar▒▒ive");
    expect(read).not.toContain("Archive");
  });

  test("its meta counts as the text does: shown, then below, and no count that is 0", () => {
    const read = lineOf(sectionOf(html, "What the model read"));
    expect(read).toContain("4 shown · 2 more below");
    expect(read).not.toContain("more not shown");
    expect(modelReadMeta(7, { hiddenCount: 3, belowFoldCount: 0 })).toBe(
      "7 shown · 3 more not shown",
    );
    expect(modelReadMeta(5, { hiddenCount: 1, belowFoldCount: 2 })).toBe(
      "5 shown · 1 more not shown · 2 more below",
    );
    expect(modelReadMeta(4, { hiddenCount: 0, belowFoldCount: 0 })).toBe("4 shown");
  });
});

test("a step no rule touched says so in Filtered out", () => {
  const filtered = sectionOf(replay(0), "Filtered out");
  expect(rowsOf(filtered)).toEqual([]);
  expect(lineOf(filtered)).toContain("No rule filtered an element of this page");
});

test("the model's text and the Filtered out panel each scroll down, in a named box the keyboard reaches", () => {
  const html = replay(1);
  const text = html.match(/<ol([^>]*aria-label="The model[^>]*)>/)?.[1];
  const panel = html.match(
    /<div([^>]*role="tabpanel"[^>]*)>\s*<section [^>]*aria-labelledby="step-filtered"/,
  )?.[1];
  expect(attributesOf(text ?? "")["aria-label"]).toBe("The model's text, line by line");
  // Radix names a tab panel by its tab.
  expect(attributesOf(panel ?? "")["aria-labelledby"]).toMatch(/.+/);
  for (const box of [text, panel]) {
    const attributes = attributesOf(box ?? "");
    expect(attributes.tabindex).toBe("0");
    expect(classesOf(attributes)).toContain("overflow-y-auto");
  }
  // The header row stays over the rows it names while they scroll.
  const filtered = sectionOf(html, "Filtered out");
  const headers = [...filtered.matchAll(/<th(\s[^>]*)>/g)];
  expect(headers).toHaveLength(5);
  for (const th of headers) expect(classesOf(attributesOf(th[1] ?? ""))).toContain("sticky");
});

test("the model's text is the stored text, byte for byte, one numbered line each, never a fresh render", () => {
  // The fold stores exactly what core renders, so only a stored text that differs from a render
  // tells the two apart.
  const run = RunResult.parse({
    ...runResultFixture,
    steps: runResultFixture.steps.map((s) => ({
      ...s,
      actorObservationText: `${s.actorObservationText}\nas stored`,
    })),
  });
  for (const step of run.steps) {
    const lines = modelLines(replay(step.stepIndex, run));
    expect(lines.map((line) => line.text).join("\n"), `step ${step.stepIndex}`).toBe(
      step.actorObservationText,
    );
    expect(lines.map((line) => line.number)).toEqual(lines.map((_, i) => String(i + 1)));
  }
});

describe("the line of the element the action landed on is marked", () => {
  test("by the action's type on an LLM step", () => {
    expect(markedLines(replay(0))).toEqual([
      { text: '[e3] link "Deliveries" at 192,16', mark: "click" },
    ]);
    expect(markedLines(replay(2))).toEqual([
      { text: '[e2] link "Settings" at 296,16', mark: "doubleClick" },
    ]);
  });

  test("as drawn on a step Jev chose", () => {
    expect(markedLines(replay(0, fixtureJevRun))).toEqual([
      { text: '[e3] link "Deliveries" at 192,16', mark: "drawn" },
    ]);
  });

  test("by the action's type on a step Jev chose whose B4 roll moved the click to a neighbour", () => {
    // Jev drew click e3, and a B4 misclick landed it on e4, which core accepts as a fired roll's
    // rewrite.
    const misclicked = RunResult.parse({
      ...fixtureJevRun,
      steps: fixtureJevRun.steps.map((s) =>
        s.stepIndex === 0
          ? {
              ...s,
              performedAction: { type: "click", ref: "e4" },
              dice: [{ rule: "B4", p: 0.5, rolled: 0.1, fired: true }],
            }
          : s,
      ),
    });
    const html = replay(0, misclicked);
    expect(markedLines(html)).toEqual([{ text: '[e4] link "Settings" at 296,16', mark: "click" }]);
    // The click point lands where the mark does, and the Jev tab still names the draw.
    expect(figuresOf(html)[0]?.click?.flag).toBe("click e4");
    expect(lineOf(sectionOf(html, "Jev"))).toContain("click e3 drawn");
  });

  test("on no line for a scroll, a give-up or a wasted step", () => {
    for (const stepIndex of [1, 3, 4]) expect(markedLines(replay(stepIndex))).toEqual([]);
  });
});

describe("the two screenshots: the page observed, and the page after the action", () => {
  const id = runResultFixture.id;

  test("step 0 observed the start page, which no step's screenshot shows", () => {
    expect(shotsOf(replay(0))).toEqual([
      {
        shot: "observed",
        hidden: false,
        src: undefined,
        caption: "No screenshot of the start page",
      },
      {
        shot: "after",
        hidden: true,
        src: screenshotUrl(id, 0),
        caption: "After this step's action",
      },
    ]);
  });

  test("step 1 observed the page step 0's action left", () => {
    expect(shotsOf(replay(1))).toEqual([
      {
        shot: "observed",
        hidden: false,
        src: screenshotUrl(id, 0),
        caption: "The page this step observed, as step 0's action left it",
      },
      {
        shot: "after",
        hidden: true,
        src: screenshotUrl(id, 1),
        caption: "After this step's action",
      },
    ]);
  });

  test("wasted step 3 observed step 2's page, and no action ran after it", () => {
    expect(shotsOf(replay(3))).toEqual([
      {
        shot: "observed",
        hidden: false,
        src: screenshotUrl(id, 2),
        caption: "The page this step observed, as step 2's action left it",
      },
      { shot: "after", hidden: true, src: undefined, caption: "No action ran" },
    ]);
  });

  test("step 4 skips the wasted step 3 and observed step 2's page too", () => {
    expect(figuresOf(replay(4))[0]?.src).toBe(screenshotUrl(id, 2));
  });

  test("a page an earlier step left with no screenshot is not called the start page", () => {
    const { screenshotPath: _, ...bare } = completeStep(2);
    const run = RunResult.parse({
      ...runResultFixture,
      steps: runResultFixture.steps.map((s) => (s.stepIndex === 2 ? bare : s)),
    });
    expect(shotsOf(replay(3, run))[0]).toEqual({
      shot: "observed",
      hidden: false,
      src: undefined,
      caption: "No screenshot was kept of the page this step observed",
    });
  });

  test("the head names the observed URL, and Observed is the one picked", () => {
    const head = sectionOf(replay(1), "Screenshot");
    expect(lineOf(head)).toContain("localhost:5174/deliveries");
    const items = [...head.matchAll(/<button([^>]*)>(.*?)<\/button>/gs)].map((item) => ({
      name: lineOf(item[2] ?? ""),
      on: attributesOf(item[1] ?? "")["aria-checked"] === "true",
    }));
    expect(items).toEqual([
      { name: "Observed", on: true },
      { name: "After", on: false },
    ]);
  });
});

describe("the click point, at the element's box over the viewport", () => {
  test("step 0's click on e3, at 192,16 and 88 × 36 of 1280 × 800, on the Observed placeholder", () => {
    const [observed, after] = figuresOf(replay(0));
    expect(observed?.click).toEqual({
      style: { left: "15%", top: "2%", width: "6.875%", height: "4.5%" },
      flag: "click e3",
      hidden: true,
    });
    expect(after?.click).toBeUndefined();
  });

  test("step 2's doubleClick on e2, on the Observed screenshot, which names it", () => {
    const html = replay(2);
    expect(figuresOf(html)[0]?.click).toEqual({
      style: { left: "23.125%", top: "2%", width: "5.938%", height: "4.5%" },
      flag: "doubleClick e2",
      hidden: true,
    });
    expect(sectionOf(html, "Screenshot")).toContain(
      'alt="Screenshot after step 1&#x27;s action, with doubleClick e2 marked"',
    );
  });

  test("none for a scroll, a wasted step or a give-up", () => {
    for (const stepIndex of [1, 3, 4]) {
      expect(figuresOf(replay(stepIndex))[0]?.click, `step ${stepIndex}`).toBeUndefined();
    }
  });
});

/**
 * The `translate` that moves each figure's frame up inside its crop, if any. Whether the click
 * point then lies inside the crop is measured in Chromium, by the self-check's browser test.
 */
function offsetsOf(html: string): (string | undefined)[] {
  const figures = sectionOf(html, "Screenshot").matchAll(/<figure(?:\s[^>]*)?>(.*?)<\/figure>/gs);
  return [...figures].map((figure) => {
    const frame = figure[1]?.match(/<div([^>]*\sdata-frame="[^"]*"[^>]*)>/)?.[1] ?? "";
    return styleOf(attributesOf(frame)).translate;
  });
}

/** The fixture run with step 0's target, e3, moved down the page to `box`. */
function movedTarget(box: { y: number; height: number }): RunResult {
  return RunResult.parse({
    ...runResultFixture,
    steps: runResultFixture.steps.map((s) =>
      s.stepIndex !== 0
        ? s
        : {
            ...s,
            fullObservation: {
              ...s.fullObservation,
              elements: s.fullObservation.elements.map((e) =>
                e.ref === "e3" ? { ...e, bbox: { ...e.bbox, ...box } } : e,
              ),
            },
          },
    ),
  });
}

describe("the frame inside the screenshot's crop", () => {
  test("a click point low on the page keeps its place in the frame, so it stays on the element", () => {
    // Moved to 600 and 40 tall of 800: 75 % down the frame, however far the frame moves up.
    const moved = replay(0, movedTarget({ y: 600, height: 40 }));
    expect(figuresOf(moved)[0]?.click?.style).toEqual({
      left: "15%",
      top: "75%",
      width: "6.875%",
      height: "5%",
    });
  });

  test("with no click point, the frame keeps the page's top", () => {
    // After never carries one, and a scroll, a wasted step and a give-up land on no element.
    expect(offsetsOf(replay(0))[1]).toBeUndefined();
    for (const stepIndex of [1, 3, 4]) {
      for (const offset of offsetsOf(replay(stepIndex))) {
        expect(offset, `step ${stepIndex}`).toBeUndefined();
      }
    }
  });
});

describe("an incomplete last step", () => {
  /**
   * The fixture run cut short in its last step, the give-up, as a run that ran out of budget is
   * stored: with the action planned but not landed, or with none planned.
   */
  function cutShort(planned: boolean): RunResult {
    const {
      urlAfter: _,
      screenshotPath: __,
      proposedAction,
      performedAction,
      dice,
      cost,
      ...base
    } = completeStep(4);
    const step: IncompleteRunStep = planned
      ? { ...base, incomplete: true, proposedAction, performedAction, dice, cost }
      : { ...base, incomplete: true };
    return RunResult.parse({
      ...runResultFixture,
      outcome: "budget_exceeded",
      steps: [...runResultFixture.steps.slice(0, -1), step],
    });
  }

  test("stopped before an action was planned: no action, no dice, no After screenshot, its narration", () => {
    const html = replay(4, cutShort(false));
    const dice = lineOf(sectionOf(html, "Dice"));
    expect(dice).toContain("The run stopped before an action was planned");
    // The panel says what the tab counts: no roll.
    expect(dice).toContain("No dice rolled");
    expect(tabsOf(html)[1]).toEqual({ name: "Dice (0)", selected: false });
    expect(shotsOf(html)[1]).toEqual({
      shot: "after",
      hidden: true,
      src: undefined,
      caption: "The run stopped before the action landed",
    });
    expect(lineOf(sectionOf(html, NARRATION))).toContain("I give up");
  });

  test("stopped after the action was planned: the planned action, which never landed", () => {
    const html = replay(4, cutShort(true));
    const dice = sectionOf(html, "Dice");
    expect(lineOf(dice)).toContain("never landed");
    expect(detailsOf(dice)).toMatchObject({ Proposed: "giveUp", Planned: "giveUp" });
    expect(detailsOf(dice)).not.toHaveProperty("Performed");
    expect(figuresOf(html)[0]?.click).toBeUndefined();
  });
});

test("a decision line prints the rule the data names, whatever its stage", () => {
  const lines: [ElementDecision, string][] = [
    [
      {
        stage: "perception",
        rule: "P1",
        metric: "contrast",
        value: 2.1,
        threshold: 3,
        rolled: 0.42,
        state: "degraded",
      },
      "P1 contrast 2.1 < 3, rolled 0.42: degraded",
    ],
    [
      {
        stage: "perception",
        rule: "P4",
        metric: "targetPx",
        value: 20,
        threshold: 44,
        state: "invisible",
      },
      "P4 targetPx 20 < 44: invisible",
    ],
    [{ stage: "viewport", rule: "V2", side: "below" }, "V2 below"],
    [{ stage: "viewport", rule: "V3" }, "V3"],
    [{ stage: "knowledge", rule: "K1", pattern: "hamburger" }, "K1 hamburger"],
    [{ stage: "knowledge", rule: "K2", terms: ["Fulfilment ledger"] }, "K2 Fulfilment ledger"],
    [{ stage: "knowledge", rule: "K2", terms: ["ledger", "SKU"] }, "K2 ledger, SKU"],
    [{ stage: "knowledge", rule: "K4" }, "K4"],
    [{ stage: "attention", rule: "A1" }, "A1"],
    [{ stage: "attention", rule: "A3" }, "A3"],
  ];
  for (const [decision, line] of lines) expect(decisionLine(decision)).toBe(line);
});
