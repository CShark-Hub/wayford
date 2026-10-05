import type { Task } from "@wayford/core";
import { expect, test } from "vitest";
import type { Extraction } from "../api/runs.js";
import { bundledProfiles, bundledTasks } from "../bundled-fixtures.js";
import { dispatched, forOf, sixProfiles, withPersonas } from "./fixture-race.js";
import {
  GOAL_PRESETS,
  initialPanel,
  MAX_PERSONAS,
  MIN_PERSONAS,
  type PanelState,
  panelReducer,
  runsRequestOf,
  seedOf,
  startBlocker,
} from "./panel-state.js";

const [easy, hard] = GOAL_PRESETS;
if (!easy || !hard) throw new Error("the arena has two goal presets, easy then hard");

/** The task io would store for the hard goal, as its 201 hands it back. */
const acceptedTask: Task = {
  id: "task_ordered-three-months-ago",
  goal: "you want to see what you ordered three months ago",
  startUrl: hard.startUrl,
  success: hard.success,
  sourceStory: hard.sentence,
  strippedPaths: [],
};

const accepted: Extraction = { ok: true, task: acceptedTask, rewritten: false };

const refused: Extraction = {
  ok: false,
  error: "The goal failed the task check after one repair round",
  goal: "open Settings to see what I ordered",
  survived: ["settings"],
};

/** The hard goal checked and accepted, three personas chosen, seed 1: Start can start. */
function ready(): PanelState {
  const chosen = withPersonas(initialPanel(), bundledProfiles.slice(0, MIN_PERSONAS));
  return dispatched(chosen, { type: "checkAnswered", for: forOf(chosen), extraction: accepted });
}

test("the presets are tasks.json's goals in file order, labelled by task id: easy then hard", () => {
  expect(GOAL_PRESETS).toStrictEqual(
    bundledTasks.map((task, index) => ({
      id: task.id,
      label: ["Easy goal", "Hard goal"][index],
      sentence: task.goal,
      startUrl: task.startUrl,
      success: task.success,
    })),
  );
  expect(GOAL_PRESETS.map((preset) => preset.id)).toStrictEqual([
    "task_next-parcel",
    "task_past-order",
  ]);
});

test("every goal has a label of its own, so a renamed task id in tasks.json fails here", () => {
  const labels = GOAL_PRESETS.map((preset) => preset.label);
  for (const [i, label] of labels.entries()) expect(label, GOAL_PRESETS[i]?.id).not.toBe("Goal");
  expect(new Set(labels).size).toBe(labels.length);
});

test("the panel starts on the hard goal's sentence, with no persona, seed 1 and no check", () => {
  expect(GOAL_PRESETS.find(({ id }) => id === initialPanel().presetId)?.label).toBe("Hard goal");
  expect(initialPanel()).toStrictEqual({
    presetId: hard.id,
    sentence: hard.sentence,
    profileIds: [],
    seed: "1",
    check: { status: "unchecked" },
    starting: false,
  });
});

test("choosing a preset takes its sentence and drops the check", () => {
  const edited = dispatched(ready(), { type: "sentenceEdited", sentence: "something else" });
  const state = dispatched(edited, { type: "presetChosen", presetId: easy.id });
  expect(state.presetId).toBe(easy.id);
  expect(state.sentence).toBe(easy.sentence);
  expect(state.check).toStrictEqual({ status: "unchecked" });
  // An accepted check goes too, even when the preset is the one already chosen.
  expect(dispatched(ready(), { type: "presetChosen", presetId: hard.id }).check).toStrictEqual({
    status: "unchecked",
  });
});

test("editing the sentence keeps it and drops the check", () => {
  const state = dispatched(ready(), { type: "sentenceEdited", sentence: "find my last order" });
  expect(state.sentence).toBe("find my last order");
  expect(state.presetId).toBe(hard.id);
  expect(state.check).toStrictEqual({ status: "unchecked" });
});

test("a persona toggles on and off, in the order clicked", () => {
  const [ada, kai, vera] = bundledProfiles;
  if (!ada || !kai || !vera) throw new Error("the fixtures hold Ada, Kai and Vera");
  const state = withPersonas(initialPanel(), [vera, ada, kai]);
  expect(state.profileIds).toStrictEqual([vera.id, ada.id, kai.id]);
  expect(dispatched(state, { type: "personaToggled", profileId: ada.id }).profileIds).toStrictEqual(
    [vera.id, kai.id],
  );
});

test("a sixth persona is refused: the same state comes back", () => {
  expect(MAX_PERSONAS).toBe(5);
  const five = withPersonas(initialPanel(), sixProfiles.slice(0, MAX_PERSONAS));
  expect(five.profileIds).toStrictEqual(sixProfiles.slice(0, 5).map((profile) => profile.id));
  const sixth = sixProfiles[5];
  if (!sixth) throw new Error("six synthetic profiles");
  expect(panelReducer(five, { type: "personaToggled", profileId: sixth.id })).toBe(five);
  // A chosen one still comes off at five, and then the sixth goes on.
  const four = dispatched(five, { type: "personaToggled", profileId: "prof_p1" });
  expect(four.profileIds).toHaveLength(4);
  expect(
    dispatched(four, { type: "personaToggled", profileId: sixth.id }).profileIds,
  ).toStrictEqual(["prof_p2", "prof_p3", "prof_p4", "prof_p5", "prof_p6"]);
});

test("the seed is the input's text, as typed", () => {
  expect(dispatched(initialPanel(), { type: "seedEdited", seed: "42" }).seed).toBe("42");
  expect(dispatched(initialPanel(), { type: "seedEdited", seed: "" }).seed).toBe("");
});

