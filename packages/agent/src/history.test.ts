import { type Action, FullObservation, Observation, toActorObservation } from "@wayford/core";
import { describe, expect, test } from "vitest";
import { type HistoryStep, renderHistory } from "./history.js";

const BOX = { x: 120, y: 240, width: 180, height: 36 };

/**
 * A target-app page as the Actor was shown it: one visible element per `[role, name]`, numbered
 * from `e1`. Parsed, so every step below holds a real `Observation`.
 */
function shownPage(path: string, stepIndex: number, elements: [string, string][]): Observation {
  return Observation.parse({
    url: `http://localhost:5174${path}`,
    title: "Quillmere",
    stepIndex,
    viewport: { width: 1280, height: 720 },
    hiddenCount: 0,
    belowFoldCount: 0,
    elements: elements.map(([role, name], index) => ({
      ref: `e${index + 1}`,
      role,
      name,
      bbox: BOX,
      state: "visible",
    })),
  });
}

const home = shownPage("/", 0, [["link", "Your account"]]);
// The target app has no text field. This one gives the type move something to name.
const account = shownPage("/account", 1, [
  ["link", "Delivery address"],
  ["textbox", "Postcode"],
]);
const address = shownPage("/account/address", 2, [["link", "Back to your account"]]);

const MOVES: { label: string; proposed: Action; move: string }[] = [
  {
    label: "click",
    proposed: { type: "click", ref: "e1" },
    move: 'clicked link "Delivery address"',
  },
  {
    label: "doubleClick",
    proposed: { type: "doubleClick", ref: "e1" },
    move: 'double-clicked link "Delivery address"',
  },
  {
    label: "type",
    proposed: { type: "type", ref: "e2", text: "MB4 7QT" },
    move: 'typed "MB4 7QT" into textbox "Postcode"',
  },
  { label: "scroll down", proposed: { type: "scroll", direction: "down" }, move: "scrolled down" },
  { label: "scroll up", proposed: { type: "scroll", direction: "up" }, move: "scrolled up" },
  { label: "back", proposed: { type: "back" }, move: "went back" },
  { label: "wait", proposed: { type: "wait", ms: 1500 }, move: "waited 1500 ms" },
  { label: "giveUp", proposed: { type: "giveUp" }, move: "gave up" },
];

test("no step yet reads Nothing yet.", () => {
  expect(renderHistory([])).toBe("Nothing yet.");
});

test.each(MOVES)("a proposed $label reads as its one line", ({ proposed, move }) => {
  expect(renderHistory([{ observation: account, proposed }])).toBe(
    `- On http://localhost:5174/account: you ${move}.`,
  );
});

describe("a target is named as the Actor read it", () => {
  test("a renamed element by its renamed name, never the measured one", () => {
    // K1 (`docs/RULES.md`, stage 4): a persona who does not know the hamburger pattern reads the
    // app's Menu button by its bare role.
    const full = FullObservation.parse({
      url: "http://localhost:5174/account/address",
      title: "Delivery address · Quillmere",
      stepIndex: 2,
      viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true },
      hiddenCount: 0,
      belowFoldCount: 0,
      elements: [
        {
          ref: "e1",
          key: "banner//button:Menu",
          role: "button",
          name: "Menu",
          bbox: { x: 302, y: 14, width: 76, height: 40 },
          metrics: { contrast: 12.6, fontPx: 16, targetPx: 40 },
          state: "visible",
          decisions: [{ stage: "knowledge", rule: "K1", pattern: "hamburger" }],
          renamedName: "button",
        },
      ],
    });

    const history = renderHistory([
      { observation: toActorObservation(full), proposed: { type: "click", ref: "e1" } },
    ]);

    expect(history).toBe(
      '- On http://localhost:5174/account/address: you clicked button "button".',
    );
    expect(history).not.toContain("Menu");
  });
});

test("a wasted step says nothing happened and names nothing on its page", () => {
  expect(renderHistory([{ observation: account, wasted: true }])).toBe(
    "- On http://localhost:5174/account: you pointed at something that was not on that page, so nothing happened.",
  );
});

