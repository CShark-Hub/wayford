import type { Task } from "@wayford/core";
import { afterEach, expect, test, vi } from "vitest";
import type { StartedRun } from "../api/runs.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { dispatched, forOf, withPersonas } from "./fixture-race.js";
import { checkGoal, startRace } from "./panel-calls.js";
import {
  GOAL_PRESETS,
  initialPanel,
  MIN_PERSONAS,
  type PanelAction,
  type PanelState,
  panelReducer,
  startBlocker,
} from "./panel-state.js";

const hard = GOAL_PRESETS.find(({ label }) => label === "Hard goal");
if (!hard) throw new Error("the arena has a hard goal preset");

/** The task io stores for the hard goal, as its 201 hands it back. */
const acceptedTask: Task = {
  id: "task_ordered-three-months-ago",
  goal: "you want to see what you ordered three months ago",
  startUrl: hard.startUrl,
  success: hard.success,
  sourceStory: hard.sentence,
  strippedPaths: [],
};

/**
 * A panel the screen would hold, from `state` on: `dispatch` records each action and applies it
 * with `panelReducer`, as `useReducer` does, and `state()` reads the panel now.
 */
function panel(state: PanelState) {
  let current = state;
  const actions: PanelAction[] = [];
  return {
    actions,
    state: () => current,
    dispatch: (action: PanelAction) => {
      actions.push(action);
      current = panelReducer(current, action);
    },
  };
}

/** Make `fetch` answer with `response`, and hand back the stub to inspect calls. */
function answer(response: Response) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** The hard goal checked and accepted, three personas chosen, seed 1: Start can start. */
function ready(): PanelState {
  const chosen = withPersonas(initialPanel(), bundledProfiles.slice(0, MIN_PERSONAS));
  return dispatched(chosen, {
    type: "checkAnswered",
    for: forOf(chosen),
    extraction: { ok: true, task: acceptedTask, rewritten: false },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("checkGoal: a sentence edited while io checks the old one drops the late answer", async () => {
  const asked = initialPanel();
  const screen = panel(asked);
  // io answers only when the test says so.
  let respond: (response: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>((resolve) => (respond = resolve))),
  );

  const checking = checkGoal(screen.state(), screen.dispatch);
  expect(screen.state().check).toStrictEqual({ status: "checking" });
  screen.dispatch({ type: "sentenceEdited", sentence: "find my last order" });
  respond(Response.json({ task: acceptedTask, rewritten: false }, { status: 201 }));
  await checking;

  // The answer came tagged with what was asked, so the reducer dropped it.
  expect(screen.actions).toStrictEqual([
    { type: "checkStarted" },
    { type: "sentenceEdited", sentence: "find my last order" },
    {
      type: "checkAnswered",
      for: { presetId: asked.presetId, sentence: asked.sentence },
      extraction: { ok: true, task: acceptedTask, rewritten: false },
    },
  ]);
  expect(screen.state().sentence).toBe("find my last order");
  expect(screen.state().check).toStrictEqual({ status: "unchecked" });
});

test("startRace: io's 202 starts the race, and spends the check, so the next race is checked anew", async () => {
  const started: StartedRun[] = bundledProfiles.slice(0, MIN_PERSONAS).map((profile, i) => ({
    id: `run_race-${i + 1}`,
    profileId: profile.id,
    seed: 1,
  }));
  const fetch = answer(Response.json({ runs: started }, { status: 202 }));
  const screen = panel(ready());

  const race = await startRace(screen.state(), bundledProfiles, screen.dispatch);

  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0] ?? [];
  expect(url).toBe("/api/runs");
  expect(JSON.parse(String(init?.body))).toStrictEqual({
    taskId: acceptedTask.id,
    profileIds: bundledProfiles.slice(0, MIN_PERSONAS).map((profile) => profile.id),
    seeds: [1],
  });
  expect(screen.actions.map(({ type }) => type)).toStrictEqual(["startStarted", "startSucceeded"]);
  // The task the check accepted, so the race shows its id, goal and success condition, and the
  // chosen preset's label. The goal is the preset's sentence as it stands, so the race names the
  // preset's own task, whose report is stored.
  expect(race).toStrictEqual({
    task: acceptedTask,
    label: "Hard goal",
    seed: 1,
    runs: started,
    presetTask: hard.id,
  });
  // "New race" comes back to a panel whose check the race spent, so the next race is checked anew
  // and gets a task of its own: its report then reads its runs alone.
  expect(screen.state().starting).toBe(false);
  expect(startBlocker(screen.state())).toMatch(/^Check the goal first/);
});

test("startRace: a goal that is not the preset's sentence word for word names no preset task", async () => {
  const started: StartedRun[] = [{ id: "run_race-1", profileId: "prof_ada", seed: 1 }];
  const edited = { ...acceptedTask, goal: "find what you ordered in the summer" };
  for (const extraction of [
    { ok: true as const, task: edited, rewritten: false },
    { ok: true as const, task: edited, rewritten: true },
  ]) {
    answer(Response.json({ runs: started }, { status: 202 }));
    const chosen = withPersonas(initialPanel(), bundledProfiles.slice(0, MIN_PERSONAS));
    const state = dispatched(chosen, { type: "checkAnswered", for: forOf(chosen), extraction });
    const race = await startRace(state, bundledProfiles, panel(state).dispatch);
    expect(race?.presetTask, `rewritten: ${extraction.rewritten}`).toBeUndefined();
  }
});

test("startRace: io's refusal is the panel's alert, and no race starts", async () => {
  answer(Response.json({ error: "llm_unavailable: the provider did not answer" }, { status: 502 }));
  const screen = panel(ready());

  const race = await startRace(screen.state(), bundledProfiles, screen.dispatch);

  expect(race).toBeUndefined();
  expect(screen.actions).toStrictEqual([
    { type: "startStarted" },
    {
      type: "startFailed",
      message: "io answered 502: llm_unavailable: the provider did not answer",
    },
  ]);
  expect(screen.state().starting).toBe(false);
  expect(screen.state().startError).toBe(
    "io answered 502: llm_unavailable: the provider did not answer",
  );
});
