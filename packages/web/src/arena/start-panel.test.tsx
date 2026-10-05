import type { Profile, Task } from "@wayford/core";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { type Extraction, extractTask } from "../api/runs.js";
import { bundledProfiles, bundledTasks } from "../bundled-fixtures.js";
import { attributesOf, lineOf } from "../preview/rendered-markup.js";
import { dispatched, forOf, sixProfiles, withPersonas } from "./fixture-race.js";
import {
  GOAL_PRESETS,
  initialPanel,
  MIN_PERSONAS,
  type PanelState,
  taskRequestOf,
} from "./panel-state.js";
import { StartPanel, successText } from "./start-panel.js";

const [easy, hard] = GOAL_PRESETS;
if (!easy || !hard) throw new Error("the arena has two goal presets, easy then hard");

/** The panel at `state`, its callbacks inert: a static render runs none of them. */
function render(state: PanelState, profiles: readonly Profile[] = bundledProfiles): string {
  const inert = () => {};
  return renderToStaticMarkup(
    <StartPanel
      state={state}
      profiles={profiles}
      onAction={inert}
      onCheck={inert}
      onStart={inert}
    />,
  );
}

/** The one `<button>` whose text is `text`, start tag to end tag. */
function button(html: string, text: string): string {
  const found = html.match(new RegExp(`<button[^>]*>${text}</button>`));
  if (!found) throw new Error(`no button reads ${text}`);
  return found[0];
}

/** The `<input>` whose id is `id`. */
function input(html: string, id: string): string {
  const found = html.match(new RegExp(`<input[^>]*\\sid="${id}"[^>]*>`));
  if (!found) throw new Error(`no input with id ${id}`);
  return found[0];
}