test("a check goes checking, then takes io's answer for the current preset and sentence", () => {
  const checking = dispatched(initialPanel(), { type: "checkStarted" });
  expect(checking.check).toStrictEqual({ status: "checking" });
  expect(
    dispatched(checking, { type: "checkAnswered", for: forOf(checking), extraction: accepted })
      .check,
  ).toStrictEqual({ status: "accepted", task: acceptedTask, rewritten: false });
  expect(
    dispatched(checking, { type: "checkAnswered", for: forOf(checking), extraction: refused })
      .check,
  ).toStrictEqual({
    status: "refused",
    goal: refused.goal,
    survived: ["settings"],
    error: refused.error,
  });
  expect(
    dispatched(checking, { type: "checkFailed", for: forOf(checking), message: "io answered 502" })
      .check,
  ).toStrictEqual({ status: "failed", message: "io answered 502" });
});

test("an answer for an older sentence or another preset is dropped: the same state comes back", () => {
  const asked = dispatched(initialPanel(), { type: "checkStarted" });
  const askedFor = forOf(asked);
  const edited = dispatched(asked, { type: "sentenceEdited", sentence: "find my last order" });
  expect(panelReducer(edited, { type: "checkAnswered", for: askedFor, extraction: accepted })).toBe(
    edited,
  );
  expect(panelReducer(edited, { type: "checkFailed", for: askedFor, message: "late" })).toBe(
    edited,
  );
  const otherPreset = dispatched(asked, { type: "presetChosen", presetId: easy.id });
  expect(
    panelReducer(otherPreset, { type: "checkAnswered", for: askedFor, extraction: accepted }),
  ).toBe(otherPreset);
});

test("a start goes starting, then clears it on success and keeps io's reason on failure", () => {
  const failed = dispatched(
    ready(),
    { type: "startStarted" },
    { type: "startFailed", message: "io answered 404: no profile prof_x" },
  );
  expect(failed.starting).toBe(false);
  expect(failed.startError).toBe("io answered 404: no profile prof_x");
  const again = dispatched(failed, { type: "startStarted" });
  expect(again.starting).toBe(true);
  expect(again.startError).toBeUndefined();
  expect(startBlocker(again)).toBeDefined();
  // After a race, "New race" comes back to a panel that can start again.
  const raced = dispatched(again, { type: "startSucceeded" });
  expect(raced.starting).toBe(false);
  expect(startBlocker(raced)).toBeUndefined();
});

test("seedOf reads digits only, within a 32-bit seed", () => {
  expect(seedOf("0")).toBe(0);
  expect(seedOf("1")).toBe(1);
  expect(seedOf("007")).toBe(7);
  expect(seedOf("4294967295")).toBe(4294967295);
  for (const text of ["", " ", " 1", "1.5", "1e3", "0x10", "-1", "4294967296", "1".repeat(30)]) {
    expect(seedOf(text), JSON.stringify(text)).toBeUndefined();
  }
});

test("startBlocker gives a reason for each thing missing, and none when the panel is ready", () => {
  expect(startBlocker(ready())).toBeUndefined();
  const reasons: [string, PanelState][] = [
    ["no check", dispatched(ready(), { type: "sentenceEdited", sentence: "find my order" })],
    ["a check under way", dispatched(ready(), { type: "checkStarted" })],
    [
      "a refused check",
      dispatched(ready(), { type: "checkAnswered", for: forOf(ready()), extraction: refused }),
    ],
    [
      "a failed check",
      dispatched(ready(), { type: "checkFailed", for: forOf(ready()), message: "io answered 502" }),
    ],
    ["two personas", { ...ready(), profileIds: ready().profileIds.slice(0, 2) }],
    ["a blank seed", dispatched(ready(), { type: "seedEdited", seed: "" })],
    ["seed 1e3", dispatched(ready(), { type: "seedEdited", seed: "1e3" })],
    ["seed 2^32", dispatched(ready(), { type: "seedEdited", seed: "4294967296" })],
    ["starting", dispatched(ready(), { type: "startStarted" })],
  ];
  for (const [what, state] of reasons) {
    const reason = startBlocker(state);
    expect(reason, what).toBeTypeOf("string");
    expect(reason, what).not.toMatch(/disabled/i);
  }
  expect(startBlocker({ ...ready(), profileIds: ready().profileIds.slice(0, 2) })).toMatch(
    /1 more/,
  );
});

test("runsRequestOf sends the checked task, the personas in the list's order and one seed", () => {
  const [ada, kai, milo, vera] = bundledProfiles;
  if (!ada || !kai || !milo || !vera) throw new Error("the fixtures hold Ada, Kai, Milo and Vera");
  const clicked = withPersonas(initialPanel(), [vera, ada, milo, kai]);
  const state = dispatched(
    clicked,
    { type: "checkAnswered", for: forOf(clicked), extraction: accepted },
    { type: "seedEdited", seed: "7" },
  );
  expect(runsRequestOf(state, bundledProfiles)).toStrictEqual({
    taskId: acceptedTask.id,
    profileIds: [ada.id, kai.id, milo.id, vera.id],
    seeds: [7],
  });
});

test("runsRequestOf without an accepted check or a seed is a bug, and throws", () => {
  expect(() => runsRequestOf(initialPanel(), bundledProfiles)).toThrow(Error);
  expect(() =>
    runsRequestOf(dispatched(ready(), { type: "seedEdited", seed: "" }), bundledProfiles),
  ).toThrow(Error);
});
