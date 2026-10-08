import { MutationObserver, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterContextProvider, RouterProvider } from "@tanstack/react-router";
import { GroundTruth, type RunId, type StartedRun, type Task, type TaskId } from "@wayford/core";
import {
  groundTruthFixture,
  profileFixture,
  profileFixtures,
  reportFixture,
  runResultFixture,
  taskFixture,
} from "@wayford/core/fixtures";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { reportQuery } from "../api/reports.js";
import { storedTaskQuery } from "../api/runs.js";
import { readScout, startScout } from "../api/scout.js";
import { attributesOf, elementOf, lineOf, sectionOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import {
  checkTarget,
  dispatchScout,
  pollRunSet,
  reportMutation,
  startRunSet,
} from "../target/target-calls.js";
import {
  type FormAction,
  formReducer,
  type GoalAction,
  type GoalState,
  goalReducer,
  initialForm,
  initialGoal,
  type RunSet,
  type ScoutState,
  type TargetForm,
} from "../target/target-state.js";
import { GoalView, type ReportState, TargetFormView } from "../target/target-view.js";

const ada = profileFixture("prof_ada");
const vera = profileFixture("prof_vera");

/** The hard goal as io stores it: the goal its 201 hands back, and the task a goal view draws. */
const task: Task = taskFixture("task_past-order");

/** `actions` dispatched in order, from `form`. */
function formAfter(form: TargetForm, ...actions: FormAction[]): TargetForm {
  return actions.reduce(formReducer, form);
}

/** `actions` dispatched in order, from `state`. */
function goalAfter(state: GoalState, ...actions: GoalAction[]): GoalState {
  return actions.reduce(goalReducer, state);
}

/**
 * A screen from `state` on: `dispatch` records each action and applies it with `reducer`, as
 * `useReducer` does, and `state()` reads the state now.
 */
function screen<S, A>(reducer: (state: S, action: A) => S, state: S) {
  let current = state;
  const actions: A[] = [];
  return {
    actions,
    state: () => current,
    dispatch: (action: A) => {
      actions.push(action);
      current = reducer(current, action);
    },
  };
}

/**
 * Make `fetch` answer each call with what `respond` builds for its URL, a fresh `Response` each
 * time, since a body reads once. The stub is handed back to inspect the calls.
 */
function route(respond: (url: string) => Response) {
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => respond(url));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** Make `fetch` answer every call with a copy of `response`. */
function answer(response: Response) {
  return route(() => response.clone());
}

/** What the one call to the `fetch` stub sent: its URL, method and parsed body. */
function sent(fetch: ReturnType<typeof route>) {
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0] ?? [];
  return { url, method: init?.method, body: JSON.parse(String(init?.body)) as unknown };
}

/** The URL of every call to the `fetch` stub, in the order made. */
function urls(fetch: ReturnType<typeof route>): string[] {
  return fetch.mock.calls.map(([url]) => url);
}

/** The hard goal typed into the form: its start URL, its goal sentence and its URL pattern. */
function typed(): TargetForm {
  return formAfter(
    initialForm(),
    { type: "startUrlEdited", startUrl: task.startUrl },
    { type: "storyEdited", story: task.goal },
    { type: "successValueEdited", successValue: "**/deliveries/archive" },
  );
}

/** Ada and Vera clicked Vera first, three seeds, nothing started. */
function chosen(): GoalState {
  return goalAfter(
    initialGoal(),
    { type: "personaToggled", profileId: vera.id },
    { type: "personaToggled", profileId: ada.id },
  );
}

const { shortest: _shortest, target: _target, ...unreached } = groundTruthFixture;

/** Scout's ground truth with no attempt reaching the goal: three that gave up. */
const notReached = GroundTruth.parse({
  ...unreached,
  reached: false,
  attempts: ["1", "2", "3"].map((n) => ({ runId: `run_scout-hard-${n}`, outcome: "gave_up" })),
});

/** Ada and Vera on seed 1, as io's 202 hands them back. */
const twoRuns: StartedRun[] = [
  { id: "run_ada-1", profileId: ada.id, seed: 1 },
  { id: "run_vera-1", profileId: vera.id, seed: 1 },
];

/** `twoRuns` started, none ended. */
function running(): GoalState {
  return goalAfter(chosen(), { type: "runsStarting" }, { type: "runsStarted", runs: twoRuns });
}

/** A run io has stored under `id`: the fixture run, renamed. */
function storedRun(id: RunId): Response {
  return Response.json({ ...runResultFixture, id });
}