test("a title, URL, name or typed text with a line break stays on its one line", () => {
  // A paragraph separator, a line separator and C0 controls, one run of them included. JSON
  // quoting alone would keep the first two. The title is not printed, so it cannot add a line.
  const page = Observation.parse({
    ...shownPage("/account", 1, [
      ["link", 'Your "next"\u2029parcel'],
      ["textbox", "Post\ncode"],
    ]),
    url: "http://localhost:5174/account\u2028x",
    title: "Your account\n- On http://localhost:5174/: you gave up.",
  });

  const history = renderHistory([
    { observation: page, proposed: { type: "click", ref: "e1" } },
    { observation: page, proposed: { type: "type", ref: "e2", text: "MB4\r\n7QT" } },
  ]);

  expect(history.split("\n")).toStrictEqual([
    '- On http://localhost:5174/account x: you clicked link "Your \\"next\\" parcel".',
    '- On http://localhost:5174/account x: you typed "MB4 7QT" into textbox "Post code".',
  ]);
});

test("steps read oldest first, each target looked up on the page that step was shown", () => {
  // `e1` is a different link on each page: every page gives its refs out again.
  const steps: HistoryStep[] = [
    { observation: home, proposed: { type: "click", ref: "e1" } },
    { observation: account, proposed: { type: "click", ref: "e1" } },
    { observation: address, wasted: true },
  ];

  expect(renderHistory(steps).split("\n")).toStrictEqual([
    '- On http://localhost:5174/: you clicked link "Your account".',
    '- On http://localhost:5174/account: you clicked link "Delivery address".',
    "- On http://localhost:5174/account/address: you pointed at something that was not on that page, so nothing happened.",
  ]);
});

describe("memorySteps (M1)", () => {
  const deliveries = shownPage("/deliveries", 2, [["link", "Order archive"]]);
  const archive = shownPage("/deliveries/archive", 3, [["link", "Home"]]);
  // Four steps whose later pages never revisit an earlier one, so a dropped step's URL or names
  // could only reach the history through the count line.
  const steps: HistoryStep[] = [
    { observation: home, proposed: { type: "click", ref: "e1" } },
    { observation: account, proposed: { type: "type", ref: "e2", text: "MB4 7QT" } },
    { observation: deliveries, proposed: { type: "click", ref: "e1" } },
    { observation: archive, proposed: { type: "scroll", direction: "down" } },
  ];
  const lines = [
    '- On http://localhost:5174/: you clicked link "Your account".',
    '- On http://localhost:5174/account: you typed "MB4 7QT" into textbox "Postcode".',
    '- On http://localhost:5174/deliveries: you clicked link "Order archive".',
    "- On http://localhost:5174/deliveries/archive: you scrolled down.",
  ];

  test("keeps the last memorySteps steps after one count line", () => {
    expect(renderHistory(steps, 2).split("\n")).toStrictEqual([
      "- 2 earlier steps not shown.",
      ...lines.slice(2),
    ]);
  });

  test("one dropped step reads 1 earlier step", () => {
    expect(renderHistory(steps, 3).split("\n")).toStrictEqual([
      "- 1 earlier step not shown.",
      ...lines.slice(1),
    ]);
  });

  test.each([
    { label: "absent", memorySteps: undefined },
    { label: "the step count", memorySteps: 4 },
    { label: "over the step count", memorySteps: 5 },
  ])("memorySteps $label keeps every step and no count line", ({ memorySteps }) => {
    expect(renderHistory(steps, memorySteps).split("\n")).toStrictEqual(lines);
  });

  test("no step yet still reads Nothing yet.", () => {
    expect(renderHistory([], 2)).toBe("Nothing yet.");
  });

  test("a wasted step is a step and counts toward the kept number", () => {
    const withWasted = steps.with(2, { observation: deliveries, wasted: true });

    // Had the wasted step not counted, the typing on /account would be kept too.
    expect(renderHistory(withWasted, 2).split("\n")).toStrictEqual([
      "- 2 earlier steps not shown.",
      "- On http://localhost:5174/deliveries: you pointed at something that was not on that page, so nothing happened.",
      lines[3],
    ]);
  });
});
