import type { StartedRun, Task } from "@wayford/core";
import { afterEach, expect, test, vi } from "vitest";
import { bundledProfiles } from "../bundled-fixtures.js";
import { dispatched, foreignTask, withPersonas } from "./fixture-race.js";
import { checkGoal, startRace } from "./panel-calls.js";
import {
  checkedFor,
  GOAL_PRESETS,
  initialPanel,
  MIN_PERSONAS,
  type PanelAction,
  type PanelState,
  panelReducer,
  startBlocker,
  storedGoalOf,
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
    for: checkedFor(chosen),
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
      for: { goalId: asked.goal.id, sentence: asked.sentence, success: asked.success },
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
  const fetch = answer(Response.json({ raceId: "race_hard-1", runs: started }, { status: 202 }));
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
  // The race io keeps, which the screen opens by its id: io holds its task, seed and runs.
  expect(race).toBe("race_hard-1");
  // "New race" comes back to a panel whose check the race spent, so the next race is checked anew
  // and gets a task of its own: its report then reads its runs alone.
  expect(screen.state().starting).toBe(false);
  expect(startBlocker(screen.state())).toMatch(/^Check the goal first/);
});

test("a stored goal starts with POST /runs alone, no POST /tasks", async () => {
  const started: StartedRun[] = bundledProfiles.slice(0, MIN_PERSONAS).map((profile, i) => ({
    id: `run_stored-${i + 1}`,
    profileId: profile.id,
    seed: 1,
  }));
  const fetch = answer(Response.json({ raceId: "race_stored-1", runs: started }, { status: 202 }));
  const opened = dispatched(initialPanel(), {
    type: "goalChosen",
    goal: storedGoalOf(foreignTask),
  });
  const screen = panel(withPersonas(opened, bundledProfiles.slice(0, MIN_PERSONAS)));

  const race = await startRace(screen.state(), bundledProfiles, screen.dispatch);

  // One call, to /runs, on the stored task's id: io checked its goal when it stored it.
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0] ?? [];
  expect(url).toBe("/api/runs");
  expect(JSON.parse(String(init?.body))).toStrictEqual({
    taskId: foreignTask.id,
    profileIds: bundledProfiles.slice(0, MIN_PERSONAS).map((profile) => profile.id),
    seeds: [1],
  });
  expect(screen.actions.map(({ type }) => type)).toStrictEqual(["startStarted", "startSucceeded"]);
  expect(race).toBe("race_stored-1");
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