/** io's 404 for a run still in flight. */
function inFlight(id: RunId): Response {
  return Response.json({ error: `no stored run ${id}` }, { status: 404 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("calls", () => {
  test("checkTarget: io's 201 is the task, and checkAnswered carries it", async () => {
    const fetch = answer(Response.json({ task, rewritten: false }, { status: 201 }));
    const form = screen(formReducer, typed());

    const checked = await checkTarget(form.state(), form.dispatch);

    expect(checked).toStrictEqual(task);
    expect(sent(fetch)).toStrictEqual({
      url: "/api/tasks",
      method: "POST",
      body: {
        story: task.goal,
        startUrl: task.startUrl,
        // The condition as typed: the model never writes one.
        success: { type: "urlMatches", pattern: "**/deliveries/archive" },
      },
    });
    expect(form.actions).toStrictEqual([
      { type: "checkStarted" },
      { type: "checkAnswered", extraction: { ok: true, task, rewritten: false } },
    ]);
  });

  test("checkTarget: io's 422 is the refusal, dispatched as checkAnswered, and no task", async () => {
    const refusal = {
      error: "The goal failed the task check after one repair round",
      goal: "open Deliveries to see what I ordered",
      survived: ["Deliveries"],
    };
    const fetch = answer(Response.json(refusal, { status: 422 }));
    const form = screen(
      formReducer,
      formAfter(
        typed(),
        { type: "successKindChosen", successKind: "selectorPresent" },
        { type: "successValueEdited", successValue: "#order-history" },
      ),
    );

    const checked = await checkTarget(form.state(), form.dispatch);

    expect(checked).toBeUndefined();
    expect(sent(fetch).body).toMatchObject({
      success: { type: "selectorPresent", selector: "#order-history" },
    });
    expect(form.actions).toStrictEqual([
      { type: "checkStarted" },
      { type: "checkAnswered", extraction: { ok: false, ...refusal } },
    ]);
  });

  test("checkTarget: a 502 is the form's failure, with io's reason, and no task", async () => {
    answer(
      Response.json({ error: "llm_unavailable: the provider did not answer" }, { status: 502 }),
    );
    const form = screen(formReducer, typed());

    const checked = await checkTarget(form.state(), form.dispatch);

    expect(checked).toBeUndefined();
    expect(form.actions).toStrictEqual([
      { type: "checkStarted" },
      {
        type: "checkFailed",
        message: "io answered 502: llm_unavailable: the provider did not answer",
      },
    ]);
  });

  // How each status reads is `api/scout.test.ts`'s; this tests only what is dispatched.
  test("dispatchScout: io's answer is scoutRead, and a rejection a failed Scout with its message", async () => {
    answer(Response.json(groundTruthFixture));
    const goal = screen(goalReducer, initialGoal());
    await dispatchScout(readScout(task.id), goal.dispatch);
    // Vite's proxy while io is down, then a start io refused.
    answer(new Response("Bad Gateway", { status: 502 }));
    await dispatchScout(readScout(task.id), goal.dispatch);
    answer(Response.json({ error: "no task task_past-order" }, { status: 404 }));
    await expect(dispatchScout(startScout(task.id), goal.dispatch)).resolves.toBeUndefined();

    const scouts: ScoutState[] = [
      { status: "done", truth: groundTruthFixture },
      { status: "failed", message: "io answered 502" },
      { status: "failed", message: "io answered 404: no task task_past-order" },
    ];
    expect(goal.actions).toStrictEqual(scouts.map((scout) => ({ type: "scoutRead", scout })));
  });

  test("startRunSet: POSTs the personas in the list's order, seeds 1 to 3, on the LLM", async () => {
    const sixRuns: StartedRun[] = [1, 2, 3].flatMap((seed) =>
      [ada, vera].map((profile) => ({
        id: `run_${profile.label.toLowerCase()}-${seed}`,
        profileId: profile.id,
        seed,
      })),
    );
    const fetch = answer(
      Response.json({ raceId: "race_ada-vera", runs: sixRuns }, { status: 202 }),
    );
    const goal = screen(goalReducer, chosen());

    await startRunSet(task, goal.state(), profileFixtures, goal.dispatch);

    expect(sent(fetch)).toStrictEqual({
      url: "/api/runs",
      method: "POST",
      // Vera was clicked first; the list puts Ada first.
      body: { taskId: task.id, profileIds: [ada.id, vera.id], seeds: [1, 2, 3], backend: "llm" },
    });
    expect(goal.actions).toStrictEqual([
      { type: "runsStarting" },
      { type: "runsStarted", runs: sixRuns },
    ]);
  });

  test("startRunSet: io's 404 dispatches runsFailed, with io's reason", async () => {
    answer(Response.json({ error: "no task task_past-order" }, { status: 404 }));
    const goal = screen(goalReducer, chosen());

    await expect(
      startRunSet(task, goal.state(), profileFixtures, goal.dispatch),
    ).resolves.toBeUndefined();

    expect(goal.actions).toStrictEqual([
      { type: "runsStarting" },
      { type: "runsFailed", message: "io answered 404: no task task_past-order" },
    ]);
  });

  test("pollRunSet: the runs io has stored are ended, the rest are not, with no error", async () => {
    const fetch = route((url) =>
      url.endsWith("/run_ada-1") ? storedRun("run_ada-1") : inFlight("run_vera-1"),
    );
    const goal = screen(goalReducer, running());

    await pollRunSet(goal.state().runSet, goal.dispatch);

    expect(urls(fetch).toSorted()).toStrictEqual(["/api/runs/run_ada-1", "/api/runs/run_vera-1"]);
    // `toStrictEqual`: `error` is absent, not undefined.
    expect(goal.actions).toStrictEqual([{ type: "runsPolled", ended: ["run_ada-1"] }]);
  });

  test("pollRunSet: a rejected call keeps its run going and puts its message in error", async () => {
    const goal = screen(goalReducer, running());
    // Both calls reject: the first message, in the set's order, is the poll's error.
    route((url) =>
      url.endsWith("/run_ada-1")
        ? Response.json({ error: "internal error" }, { status: 500 })
        : new Response("Bad Gateway", { status: 502 }),
    );
    await pollRunSet(goal.state().runSet, goal.dispatch);
    // Ada stored, Vera's call rejected.
    route((url) =>
      url.endsWith("/run_ada-1")
        ? storedRun("run_ada-1")
        : Response.json({ error: "internal error" }, { status: 500 }),
    );
    await pollRunSet(goal.state().runSet, goal.dispatch);

    expect(goal.actions).toStrictEqual([
      { type: "runsPolled", ended: [], error: "io answered 500: internal error" },
      { type: "runsPolled", ended: ["run_ada-1"], error: "io answered 500: internal error" },
    ]);
    expect(goal.state().runSet).toStrictEqual({
      status: "running",
      runs: twoRuns,
      ended: ["run_ada-1"],
      pollError: "io answered 500: internal error",
    });

    // The next tick asks only for the run not yet ended, and the last one stored ends the set.
    const fetch = route(() => storedRun("run_vera-1"));
    await pollRunSet(goal.state().runSet, goal.dispatch);

    expect(urls(fetch)).toStrictEqual(["/api/runs/run_vera-1"]);
    expect(goal.actions.at(-1)).toStrictEqual({ type: "runsPolled", ended: ["run_vera-1"] });
    expect(goal.state().runSet).toStrictEqual({ status: "ended" });
  });

  test("pollRunSet: a set that is not running fetches nothing and dispatches nothing", async () => {
    const fetch = route(() => storedRun("run_ada-1"));
    const sets: RunSet[] = [{ status: "idle" }, { status: "starting" }, { status: "ended" }];
    for (const runSet of sets) {
      const actions: GoalAction[] = [];
      await pollRunSet(runSet, (action) => actions.push(action));
      expect(actions, runSet.status).toStrictEqual([]);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  test("reportMutation: POSTs exactly { backend: llm } under [analyse, taskId], report.tsx's key, then caches it", async () => {
    const report = reportFixture("task_past-order");
    let answerReport: (response: Response) => void = () => {};
    const fetch = route(() => {
      throw new Error("answered below");
    });
    fetch.mockImplementation(() => new Promise((resolve) => (answerReport = resolve)));
    const client = new QueryClient();

    const written = new MutationObserver(client, reportMutation(client, task.id)).mutate();
    // While it runs, `useIsMutating(["analyse", taskId])`, as `screens/report.tsx` reads it, counts it.
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(client.isMutating({ mutationKey: ["analyse", task.id] })).toBe(1);
    answerReport(Response.json(report, { status: 201 }));

    await expect(written).resolves.toStrictEqual(report);
    expect(sent(fetch)).toStrictEqual({
      url: "/api/reports/task_past-order",
      method: "POST",
      body: { backend: "llm" },
    });
    expect(client.isMutating()).toBe(0);
    expect(client.getQueryData(reportQuery(task.id).queryKey)).toStrictEqual(report);
  });

  test("reportMutation: io's 404 rejects with io's reason and caches nothing", async () => {
    answer(
      Response.json({ error: "no runs of task_past-order on llm; none on jev" }, { status: 404 }),
    );
    const client = new QueryClient();

    await expect(
      new MutationObserver(client, reportMutation(client, task.id)).mutate(),
    ).rejects.toThrow("io answered 404: no runs of task_past-order on llm; none on jev");
    expect(client.getQueryData(reportQuery(task.id).queryKey)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The screen: the views from their props, and `/target` through the app's router
// ---------------------------------------------------------------------------

/** `ui` inside the app's router, so its links build their hrefs. A static render runs no effect. */
function renderView(ui: ReactNode): string {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/target"] }) });
  return renderToStaticMarkup(<RouterContextProvider router={router}>{ui}</RouterContextProvider>);
}

/** The form at `form`. A static render clicks nothing, so the handlers do nothing. */
function formView(form: TargetForm): string {
  return renderView(<TargetFormView form={form} onAction={() => {}} onCheck={() => {}} />);
}

/** No report stored for the goal, none being written, none failed. */
const NO_REPORT: ReportState = { stored: false, writing: false };

/**
 * The goal view of `of` (the hard goal unless given) at `state`, with every persona fixture and
 * `report` as the screen reads it.
 */
function goalView(state: GoalState, of: Task = task, report: ReportState = NO_REPORT): string {
  return renderView(
    <GoalView
      task={of}
      state={state}
      report={report}
      profiles={profileFixtures}
      onAction={() => {}}
      onScout={() => {}}
      onStart={() => {}}
      onReport={() => {}}
    />,
  );
}

/**
 * `path` through the app's own router inside `client`: the shell and the Target screen. With no
 * answer seeded the stored task's query is left pending, since a static render fetches nothing.
 */
async function renderPath(path: string, client = new QueryClient()): Promise<string> {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** A client holding `stored` as io's answer for `id`, as the screen seeds it after a check. */
function storing(id: TaskId, stored: Task | null): QueryClient {
  const client = new QueryClient();
  client.setQueryData(storedTaskQuery(id).queryKey, stored);
  return client;
}

/** A client whose read of `id` failed, as it does while io is down. */
async function ioDown(id: TaskId): Promise<QueryClient> {
  // `retryOnMount: false` keeps the failure: a static render puts a failed query back to pending.
  const client = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
  await client.prefetchQuery({
    ...storedTaskQuery(id),
    queryFn: () => Promise.reject(new Error("io answered 502")),
  });
  return client;
}

/** The text of the page's `<h1>`. */
function h1Of(html: string): string {
  return lineOf(html.match(/<h1(?:\s[^>]*)?>(.*?)<\/h1>/s)?.[1] ?? "");
}

/** The text of the first `<header>` in `html`, on one line. */
function headerOf(html: string): string {
  return lineOf(html.match(/<header(?:\s[^>]*)?>(.*?)<\/header>/s)?.[1] ?? "");
}

/** Each `<a>` or `<button>` in `html`: its attributes and its text on one line. */
function elements(
  html: string,
  tag: "a" | "button",
): { attributes: Record<string, string>; text: string }[] {
  return [...html.matchAll(new RegExp(`<${tag}(\\s[^>]*)?>(.*?)</${tag}>`, "gs"))].map((m) => ({
    attributes: attributesOf(m[1] ?? ""),
    text: lineOf(m[2] ?? ""),
  }));
}

/** The attributes of the one `tag` reading `text`; the test fails unless there is exactly one. */
function only(html: string, tag: "a" | "button", text: string): Record<string, string> {
  const found = elements(html, tag).filter((element) => element.text === text);
  expect(found, text).toHaveLength(1);
  return found[0]?.attributes ?? {};
}

/** The start tag's attributes of the element whose id is `id`. */
function byId(html: string, id: string): Record<string, string> {
  const tag = html.match(new RegExp(`<\\w+((?=[^>]*\\sid="${id}")[^>]*)>`))?.[1];
  if (tag === undefined) throw new Error(`no element with id ${id}`);
  return attributesOf(tag);
}

/** The text, on one line, of each element with `role` in `html`, in document order. */
function roleTexts(html: string, role: "status" | "alert"): string[] {
  const pattern = new RegExp(`<(\\w+)(?=[^>]*\\srole="${role}")[^>]*>(.*?)</\\1>`, "gs");
  return [...html.matchAll(pattern)].map((m) => lineOf(m[2] ?? ""));
}

/**
 * The text of each element `attributes`' `aria-describedby` names, in its order. Every element the
 * views describe with is a `<p>`.
 */
function descriptions(html: string, attributes: Record<string, string>): string[] {
  const ids = attributes["aria-describedby"]?.split(" ") ?? [];
  return ids.map((id) => lineOf(elementOf(html, "p", `id="${id}"`)));
}

/** The text of the `<label>` for `id`. */
function labelOf(html: string, id: string): string {
  return lineOf(elementOf(html, "label", `for="${id}"`));
}

/** The goal view's "Run and report" section at `state`, with `report`. */
function runSection(state: GoalState, report: ReportState = NO_REPORT): string {
  return sectionOf(goalView(state, task, report), "Run and report");
}

/** The running set's line on why the page stays open. */
const KEEP_OPEN = "Keep this page open: the report is written from here once every run has ended.";

describe("screen", () => {
  test("a refused goal blocks every start", async () => {
    answer(
      Response.json(
        {
          error: "The goal failed the task check after one repair round",
          goal: "open Deliveries to see what I ordered",
          survived: ["Deliveries"],
        },
        { status: 422 },
      ),
    );
    const form = screen(formReducer, typed());
    expect(await checkTarget(form.state(), form.dispatch)).toBeUndefined();

    // The form holds the refusal in the Race's words, io's reasons last.
    const html = formView(form.state());
    expect(roleTexts(html, "status")).toStrictEqual([
      "The goal still names the way after a repair round Still naming the way: Deliveries The goal it got to: open Deliveries to see what I ordered The goal failed the task check after one repair round",
    ]);
    // No link opens the goal, and no button starts anything on it: the form's own buttons only.
    expect(elements(html, "a")).toStrictEqual([]);
    expect(elements(html, "button").map((button) => button.text)).toStrictEqual([
      "URL pattern",
      "Element on the page",
      "Check the goal",
    ]);

    // `/target` with no task is the form alone: no goal view is drawn without a stored task.
    // The screen inside `<main>`: the top bar's story nav links to the Report and the Race itself.
    const page = await renderPath("/target");
    const main = page.slice(page.indexOf("<main>"));
    expect(h1Of(main)).toBe("Target");
    expect(elements(main, "button").map((button) => button.text)).toStrictEqual([
      "URL pattern",
      "Element on the page",
      "Check the goal",
    ]);
    expect(elements(main, "a")).toStrictEqual([]);
    for (const text of ["goal · ", "Run Scout", "Write the report", "New goal", "on the LLM"]) {
      expect(lineOf(main), text).not.toContain(text);
    }
  });

  test("an accepted goal shows the links with the task id", async () => {
    answer(Response.json({ task, rewritten: false }, { status: 201 }));
    const form = screen(formReducer, typed());
    const checked = await checkTarget(form.state(), form.dispatch);
    expect(checked).toStrictEqual(task);

    // As the screen does on io's 201: the task cached under its id, then `?task=<id>`.
    const html = await renderPath(`/target?task=${task.id}`, storing(task.id, task));
    expect(lineOf(html)).toContain("goal · task_past-order");
    expect(h1Of(html)).toBe("“you want to see what you ordered three months ago”");
    expect(only(html, "a", "Open in the Lens").href).toBe(
      "/lens?url=http%3A%2F%2Flocalhost%3A5174%2F",
    );
    expect(only(html, "a", "Race on this goal").href).toBe("/race?task=task_past-order");
    expect(only(html, "a", "New goal").href).toBe("/target");
    expect(elements(html, "button").map((button) => button.text)).not.toContain("Check the goal");
  });

  test("the run set's progress line", async () => {
    route((url) => (url.endsWith("/run_ada-1") ? storedRun("run_ada-1") : inFlight("run_vera-1")));
    const goal = screen(goalReducer, running());
    await pollRunSet(goal.state().runSet, goal.dispatch);

    const run = runSection(goal.state());
    expect(roleTexts(run, "status")).toStrictEqual([`1 of 2 runs ended ${KEEP_OPEN}`]);
    // Under way: the cast and the seeds are locked, and the run button says why it waits.
    expect(run).toMatch(/<fieldset disabled=""/);
    const start = only(run, "button", "Start 6 runs on the LLM");
    expect(start).toHaveProperty("disabled");
    expect(descriptions(run, start)).toStrictEqual([
      "Wait for these runs to end before you start more",
    ]);
  });

  test("the report link once the runs end", async () => {
    // The last run stored ends the set. The screen's effect then asks the Analyst: a browser's to
    // run, and `self-check.browser.test.ts` holds it to once, after every run is stored.
    route((url) => storedRun(url.endsWith("/run_ada-1") ? "run_ada-1" : "run_vera-1"));
    const goal = screen(goalReducer, running());
    await pollRunSet(goal.state().runSet, goal.dispatch);
    expect(goal.state().runSet).toStrictEqual({ status: "ended" });

    // The report written: the screen reads it from the cache and links to it.
    answer(Response.json(reportFixture("task_past-order"), { status: 201 }));
    const client = storing(task.id, task);
    await new MutationObserver(client, reportMutation(client, task.id)).mutate();
    const run = sectionOf(await renderPath(`/target?task=${task.id}`, client), "Run and report");
    expect(only(run, "a", "Open the report").href).toBe("/report/task_past-order");
  });

  test("a report stored, being written, or failed on an earlier visit: the screen reads it", async () => {
    /** The goal's "Run and report" section on a fresh visit with `client`. */
    const visit = async (client: QueryClient) =>
      sectionOf(await renderPath(`/target?task=${task.id}`, client), "Run and report");

    // A reload of a goal with a report: its link, though this visit wrote none.
    const stored = storing(task.id, task);
    stored.setQueryData(reportQuery(task.id).queryKey, reportFixture("task_past-order"));
    expect(only(await visit(stored), "a", "Open the report").href).toBe("/report/task_past-order");

    // Written under the key on another visit or the Report screen: the Analyst at work here too.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const busy = storing(task.id, task);
    void new MutationObserver(busy, reportMutation(busy, task.id)).mutate();
    await vi.waitFor(() => expect(busy.isMutating()).toBe(1));
    const writing = await visit(busy);
    expect(roleTexts(writing, "status")).toStrictEqual([
      "The Analyst is writing the report. This can take a few minutes.",
    ]);
    expect(descriptions(writing, only(writing, "button", "Start 0 runs on the LLM"))).toStrictEqual(
      ["Wait for the report before you start more runs"],
    );

    // Failed under the key: the failure, and Try again.
    answer(Response.json({ error: "analyst exploded" }, { status: 500 }));
    const failed = storing(task.id, task);
    await expect(
      new MutationObserver(failed, reportMutation(failed, task.id)).mutate(),
    ).rejects.toThrow();
    const alert = await visit(failed);
    expect(roleTexts(alert, "alert")).toStrictEqual([
      "The report could not be written: io answered 500: analyst exploded",
    ]);
    expect(only(alert, "button", "Try again")["data-variant"]).toBe("outline");
  });

  test("a poll that failed: the count kept, and a line saying it tries again", () => {
    const state = goalAfter(running(), {
      type: "runsPolled",
      ended: ["run_ada-1"],
      error: "io answered 502",
    });
    expect(roleTexts(runSection(state), "status")).toStrictEqual([
      `1 of 2 runs ended The last check on the runs failed: io answered 502. Trying again. ${KEEP_OPEN}`,
    ]);
  });

  test("an id io holds no goal under: the empty state, whose action is a new goal", async () => {
    const html = await renderPath("/target?task=task_unknown", storing("task_unknown", null));
    const text = lineOf(html);
    expect(text).toContain("no goal");
    expect(text).toContain("No stored goal under this id.");
    expect(text).toContain(
      "Only goals the check accepted are stored. Check a new one on this screen.",
    );
    expect(only(html, "a", "New goal").href).toBe("/target");
    expect(text).not.toContain("Run Scout");
  });

  test("io down: a fault banner with io's message in mono, and Try again", async () => {
    const html = await renderPath(`/target?task=${task.id}`, await ioDown(task.id));
    const [alert] = roleTexts(html, "alert");
    expect(alert).toContain("io answered 502");
    expect(html).toMatch(/<span class="[^"]*mono[^"]*">io answered 502<\/span>/);
    expect(elements(html, "button").map((button) => button.text)).toContain("Try again");
    expect(html).not.toMatch(/data-slot="skeleton"/);
  });

  test("a goal still being read: a skeleton, and no goal view yet", async () => {
    const html = await renderPath(`/target?task=${task.id}`);
    expect(html).toMatch(/data-slot="skeleton"/);
    expect(roleTexts(html, "status")).toContain("Reading the goal from io.");
    expect(lineOf(html)).not.toContain("Run Scout");
  });

  test("the form: each field labelled, its hint wired, the success input by its kind", () => {
    const html = formView(initialForm());
    const startUrl = byId(html, "target-start-url");
    expect(startUrl).toMatchObject({ type: "url", placeholder: "https://example.com/" });
    expect(labelOf(html, "target-start-url")).toBe("start URL");
    expect(descriptions(html, startUrl)).toStrictEqual([
      "Where every run starts: any http(s) page with no login, cookie wall or bot check.",
    ]);

    const goal = byId(html, "target-goal");
    expect(goal.rows).toBe("2");
    expect(labelOf(html, "target-goal")).toBe("goal");
    expect(descriptions(html, goal)).toStrictEqual([
      "What the person wants, not the way there: the check takes out screen names and clicks.",
    ]);

    // The input is named by its kind, so it says what to type; "success" names the kinds' group.
    const success = byId(html, "target-success");
    expect(success.placeholder).toBe("**/orders/*");
    expect(success["aria-label"]).toBe("URL pattern");
    expect(descriptions(html, success)).toStrictEqual([
      // `lineOf` puts a space where each tag was: the page reads "https://." with none.
      "** stands for any part of the URL, * for any part between two slashes. It is matched against the whole URL, so it starts with ** or with https:// .",
      "Checked after every step. You write it; the model never does.",
    ]);
    expect(html).toContain('aria-label="success"');

    const selector = formView(
      formAfter(initialForm(), { type: "successKindChosen", successKind: "selectorPresent" }),
    );
    const element = byId(selector, "target-success");
    expect(element.placeholder).toBe("#order-history");
    expect(element["aria-label"]).toBe("Element on the page");
    expect(descriptions(selector, element)).toStrictEqual([
      "A CSS selector, found on the page the run is on.",
      "Checked after every step. You write it; the model never does.",
    ]);
  });

  test("Check the goal: the ink primary, waiting with the first thing to do beside it", () => {
    const empty = formView(initialForm());
    const waiting = only(empty, "button", "Check the goal");
    expect(waiting).toMatchObject({ "data-variant": "default", disabled: "" });
    expect(descriptions(empty, waiting)).toStrictEqual([
      "Enter a start URL: the page every run starts on",
    ]);

    const ready = only(formView(typed()), "button", "Check the goal");
    expect(ready).not.toHaveProperty("disabled");
    expect(ready).not.toHaveProperty("aria-describedby");
  });

  test("the form while its check runs, and a check that failed", () => {
    const checking = formAfter(typed(), { type: "checkStarted" });
    const html = formView(checking);
    expect(html).toMatch(/<fieldset disabled=""/);
    expect(roleTexts(html, "status")).toStrictEqual(["Checking…"]);
    expect(only(html, "button", "Check the goal")).toHaveProperty("disabled");

    const failed = formView(
      formAfter(checking, { type: "checkFailed", message: "io answered 502" }),
    );
    expect(failed).not.toMatch(/<fieldset disabled=""/);
    expect(roleTexts(failed, "alert")).toStrictEqual(["The check failed: io answered 502"]);
  });

  test("the goal view's header: the id, the goal, where it starts, what counts, what was taken out", () => {
    const html = goalView(initialGoal());
    // Focused on mount, so an accepted goal is read out: focusable from code, not from Tab.
    expect(html).toMatch(/<h1 tabindex="-1"[^>]*>“you want to see/);
    const header = headerOf(html);
    for (const text of [
      "goal · task_past-order",
      "“you want to see what you ordered three months ago”",
      "start · http://localhost:5174/",
      "success · URL matches **/deliveries/archive",
      "Taken out: Deliveries, archive",
      "New goal",
    ]) {
      expect(header, text).toContain(text);
    }

    const { strippedPaths: _taken, ...bare } = task;
    expect(lineOf(goalView(initialGoal(), bare))).toContain("Nothing taken out");
  });

  test("the goal view's header quotes the sentence typed when the check rewrote it", () => {
    /** The header of the hard goal, stored with `sourceStory` as the sentence typed. */
    const typedAs = (sourceStory: string | undefined) => {
      const { sourceStory: _typed, ...rest } = task;
      const of: Task = sourceStory === undefined ? rest : { ...rest, sourceStory };
      return headerOf(goalView(initialGoal(), of));
    };
    // The fixture's sentence names the way; the goal it was rewritten into does not.
    expect(task.sourceStory).not.toBe(task.goal);
    expect(typedAs(task.sourceStory)).toContain(
      `Rewritten from your sentence: “${task.sourceStory}”`,
    );
    // Kept as typed, or no sentence stored: nothing to explain.
    expect(typedAs(task.goal)).not.toContain("Rewritten");
    expect(typedAs(undefined)).not.toContain("Rewritten");
  });

  test("Write the report: offered only while a set runs and no report is being written", () => {
    const ended = goalAfter(running(), { type: "reportAsked" });
    const states: [string, GoalState, ReportState, boolean][] = [
      ["running", running(), NO_REPORT, true],
      ["running, a report stored", running(), { stored: true, writing: false }, true],
      ["running, a report being written", running(), { stored: false, writing: true }, false],
      // A fresh goal has nothing to report: offering it could only fail.
      ["idle", chosen(), NO_REPORT, false],
      ["starting", goalAfter(chosen(), { type: "runsStarting" }), NO_REPORT, false],
      ["ended", ended, NO_REPORT, false],
    ];
    for (const [name, state, report, offered] of states) {
      const run = runSection(state, report);
      const write = elements(run, "button").filter((button) => button.text === "Write the report");
      expect(write, name).toHaveLength(offered ? 1 : 0);
      const [button] = write;
      if (button === undefined) continue;
      expect(button.attributes["data-variant"], name).toBe("outline");
      expect(descriptions(run, button.attributes), name).toStrictEqual([
        "Stops following these runs and asks the Analyst now, over the latest run of each persona and seed stored for this goal.",
      ]);
    }
  });

  test("the report: its link while no set runs, the last one beside a newer report's failure", () => {
    const stored = { stored: true, writing: false };
    const idle = runSection(chosen(), stored);
    expect(only(idle, "a", "Open the report").href).toBe("/report/task_past-order");
    // A link that left the page mid-set would drop the set's report.
    expect(elements(runSection(running(), stored), "a")).toStrictEqual([]);
    const failed = runSection(chosen(), { ...stored, error: "io answered 500" });
    expect(only(failed, "a", "Open the last report").href).toBe("/report/task_past-order");
    // Being written, here or elsewhere: no link, and no new set until it is.
    const writing = runSection(chosen(), { stored: true, writing: true });
    expect(elements(writing, "a")).toStrictEqual([]);
    expect(descriptions(writing, only(writing, "button", "Start 6 runs on the LLM"))).toStrictEqual(
      ["Wait for the report before you start more runs"],
    );
    // None stored and none asked: nothing about a report at all.
    expect(roleTexts(runSection(chosen()), "status")).toStrictEqual([""]);
  });

  test("io's refusals: a start it refused, and a report it could not write, with Try again", () => {
    const refused = goalAfter(
      chosen(),
      { type: "runsStarting" },
      { type: "runsFailed", message: "io answered 404: no task task_past-order" },
    );
    expect(roleTexts(runSection(refused), "alert")).toStrictEqual([
      "io did not start the runs: io answered 404: no task task_past-order",
    ]);

    const ended = goalAfter(running(), { type: "reportAsked" });
    const error = "io answered 404: no runs of task_past-order on llm";
    const run = runSection(ended, { stored: false, writing: false, error });
    expect(roleTexts(run, "alert")).toStrictEqual([`The report could not be written: ${error}`]);
    expect(only(run, "button", "Try again")["data-variant"]).toBe("outline");
  });

  test("the run button: how many runs it starts, and with one persona why it waits", () => {
    const one = goalAfter(initialGoal(), { type: "personaToggled", profileId: ada.id });
    const run = runSection(one);
    const waiting = only(run, "button", "Start 3 runs on the LLM");
    expect(waiting).toMatchObject({ "data-variant": "default", disabled: "" });
    expect(descriptions(run, waiting)).toStrictEqual([
      "Choose 1 more persona: the report compares at least 2",
    ]);
    // The cast: a toggle per persona, pressed while chosen.
    expect(byId(run, "target-persona-prof_ada")["aria-pressed"]).toBe("true");
    expect(byId(run, "target-persona-prof_vera")["aria-pressed"]).toBe("false");
    expect(run).not.toMatch(/<fieldset disabled=""/);

    const ten = goalAfter(chosen(), { type: "seedCountChosen", seedCount: 10 });
    const ready = only(runSection(ten), "button", "Start 20 runs on the LLM");
    expect(ready).not.toHaveProperty("disabled");
    expect(ready).not.toHaveProperty("aria-describedby");
    // The view's one ink primary.
    expect(goalView(ten).match(/data-variant="default"/g)).toHaveLength(1);
  });

  test("Scout's line and button, by where Scout has got", () => {
    const reading = sectionOf(goalView(initialGoal()), "Scout");
    expect(reading).toMatch(/data-slot="skeleton"/);
    expect(only(reading, "button", "Run Scout")).toHaveProperty("disabled");

    const cases: { scout: ScoutState; line: string; button: string; warning?: string }[] = [
      {
        scout: { status: "none" },
        line: "Not run yet",
        button: "Run Scout",
        warning: "Run Scout first, so the report opens with its line.",
      },
      {
        scout: { status: "running" },
        line: "Scout is walking the goal…",
        button: "Run Scout",
        warning:
          "Scout is still walking the goal: a report written before it ends uses Scout's last result, if any.",
      },
      {
        scout: { status: "done", truth: groundTruthFixture },
        line: "Scout reached it in 2 steps",
        button: "Run Scout again",
      },
      {
        scout: { status: "done", truth: notReached },
        line: "Scout did not reach it in 3 attempts",
        button: "Run Scout again",
      },
      {
        scout: { status: "failed", message: "io answered 404: no task task_past-order" },
        line: "Scout failed: io answered 404: no task task_past-order",
        button: "Run Scout again",
      },
    ];
    // Every line on what a report written now says of Scout, from the cases showing one.
    const noScoutLine = cases.flatMap(({ warning }) => warning ?? []);
    for (const { scout, line, button, warning } of cases) {
      const html = goalView(goalAfter(initialGoal(), { type: "scoutRead", scout }));
      const section = sectionOf(html, "Scout");
      expect(roleTexts(section, "status"), line).toStrictEqual([line]);
      // A failed Scout's line is in the fault ink.
      if (scout.status === "failed") {
        expect(section).toMatch(/class="[^"]*text-fault[^"]*">Scout failed: /);
      }
      // Disabled only while Scout runs: `disabled=""`, or no attribute at all.
      expect(only(section, "button", button).disabled, scout.status).toBe(
        scout.status === "running" ? "" : undefined,
      );
      const run = lineOf(sectionOf(html, "Run and report"));
      for (const text of noScoutLine) {
        if (text === warning) expect(run, scout.status).toContain(text);
        else expect(run, scout.status).not.toContain(text);
      }
    }
  });

  test.each([
    ["/target", () => new QueryClient(), "Check the goal"],
    [`/target?task=${task.id}`, () => storing(task.id, task), "Vera"],
  ])("%s says none of the banned words", async (path, client, shown) => {
    const html = await renderPath(path, client());
    // What a person or a screen reader gets: the text between tags, which holds each avatar's
    // `<title>`, and the attributes read out. Class names are code, not copy: Tailwind's
    // `disabled:` variant is not a word on the screen.
    const texts = [...html.matchAll(/>([^<]+)</g)].map((match) => match[1] ?? "");
    const attributes = [...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map(
      (match) => match[1] ?? "",
    );
    // Neither half may pass by collecting nothing.
    expect(texts.join(" ")).toContain(shown);
    expect(attributes).toContain("Story");
    const collected = [...texts, ...attributes].join(" ").toLowerCase();
    for (const word of ["impaired", "disabled", "blind", "able-bodied"]) {
      expect(collected, word).not.toContain(word);
    }
  });
});
