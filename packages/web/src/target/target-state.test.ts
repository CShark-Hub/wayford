import type { StartedRun, Task } from "@wayford/core";
import { profileFixture, profileFixtures, taskFixture } from "@wayford/core/fixtures";
import { afterEach, expect, test, vi } from "vitest";
import type { Extraction } from "../api/runs.js";
import { UNMATCHABLE_SUCCESS } from "../arena/panel-state.js";
import {
  type FormAction,
  formBlocker,
  formReducer,
  type GoalAction,
  type GoalState,
  goalReducer,
  initialForm,
  initialGoal,
  runSetBlocker,
  runsRequestOf,
  type TargetForm,
  taskRequestOf,
} from "./target-state.js";

const ada = profileFixture("prof_ada");
const vera = profileFixture("prof_vera");

/** The task io stores for the hard goal, as its 201 hands it back. */
const task: Task = taskFixture("task_past-order");

const accepted: Extraction = { ok: true, task, rewritten: false };

const refused: Extraction = {
  ok: false,
  error: "The goal failed the task check after one repair round",
  goal: "open Orders to see what I ordered",
  survived: ["orders"],
};

/** `actions` dispatched in order, from `form`. */
function formAfter(form: TargetForm, ...actions: FormAction[]): TargetForm {
  return actions.reduce(formReducer, form);
}

/** `actions` dispatched in order, from `state`. */
function goalAfter(state: GoalState, ...actions: GoalAction[]): GoalState {
  return actions.reduce(goalReducer, state);
}

/** A form with every field typed: "Check the goal" can run. */
function filled(): TargetForm {
  return formAfter(
    initialForm(),
    { type: "startUrlEdited", startUrl: "https://shop.example.com/" },
    { type: "storyEdited", story: "you want to see what you ordered three months ago" },
    { type: "successValueEdited", successValue: "**/orders/*" },
  );
}

/** `filled`, with an element on the page as its success: `selector`. */
function withSelector(selector: string): TargetForm {
  return formAfter(
    filled(),
    { type: "successKindChosen", successKind: "selectorPresent" },
    { type: "successValueEdited", successValue: selector },
  );
}

/** Ada and Vera on each of seeds 1 to 3, seed-major, as io's 202 hands them back. */
const sixRuns: StartedRun[] = [1, 2, 3].flatMap((seed) =>
  [ada, vera].map((profile) => ({
    id: `run_${profile.label.toLowerCase()}-${seed}`,
    profileId: profile.id,
    seed,
  })),
);

/** Ada and Vera chosen, three seeds, nothing started. */
function chosen(): GoalState {
  return goalAfter(
    initialGoal(),
    { type: "personaToggled", profileId: ada.id },
    { type: "personaToggled", profileId: vera.id },
  );
}

/** `chosen`'s six runs started, none ended. */
function running(): GoalState {
  return goalAfter(chosen(), { type: "runsStarting" }, { type: "runsStarted", runs: sixRuns });
}

/** The ids of `sixRuns` from `from` to `to`, as a poll reports them stored. */
function idsOf(from: number, to?: number) {
  return sixRuns.slice(from, to).map((run) => run.id);
}

