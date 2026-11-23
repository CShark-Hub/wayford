import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { attributesOf, classesOf, decode, lineOf } from "../preview/rendered-markup.js";
import {
  StopRace,
  StopRaceBody,
  stopAnswerLine,
  stopFaultLine,
  stopRecordLine,
} from "./stop-race.js";

/** The confirmation's words as the open dialog says them, with `counts` if the screen has them. */
function body(counts: { waiting?: number; running?: number } = {}): string {
  return lineOf(renderToStaticMarkup(<StopRaceBody {...counts} />));
}

/**
 * The trigger as a static render draws it: its attributes and its text. The dialog itself sits in
 * a portal, which a static render leaves out, so the trigger is the only button.
 */
function trigger(pending: boolean) {
  const html = renderToStaticMarkup(
    <StopRace waiting={2} running={3} pending={pending} onConfirm={() => {}} />,
  );
  const buttons = [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/gs)];
  expect(buttons).toHaveLength(1);
  const [, tag, text] = buttons[0] ?? [];
  return { html, attributes: attributesOf(tag ?? ""), text: lineOf(text ?? "") };
}

test("with the lanes' counts: the runs a stop drops, those it leaves to finish, and that a stopped run never counts", () => {
  expect(body({ waiting: 2, running: 3 })).toBe(
    "2 runs still waiting for a slot won't start. 3 runs already under way finish, and their results count. A stopped run never counts toward results.",
  );
});

test("one run each: one run, and the verbs agree with it", () => {
  expect(body({ waiting: 1, running: 1 })).toBe(
    "1 run still waiting for a slot won't start. 1 run already under way finishes, and its result counts. A stopped run never counts toward results.",
  );
});

test("with no run under way, the sentence on runs under way is left out", () => {
  expect(body({ waiting: 2, running: 0 })).toBe(
    "2 runs still waiting for a slot won't start. A stopped run never counts toward results.",
  );
});

test("without counts, on a screen that follows no stream: the same, said of runs in general", () => {
  expect(body()).toBe(
    "Runs still waiting for a slot won't start. Runs already under way finish, and their results count. A stopped run never counts toward results.",
  );
});

test("the trigger is an outline button named Stop race that opens a dialog: quiet, never ink or fault", () => {
  const { html, attributes, text } = trigger(false);
  expect(text).toBe("Stop race");
  expect(attributes).toMatchObject({
    type: "button",
    "aria-haspopup": "dialog",
    "aria-expanded": "false",
    "data-variant": "outline",
  });
  expect(attributes).not.toHaveProperty("disabled");
  const classes = classesOf(attributes);
  expect(classes).not.toContain("bg-ink");
  expect(classes.some((name) => /fault|destructive/.test(name))).toBe(false);
  // A static render draws no portal, so the confirmation is the browser test's to open.
  expect(html).not.toContain("alertdialog");
  expect(html).not.toContain("Stop this race?");
});

test("while the stop is pending, the trigger reads Stopping… and cannot be pressed again", () => {
  const { attributes, text } = trigger(true);
  expect(text).toBe("Stopping…");
  expect(attributes).toHaveProperty("disabled");
  expect(attributes["data-variant"]).toBe("outline");
});

test("a screen with no lanes tells the stop in a line: from the race's record, or from io's answer", () => {
  expect(stopRecordLine(1)).toBe("Stopped: 1 run never started. The runs under way finish.");
  expect(stopRecordLine(3)).toBe("Stopped: 3 runs never started. The runs under way finish.");
  expect(stopAnswerLine(1)).toBe(
    "Stopped: 1 run waiting for a slot won't start. The runs under way finish.",
  );
  expect(stopAnswerLine(4)).toBe(
    "Stopped: 4 runs waiting for a slot won't start. The runs under way finish.",
  );
  // Nothing waited when the stop came: each run io had listed took a slot, or the race had finished.
  expect(stopAnswerLine(0)).toBe("No run was still waiting for a slot, so nothing was stopped.");
});

test("a stop io did not confirm: its reason, and the way to see where the race stands", () => {
  expect(stopFaultLine("io answered 404: no race race_gone")).toBe(
    "io did not confirm the stop: io answered 404: no race race_gone. Open the race again to see where it stands.",
  );
});

test("nothing the stop says reads disabled", () => {
  const said = [
    body({ waiting: 2, running: 3 }),
    body({ waiting: 1, running: 1 }),
    body(),
    trigger(false).text,
    trigger(true).text,
    stopRecordLine(2),
    stopAnswerLine(2),
    stopAnswerLine(0),
    stopFaultLine("io answered 502"),
  ].join(" ");
  expect(decode(said).toLowerCase()).not.toContain("disabled");
});