/** Make the next `fetch` answer with `response`, and hand back the stub to inspect calls. */
function answer(response: Response) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** The parsed JSON body of the one call to the `fetch` stub. */
function sentBody(fetch: ReturnType<typeof answer>): unknown {
  expect(fetch).toHaveBeenCalledOnce();
  const [, init] = fetch.mock.calls[0] ?? [];
  return JSON.parse(String(init?.body));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A path-laden sentence for the hard goal: a screen name and an arrow. */
const PATH_LADEN = "Click Deliveries → Order archive to see what I ordered three months ago";

test("at five personas the sixth box is unavailable and the limit line says why", () => {
  const five = withPersonas(initialPanel(), sixProfiles.slice(0, 5));
  const html = render(five, sixProfiles);
  for (const profile of sixProfiles.slice(0, 5)) {
    const box = input(html, `arena-persona-${profile.id}`);
    expect(box, profile.label).toMatch(/\schecked=""/);
    expect(attributesOf(box), profile.label).not.toHaveProperty("disabled");
  }
  const sixth = input(html, "arena-persona-prof_p6");
  expect(sixth).not.toMatch(/\schecked=""/);
  expect(attributesOf(sixth)).toHaveProperty("disabled");
  expect(lineOf(html)).toContain(
    "At most 5 personas: each run holds one of the browser's connections to io",
  );
  // Below five, every box is available.
  const four = render(withPersonas(initialPanel(), sixProfiles.slice(0, 4)), sixProfiles);
  for (const profile of sixProfiles) {
    const box = attributesOf(input(four, `arena-persona-${profile.id}`));
    expect(box, profile.label).not.toHaveProperty("disabled");
  }
});

test("below three personas the line says how many more a race needs", () => {
  expect(MIN_PERSONAS).toBe(3);
  expect(lineOf(render(initialPanel()))).toContain("Choose 3 more personas");
  const one = withPersonas(initialPanel(), bundledProfiles.slice(0, 1));
  expect(lineOf(render(one))).toContain("Choose 2 more personas");
  const two = withPersonas(initialPanel(), bundledProfiles.slice(0, 2));
  expect(lineOf(render(two))).toContain("Choose 1 more persona");
});

// Each preset in turn, so a body that took one preset's condition for every goal fails on the
// other. Both presets start at the target app's home page, so the start URL alone cannot tell
// them apart; the success condition can.
test.each(GOAL_PRESETS)(
  "POST /tasks carries the edited sentence with the $label preset's start URL and success",
  async (preset) => {
    const state = dispatched(
      initialPanel(),
      { type: "presetChosen", presetId: preset.id },
      { type: "sentenceEdited", sentence: "I want to find something on this shop" },
    );
    // The radio shows the preset chosen.
    expect(input(render(state), `arena-goal-${preset.id}`)).toMatch(/\schecked=""/);
    const task = bundledTasks.find((candidate) => candidate.id === preset.id);
    const fetch = answer(
      Response.json(
        { task: { ...task, sourceStory: state.sentence }, rewritten: true },
        { status: 201 },
      ),
    );
    await extractTask(taskRequestOf(state));
    expect(sentBody(fetch)).toStrictEqual({
      story: "I want to find something on this shop",
      startUrl: task?.startUrl,
      success: task?.success,
    });
  },
);

/** The hard goal with the path-laden sentence, three personas and seed 1, not yet checked. */
function pathLadenPanel(): PanelState {
  return dispatched(
    withPersonas(initialPanel(), bundledProfiles.slice(0, MIN_PERSONAS)),
    { type: "sentenceEdited", sentence: PATH_LADEN },
    { type: "seedEdited", seed: "1" },
  );
}

/** What io stores for the path-laden sentence: the way taken out of the goal. */
const rewrittenTask: Task = {
  id: "task_ordered-three-months-ago",
  goal: "you want to see what you ordered three months ago",
  startUrl: hard.startUrl,
  success: hard.success,
  sourceStory: PATH_LADEN,
  strippedPaths: ["Deliveries", "Order archive"],
};

test("a path-laden sentence shows the rewrite and what was taken out before Start is available", async () => {
  const unchecked = pathLadenPanel();
  expect(attributesOf(button(render(unchecked), "Start the race"))).toHaveProperty("disabled");

  answer(Response.json({ task: rewrittenTask, rewritten: true }, { status: 201 }));
  const extraction = await extractTask(taskRequestOf(unchecked));
  const checked = dispatched(unchecked, {
    type: "checkAnswered",
    for: forOf(unchecked),
    extraction,
  });
  const html = render(checked);
  const text = lineOf(html);
  expect(text).toContain("The personas get: you want to see what you ordered three months ago");
  expect(text).toContain("Taken out: Deliveries, Order archive");
  expect(text).toContain("Rewritten from your sentence");
  expect(attributesOf(button(html, "Start the race"))).not.toHaveProperty("disabled");
});

test("a goal io refuses keeps Start unavailable and shows the words that survived", () => {
  const unchecked = pathLadenPanel();
  // io's 422, as `extractTask` reads it.
  const extraction: Extraction = {
    ok: false,
    error: "The goal failed the task check after one repair round",
    goal: "open the Order archive to see what I ordered three months ago",
    survived: ["Order archive"],
  };
  const refused = dispatched(unchecked, {
    type: "checkAnswered",
    for: forOf(unchecked),
    extraction,
  });
  const html = render(refused);
  const text = lineOf(html);
  expect(text).toContain("The goal still names the way after a repair round");
  expect(text).toContain("Still naming the way: Order archive");
  expect(text).toContain("open the Order archive to see what I ordered three months ago");
  expect(text).not.toContain("The personas get:");
  expect(attributesOf(button(html, "Start the race"))).toHaveProperty("disabled");
});

test("an answer for an older sentence is dropped and Start stays unavailable", () => {
  const asked = pathLadenPanel();
  const extraction: Extraction = { ok: true, task: rewrittenTask, rewritten: true };
  const edited = dispatched(asked, { type: "sentenceEdited", sentence: `${PATH_LADEN}, please` });
  const late = dispatched(edited, { type: "checkAnswered", for: forOf(asked), extraction });
  expect(late).toBe(edited);
  const html = render(late);
  expect(lineOf(html)).not.toContain("The personas get:");
  expect(attributesOf(button(html, "Start the race"))).toHaveProperty("disabled");
});

test("a check under way says so, and a failed one is an alert", () => {
  const checking = dispatched(initialPanel(), { type: "checkStarted" });
  const html = render(checking);
  expect(html).toMatch(/<[^>]*role="status"[^>]*>Checking…</);
  expect(attributesOf(button(html, "Check the goal"))).toHaveProperty("disabled");
  const failed = dispatched(checking, {
    type: "checkFailed",
    for: forOf(checking),
    message: "io answered 502: llm_timeout: no answer",
  });
  expect(render(failed)).toMatch(
    /<[^>]*role="alert"[^>]*>The check failed: io answered 502: llm_timeout: no answer</,
  );
  expect(attributesOf(button(render(failed), "Check the goal"))).not.toHaveProperty("disabled");
});

test("Check the goal is unavailable for a blank sentence", () => {
  const blank = dispatched(initialPanel(), { type: "sentenceEdited", sentence: "   " });
  expect(attributesOf(button(render(blank), "Check the goal"))).toHaveProperty("disabled");
});

test("Start is described by the reason it cannot start, and a failed start is an alert", () => {
  const html = render(initialPanel());
  const start = button(html, "Start the race");
  const describedBy = start.match(/aria-describedby="([^"]+)"/)?.[1];
  expect(describedBy).toBeDefined();
  expect(html).toMatch(new RegExp(`id="${describedBy}"[^>]*>Check the goal first`));

  const failed: PanelState = { ...initialPanel(), startError: "io answered 404: no task task_x" };
  expect(render(failed)).toMatch(
    /<[^>]*role="alert"[^>]*>Could not start the race: io answered 404: no task task_x</,
  );
});

test("each goal shows its sentence and its success condition", () => {
  const text = lineOf(render(initialPanel()));
  for (const preset of GOAL_PRESETS) {
    expect(text).toContain(`${preset.label} ${preset.sentence}`);
  }
  expect(text).toContain("URL matches **/deliveries/archive");
  expect(text).toContain("URL matches **/account/address");
  expect(successText({ type: "selectorPresent", selector: "#archive" })).toBe(
    "Element present: #archive",
  );
  expect(successText({ type: "requestObserved", method: "GET", urlPattern: "**/api/orders" })).toBe(
    "Request observed: GET **/api/orders",
  );
});

test("every control has an accessible name, and the panel never says disabled", () => {
  const states = [
    initialPanel(),
    dispatched(initialPanel(), { type: "checkStarted" }),
    withPersonas(initialPanel(), sixProfiles.slice(0, 5)),
  ];
  for (const state of states) {
    const html = render(state, sixProfiles);
    const ids = [...html.matchAll(/<(?:input|textarea)[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    // Two goals, the sentence, six personas and the seed.
    expect(ids).toHaveLength(10);
    for (const id of ids) expect(html, id).toContain(`for="${id}"`);
    for (const [, text] of html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)) {
      expect(text?.trim()).not.toBe("");
    }
    // What a person or a screen reader gets, as `router.test.tsx` collects it.
    const said = [
      ...[...html.matchAll(/>([^<]+)</g)].map((m) => m[1] ?? ""),
      ...[...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((m) => m[1] ?? ""),
    ].join(" ");
    expect(said.toLowerCase()).not.toContain("disabled");
  }
});