/** One of each run set status. */
function everyStatus(): Record<GoalState["runSet"]["status"], GoalState> {
  return {
    idle: chosen(),
    starting: goalAfter(chosen(), { type: "runsStarting" }),
    running: running(),
    ended: goalAfter(running(), { type: "runsPolled", ended: idsOf(0) }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("each edit keeps what was typed and resets the check", () => {
  const edits: FormAction[] = [
    { type: "startUrlEdited", startUrl: "https://other.example.com/" },
    { type: "storyEdited", story: "you want to change where your parcels go" },
    { type: "successKindChosen", successKind: "selectorPresent" },
    { type: "successValueEdited", successValue: "#order-history" },
  ];
  const checks: TargetForm[] = [
    formAfter(filled(), { type: "checkStarted" }),
    formAfter(filled(), { type: "checkAnswered", extraction: refused }),
    formAfter(filled(), { type: "checkFailed", message: "io answered 502" }),
  ];
  for (const form of checks) {
    for (const edit of edits) {
      const edited = formReducer(form, edit);
      expect(edited.check, `${edit.type} after ${form.check.status}`).toStrictEqual({
        status: "unchecked",
      });
      const { type: _type, ...typed } = edit;
      expect(edited).toMatchObject(typed);
    }
  }
  // Choosing the other kind keeps the value: the one input stays as typed.
  const selector = formAfter(filled(), {
    type: "successKindChosen",
    successKind: "selectorPresent",
  });
  expect(selector.successValue).toBe("**/orders/*");
});

test("a check goes checking, then refused with io's reasons, or failed with its message", () => {
  const checking = formAfter(filled(), { type: "checkStarted" });
  expect(checking.check).toStrictEqual({ status: "checking" });
  expect(formAfter(checking, { type: "checkAnswered", extraction: refused }).check).toStrictEqual({
    status: "refused",
    goal: refused.goal,
    survived: ["orders"],
    error: refused.error,
  });
  expect(
    formAfter(checking, { type: "checkFailed", message: "io answered 502" }).check,
  ).toStrictEqual({ status: "failed", message: "io answered 502" });
});

test("an accepted goal leaves the form unchecked, as typed: the screen navigates to it", () => {
  const checking = formAfter(filled(), { type: "checkStarted" });
  expect(formAfter(checking, { type: "checkAnswered", extraction: accepted })).toStrictEqual({
    ...filled(),
    check: { status: "unchecked" },
  });
});

test("formBlocker gives the first thing to do: check, URL, a URL HttpUrl takes, goal, success", () => {
  const steps: [string, TargetForm, string | undefined][] = [
    [
      "a check under way",
      formAfter(initialForm(), { type: "checkStarted" }),
      "The goal is being checked",
    ],
    ["no start URL", initialForm(), "Enter a start URL: the page every run starts on"],
    [
      "a start URL HttpUrl refuses",
      formAfter(initialForm(), { type: "startUrlEdited", startUrl: "shop.example.com" }),
      "Enter the start URL as a full http or https address, such as https://example.com/",
    ],
    [
      "no goal",
      formAfter(initialForm(), { type: "startUrlEdited", startUrl: "https://shop.example.com/" }),
      "Write the goal: what the person wants, in one sentence",
    ],
    [
      "no pattern",
      formAfter(filled(), { type: "successValueEdited", successValue: "" }),
      "Enter the URL pattern a run reaches when it succeeds",
    ],
    [
      "no selector",
      withSelector(""),
      "Enter the CSS selector of the element a run finds when it succeeds",
    ],
    [
      "a pattern no run could meet",
      formAfter(filled(), { type: "successValueEdited", successValue: "/orders/*" }),
      UNMATCHABLE_SUCCESS,
    ],
    ["every field typed", filled(), undefined],
  ];
  for (const [what, form, reason] of steps) expect(formBlocker(form), what).toBe(reason);
});

test("formBlocker holds a URL pattern to core's matchableUrlPattern: *, http:// or https://", () => {
  const withPattern = (successValue: string) =>
    formBlocker(formAfter(filled(), { type: "successValueEdited", successValue }));
  // agent's `checkSuccessCondition` would end every run on these `runFailed` before step 1.
  for (const pattern of ["/orders/*", "orders", "example.com/orders", "{**/a,**/b}"]) {
    expect(withPattern(pattern), pattern).toBe(UNMATCHABLE_SUCCESS);
  }
  for (const pattern of [
    "**/orders/*",
    "https://example.com/orders/*",
    "*://x/*",
    " **/orders/* ",
  ]) {
    expect(withPattern(pattern), pattern).toBeUndefined();
  }
  // A selector is not a URL: the rule is the pattern's alone.
  expect(formBlocker(withSelector("orders"))).toBeUndefined();
});

test("formBlocker holds a selector to what the page's own querySelector parses", () => {
  // The browser's `document`, as the screen runs in it: a selector it cannot parse throws.
  const parses = (selector: string) => !/^text=|:has-text|^#\d/.test(selector);
  vi.stubGlobal("document", {
    createDocumentFragment: () => ({
      querySelector: (selector: string) => {
        if (!parses(selector)) throw new SyntaxError(`'${selector}' is not a valid selector`);
        return null;
      },
    }),
  });
  for (const selector of ["text=Order history", 'button:has-text("Buy")', "#1abc"]) {
    expect(formBlocker(withSelector(selector)), selector).toBe(
      "Enter a CSS selector, such as #order-history: Playwright's text= and :has-text are not CSS",
    );
  }
  expect(formBlocker(withSelector(" #order-history "))).toBeUndefined();
});

test("formBlocker reads each field trimmed, the start URL through core's HttpUrl", () => {
  const blank = (action: FormAction) => formBlocker(formAfter(filled(), action));
  expect(blank({ type: "startUrlEdited", startUrl: "   " })).toMatch(/^Enter a start URL/);
  expect(blank({ type: "storyEdited", story: " \n " })).toMatch(/^Write the goal/);
  expect(blank({ type: "successValueEdited", successValue: "  " })).toMatch(/^Enter the URL/);
  expect(
    blank({ type: "startUrlEdited", startUrl: " https://shop.example.com/ " }),
  ).toBeUndefined();
});

test("a refused or failed check does not block another check", () => {
  expect(formBlocker(formAfter(filled(), { type: "checkAnswered", extraction: refused }))).toBe(
    undefined,
  );
  expect(formBlocker(formAfter(filled(), { type: "checkFailed", message: "late" }))).toBe(
    undefined,
  );
});

test("taskRequestOf trims each field and builds success from the kind chosen", () => {
  const typed = formAfter(
    initialForm(),
    { type: "startUrlEdited", startUrl: "  https://shop.example.com/  " },
    { type: "storyEdited", story: "\tyou want to see what you ordered three months ago \n" },
    { type: "successValueEdited", successValue: " **/orders/* " },
  );
  expect(taskRequestOf(typed)).toStrictEqual({
    story: "you want to see what you ordered three months ago",
    startUrl: "https://shop.example.com/",
    success: { type: "urlMatches", pattern: "**/orders/*" },
  });
  const selector = formAfter(
    typed,
    { type: "successKindChosen", successKind: "selectorPresent" },
    { type: "successValueEdited", successValue: " #order-history " },
  );
  expect(taskRequestOf(selector).success).toStrictEqual({
    type: "selectorPresent",
    selector: "#order-history",
  });
});

test("a persona toggles on and off, in the order clicked, with no cap: all five can run", () => {
  expect(chosen().profileIds).toStrictEqual([ada.id, vera.id]);
  expect(
    goalAfter(chosen(), { type: "personaToggled", profileId: ada.id }).profileIds,
  ).toStrictEqual([vera.id]);
  const all = goalAfter(
    initialGoal(),
    ...profileFixtures.map((p): GoalAction => ({ type: "personaToggled", profileId: p.id })),
  );
  expect(all.profileIds).toStrictEqual(profileFixtures.map((profile) => profile.id));
});

test("persona and seed edits are refused while a set starts or runs: the same state", () => {
  const statuses = everyStatus();
  const edits: GoalAction[] = [
    { type: "personaToggled", profileId: ada.id },
    { type: "personaToggled", profileId: profileFixture("prof_zoya").id },
    { type: "seedCountChosen", seedCount: 10 },
  ];
  for (const status of ["starting", "running"] as const) {
    const state = statuses[status];
    for (const edit of edits)
      expect(goalReducer(state, edit), `${edit.type} ${status}`).toBe(state);
  }
  // Idle and once a set has ended, another set can be chosen.
  for (const status of ["idle", "ended"] as const) {
    const state = statuses[status];
    expect(
      goalAfter(state, { type: "personaToggled", profileId: ada.id }).profileIds,
    ).toStrictEqual([vera.id]);
    expect(goalAfter(state, { type: "seedCountChosen", seedCount: 10 }).seedCount).toBe(10);
  }
});

test("runsStarting goes starting from idle or ended; while one starts or runs, the same state", () => {
  const statuses = everyStatus();
  for (const status of ["idle", "ended"] as const) {
    expect(goalAfter(statuses[status], { type: "runsStarting" }).runSet, status).toStrictEqual({
      status: "starting",
    });
  }
  for (const status of ["starting", "running"] as const) {
    expect(goalReducer(statuses[status], { type: "runsStarting" }), status).toBe(statuses[status]);
  }
});

test("a start goes running with no run ended, or back to idle with io's reason", () => {
  expect(running().runSet).toStrictEqual({ status: "running", runs: sixRuns, ended: [] });
  const failed = goalAfter(
    chosen(),
    { type: "runsStarting" },
    { type: "runsFailed", message: "io answered 404: no profile prof_x" },
  );
  expect(failed.runSet).toStrictEqual({
    status: "idle",
    error: "io answered 404: no profile prof_x",
  });
  // Starting again drops the old reason.
  expect(goalAfter(failed, { type: "runsStarting" }).runSet).toStrictEqual({ status: "starting" });
});

test("runsPolled adds the newly stored ids once each, and only the set's own", () => {
  const two = goalAfter(running(), { type: "runsPolled", ended: idsOf(0, 2) });
  expect(two.runSet).toStrictEqual({ status: "running", runs: sixRuns, ended: idsOf(0, 2) });
  const three = goalAfter(two, {
    type: "runsPolled",
    ended: [...idsOf(1, 3), ...idsOf(2, 3), "run_someone-else"],
  });
  expect(three.runSet).toStrictEqual({ status: "running", runs: sixRuns, ended: idsOf(0, 3) });
});

test("a poll's fault is kept until a clean poll clears it", () => {
  const faulted = goalAfter(running(), {
    type: "runsPolled",
    ended: idsOf(0, 1),
    error: "io answered 502",
  });
  expect(faulted.runSet).toStrictEqual({
    status: "running",
    runs: sixRuns,
    ended: idsOf(0, 1),
    pollError: "io answered 502",
  });
  const again = goalAfter(faulted, { type: "runsPolled", ended: [], error: "io answered 500" });
  expect(again.runSet).toMatchObject({ pollError: "io answered 500" });
  const clean = goalAfter(again, { type: "runsPolled", ended: idsOf(1, 2) });
  expect(clean.runSet).toStrictEqual({ status: "running", runs: sixRuns, ended: idsOf(0, 2) });
});

test("the last run stored ends the set, with or without a fault on that poll", () => {
  const five = goalAfter(running(), { type: "runsPolled", ended: idsOf(0, 5) });
  expect(five.runSet.status).toBe("running");
  const last = goalAfter(five, { type: "runsPolled", ended: idsOf(5), error: "io answered 502" });
  expect(last.runSet).toStrictEqual({ status: "ended" });
});

test("runsPolled outside a running set returns the same state", () => {
  const statuses = everyStatus();
  for (const status of ["idle", "starting", "ended"] as const) {
    const state = statuses[status];
    expect(goalReducer(state, { type: "runsPolled", ended: idsOf(0) }), status).toBe(state);
  }
});

test("reportAsked ends a running set however many runs have ended, and nothing else", () => {
  const stalled = goalAfter(running(), { type: "runsPolled", ended: idsOf(0, 4) });
  expect(goalAfter(stalled, { type: "reportAsked" }).runSet).toStrictEqual({ status: "ended" });
  // An ended set ends once: asked again it hands back the same state, so nothing posts twice.
  const statuses = everyStatus();
  for (const status of ["idle", "starting", "ended"] as const) {
    expect(goalReducer(statuses[status], { type: "reportAsked" }), status).toBe(statuses[status]);
  }
});

test("runSetBlocker: a set under way first, then a report being written, then too few personas", () => {
  const statuses = everyStatus();
  expect(runSetBlocker(statuses.starting, false)).toBe("The runs are starting");
  expect(runSetBlocker(statuses.running, true)).toBe(
    "Wait for these runs to end before you start more",
  );
  // A set under way comes first, even with too few personas chosen.
  const alone = { ...statuses.running, profileIds: [ada.id] };
  expect(runSetBlocker(alone, false)).toBe("Wait for these runs to end before you start more");
  for (const status of ["idle", "ended"] as const) {
    expect(runSetBlocker(statuses[status], true), status).toBe(
      "Wait for the report before you start more runs",
    );
    expect(runSetBlocker(statuses[status], false), status).toBeUndefined();
  }
  expect(runSetBlocker(initialGoal(), false)).toBe(
    "Choose 2 more personas: the report compares at least 2",
  );
  expect(runSetBlocker({ ...chosen(), profileIds: [ada.id] }, false)).toBe(
    "Choose 1 more persona: the report compares at least 2",
  );
});

test("runsRequestOf sends the task, the personas in the list's order, the seeds, on the LLM", () => {
  const clicked = goalAfter(
    initialGoal(),
    { type: "personaToggled", profileId: vera.id },
    { type: "personaToggled", profileId: ada.id },
    { type: "seedCountChosen", seedCount: 10 },
  );
  expect(clicked.profileIds).toStrictEqual([vera.id, ada.id]);
  expect(runsRequestOf(task, clicked, profileFixtures)).toStrictEqual({
    taskId: "task_past-order",
    profileIds: [ada.id, vera.id],
    seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    backend: "llm",
  });
  expect(runsRequestOf(task, chosen(), profileFixtures).seeds).toStrictEqual([1, 2, 3]);
});
