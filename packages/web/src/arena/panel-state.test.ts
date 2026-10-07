import type { Task } from "@wayford/core";
import { expect, test } from "vitest";
import type { Extraction } from "../api/runs.js";
import { bundledProfiles, bundledTasks } from "../bundled-fixtures.js";
import { dispatched, sixProfiles, withPersonas } from "./fixture-race.js";
import {
  checkedFor,
  GOAL_PRESETS,
  goalLabel,
  initialPanel,
  MAX_PERSONAS,
  MIN_PERSONAS,
  NO_SUCCESS,
  type PanelState,
  panelReducer,
  presetTaskOf,
  runsRequestOf,
  seedOf,
  startBlocker,
  successBlocker,
  successOf,
  taskRequestOf,
  UNMATCHABLE_SUCCESS,
  usesPresetSuccess,
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
  return dispatched(chosen, {
    type: "checkAnswered",
    for: checkedFor(chosen),
    extraction: accepted,
  });
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

test("the panel starts on the hard goal's sentence and success, with no persona, seed 1 and no check", () => {
  expect(GOAL_PRESETS.find(({ id }) => id === initialPanel().presetId)?.label).toBe("Hard goal");
  expect(initialPanel()).toStrictEqual({
    presetId: hard.id,
    sentence: hard.sentence,
    success: "**/deliveries/archive",
    profileIds: [],
    seed: "1",
    check: { status: "unchecked" },
    starting: false,
  });
});

test("every preset's success is one the panel can type and check: a URL pattern a page can match", () => {
  for (const preset of GOAL_PRESETS) {
    const state = dispatched(initialPanel(), { type: "presetChosen", presetId: preset.id });
    expect(successOf(state.success), preset.id).toStrictEqual(preset.success);
    expect(successBlocker(state.success), preset.id).toBeUndefined();
  }
});

test("choosing a preset takes its sentence and its success, and drops the check", () => {
  const edited = dispatched(
    ready(),
    { type: "sentenceEdited", sentence: "something else" },
    { type: "successEdited", success: "**/something" },
  );
  const state = dispatched(edited, { type: "presetChosen", presetId: easy.id });
  expect(state.presetId).toBe(easy.id);
  expect(state.sentence).toBe(easy.sentence);
  expect(state.success).toBe("**/account/address");
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

test("editing the sentence away from the preset's empties the preset's success", () => {
  const state = dispatched(initialPanel(), {
    type: "sentenceEdited",
    sentence: "you want to verify your delivery address",
  });
  expect(state.success).toBe("");
  expect(usesPresetSuccess(state)).toBe(false);
  // Every keystroke is an edit: the next one leaves the emptied field as it is.
  expect(
    dispatched(state, { type: "sentenceEdited", sentence: "you want to verify your address" })
      .success,
  ).toBe("");
});

test("editing the sentence back to the preset's refills an empty success from the preset", () => {
  const away = dispatched(initialPanel(), { type: "sentenceEdited", sentence: "you want to se" });
  expect(away.success).toBe("");
  const back = dispatched(away, { type: "sentenceEdited", sentence: hard.sentence });
  expect(back.success).toBe(initialPanel().success);
  expect(usesPresetSuccess(back)).toBe(true);
  // A field of blanks is as empty as an empty one.
  const blanks = dispatched(
    away,
    { type: "successEdited", success: "  " },
    { type: "sentenceEdited", sentence: hard.sentence },
  );
  expect(blanks.success).toBe(initialPanel().success);
});

test("a success the person typed survives every sentence edit, back to the preset's sentence too", () => {
  const typed = "**/account/address";
  const state = dispatched(
    initialPanel(),
    { type: "successEdited", success: typed },
    { type: "sentenceEdited", sentence: "you want to verify your delivery address" },
    { type: "sentenceEdited", sentence: "you want to check your delivery address" },
  );
  expect(state.success).toBe(typed);
  expect(dispatched(state, { type: "sentenceEdited", sentence: hard.sentence }).success).toBe(
    typed,
  );
  // A pattern typed while the sentence is edited stays too.
  const away = dispatched(
    initialPanel(),
    { type: "sentenceEdited", sentence: "you want to verify your delivery address" },
    { type: "successEdited", success: "**/account/**" },
    { type: "sentenceEdited", sentence: "you want to verify where parcels go" },
  );
  expect(away.success).toBe("**/account/**");
});

test("Use the preset's sets the preset's success, and a later sentence edit keeps it", () => {
  const edited = dispatched(initialPanel(), {
    type: "sentenceEdited",
    sentence: "you want to find an order from the spring",
  });
  const used = dispatched(edited, { type: "presetSuccessUsed" });
  expect(used.success).toBe(initialPanel().success);
  expect(usesPresetSuccess(used)).toBe(true);
  // The person chose it for this sentence: editing the sentence further never empties it again.
  expect(
    dispatched(used, { type: "sentenceEdited", sentence: "you want to find a spring order" })
      .success,
  ).toBe(initialPanel().success);
  // It drops the check, as an accepted task was stored with the success before it.
  const typed = dispatched(ready(), { type: "successEdited", success: "**/archive" });
  expect(dispatched(typed, { type: "presetSuccessUsed" }).check).toStrictEqual({
    status: "unchecked",
  });
});

test("editing the success keeps its pattern as typed and drops the check", () => {
  const text = dispatched(ready(), { type: "successEdited", success: "**/deliveries/archive " });
  expect(text.success).toBe("**/deliveries/archive ");
  expect(text.check).toStrictEqual({ status: "unchecked" });
  expect(usesPresetSuccess(text)).toBe(false);
  expect(text.sentence).toBe(hard.sentence);
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
    dispatched(checking, { type: "checkAnswered", for: checkedFor(checking), extraction: accepted })
      .check,
  ).toStrictEqual({ status: "accepted", task: acceptedTask, rewritten: false });
  expect(
    dispatched(checking, { type: "checkAnswered", for: checkedFor(checking), extraction: refused })
      .check,
  ).toStrictEqual({
    status: "refused",
    goal: refused.goal,
    survived: ["settings"],
    error: refused.error,
  });
  expect(
    dispatched(checking, {
      type: "checkFailed",
      for: checkedFor(checking),
      message: "io answered 502",
    }).check,
  ).toStrictEqual({ status: "failed", message: "io answered 502" });
});

test("an answer for an older sentence or another preset is dropped: the same state comes back", () => {
  const asked = dispatched(initialPanel(), { type: "checkStarted" });
  const askedFor = checkedFor(asked);
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

test("an answer asked with another success is dropped: the same state comes back", () => {
  const asked = dispatched(initialPanel(), { type: "checkStarted" });
  const askedFor = checkedFor(asked);
  expect(askedFor).toStrictEqual({
    presetId: hard.id,
    sentence: hard.sentence,
    success: "**/deliveries/archive",
  });
  const edited = dispatched(asked, { type: "successEdited", success: "**/deliveries" });
  expect(panelReducer(edited, { type: "checkAnswered", for: askedFor, extraction: accepted })).toBe(
    edited,
  );
  expect(panelReducer(edited, { type: "checkFailed", for: askedFor, message: "late" })).toBe(
    edited,
  );
});

test("taskRequestOf sends the sentence, the preset's start URL and the panel's success, trimmed", () => {
  // Issue #196: an address goal on the hard preset, which opens on the archive's condition.
  const state = dispatched(
    initialPanel(),
    { type: "sentenceEdited", sentence: "you want to verify your delivery address" },
    { type: "successEdited", success: " **/account/address " },
  );
  expect(taskRequestOf(state)).toStrictEqual({
    story: "you want to verify your delivery address",
    startUrl: hard.startUrl,
    success: { type: "urlMatches", pattern: "**/account/address" },
  });
  // The sentence untouched, the request is the preset's goal as it stands.
  expect(taskRequestOf(initialPanel())).toStrictEqual({
    story: hard.sentence,
    startUrl: hard.startUrl,
    success: hard.success,
  });
});

test("taskRequestOf without a success a page can match is a bug, and throws: Check the goal is unavailable then", () => {
  const empty = dispatched(initialPanel(), { type: "successEdited", success: "   " });
  expect(successOf(empty.success)).toBeUndefined();
  expect(() => taskRequestOf(empty)).toThrow(Error);
  const relative = dispatched(initialPanel(), {
    type: "successEdited",
    success: "/account/address",
  });
  expect(() => taskRequestOf(relative)).toThrow(Error);
});

test("an empty success blocks Start first, before the check, and says what to do", () => {
  const empty = dispatched(ready(), { type: "successEdited", success: " " });
  expect(NO_SUCCESS).toBe("Say what counts as arriving: a URL pattern");
  expect(successBlocker(empty.success)).toBe(NO_SUCCESS);
  expect(startBlocker(empty)).toBe(NO_SUCCESS);
  // An edited sentence empties the preset's success, so it is the first thing to do there too.
  const edited = dispatched(ready(), { type: "sentenceEdited", sentence: "find my address" });
  expect(startBlocker(edited)).toBe(NO_SUCCESS);
  // Typed, the check is next.
  expect(
    startBlocker(dispatched(edited, { type: "successEdited", success: "**/account/address" })),
  ).toMatch(/^Check the goal first/);
});

test("a pattern no page's URL could match blocks Start before the check, saying how to start it", () => {
  // The Actor loop refuses each before its first step, so every lane would end in an error.
  expect(UNMATCHABLE_SUCCESS).toBe(
    "Start the URL pattern with **/ to match on any site, or with http:// or https://",
  );
  // Which patterns can match is core's `matchableUrlPattern`, tested there; this is the panel's use.
  const relative = dispatched(ready(), { type: "successEdited", success: "/account/address" });
  expect(successBlocker(relative.success)).toBe(UNMATCHABLE_SUCCESS);
  expect(startBlocker(relative)).toBe(UNMATCHABLE_SUCCESS);
  // Written from the start of a whole URL, the check is next. Blanks around one are trimmed.
  const whole = dispatched(ready(), { type: "successEdited", success: " **/account/address " });
  expect(successBlocker(whole.success)).toBeUndefined();
  expect(startBlocker(whole)).toMatch(/^Check the goal first/);
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
  // After a race, "New race" comes back to a panel whose check the race spent: the next race is
  // checked again, so io mints it a task of its own.
  const raced = dispatched(again, { type: "startSucceeded" });
  expect(raced.starting).toBe(false);
  expect(raced.check).toStrictEqual({ status: "unchecked" });
  expect(startBlocker(raced)).toMatch(/^Check the goal first/);
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
    ["no check", dispatched(ready(), { type: "presetChosen", presetId: hard.id })],
    ["no success", dispatched(ready(), { type: "successEdited", success: "" })],
    [
      "a relative pattern",
      dispatched(ready(), { type: "successEdited", success: "/account/address" }),
    ],
    ["a check under way", dispatched(ready(), { type: "checkStarted" })],
    [
      "a refused check",
      dispatched(ready(), { type: "checkAnswered", for: checkedFor(ready()), extraction: refused }),
    ],
    [
      "a failed check",
      dispatched(ready(), {
        type: "checkFailed",
        for: checkedFor(ready()),
        message: "io answered 502",
      }),
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
    { type: "checkAnswered", for: checkedFor(clicked), extraction: accepted },
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

test("goalLabel names the preset a stored task was checked from by its start URL and success", () => {
  // The Extractor stores each checked sentence under a new id, which names no preset.
  expect(goalLabel(acceptedTask)).toBe("Hard goal");
  expect(goalLabel({ startUrl: easy.startUrl, success: easy.success })).toBe("Easy goal");
  // Another success condition on the same page, or another site, is no preset's.
  expect(
    goalLabel({
      startUrl: hard.startUrl,
      success: { type: "urlMatches", pattern: "**/elsewhere" },
    }),
  ).toBe("Goal");
  expect(goalLabel({ startUrl: "https://example.com/", success: hard.success })).toBe("Goal");
});

test("presetTaskOf names the preset's own task only when the goal is its sentence word for word", () => {
  // The check minted a new task id, but the goal is the hard preset's sentence as it stands.
  expect(acceptedTask.goal).toBe(hard.sentence);
  expect(presetTaskOf(acceptedTask)).toBe(hard.id);
  // An edited sentence, or one the check rewrote, is no longer the goal the stored report is on.
  expect(presetTaskOf({ ...acceptedTask, goal: "find what you ordered in the summer" })).toBe(
    undefined,
  );
  // Nor is the preset's sentence with a success of the person's own: the preset's report counts
  // arriving at the preset's page, so it is on another goal.
  const typed = { type: "urlMatches" as const, pattern: "**/account/address" };
  expect(presetTaskOf({ ...acceptedTask, success: typed })).toBe(undefined);
});
