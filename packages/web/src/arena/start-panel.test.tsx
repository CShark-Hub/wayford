import type { Profile, ReportBackend, Task } from "@wayford/core";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { type Extraction, extractTask } from "../api/runs.js";
import { bundledProfiles, bundledTasks } from "../bundled-fixtures.js";
import { attributesOf, decode, lineOf } from "../preview/rendered-markup.js";
import { dispatched, foreignTask, sixProfiles, withPersonas } from "./fixture-race.js";
import {
  checkedFor,
  GOAL_PRESETS,
  initialPanel,
  MIN_PERSONAS,
  NO_SUCCESS,
  type PanelState,
  storedGoalOf,
  taskRequestOf,
  UNMATCHABLE_SUCCESS,
} from "./panel-state.js";
import { StartPanel, type StoredGoals, successText } from "./start-panel.js";

const [easy, hard] = GOAL_PRESETS;
if (!easy || !hard) throw new Error("the arena has two goal presets, easy then hard");

/** io's list of stored goals, read and empty. */
const NONE_STORED: StoredGoals = { status: "listed", goals: [] };

/**
 * The panel at `state`, with io's stored goals as `stored` (none unless a test says otherwise), its
 * callbacks inert: a static render runs none of them.
 */
function render(
  state: PanelState,
  profiles: readonly Profile[] = bundledProfiles,
  stored: StoredGoals = NONE_STORED,
  backend: ReportBackend = "llm",
): string {
  const inert = () => {};
  return renderToStaticMarkup(
    <StartPanel
      state={state}
      profiles={profiles}
      stored={stored}
      backend={backend}
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

/** What the sentence's `<textarea>` holds. */
function sentenceOf(html: string): string {
  const found = html.match(/<textarea[^>]*\sid="arena-sentence"[^>]*>(.*?)<\/textarea>/s);
  if (found?.[1] === undefined) throw new Error("no sentence textarea");
  return decode(found[1]);
}

/** Every `<button>` in order: its start tag's attributes and its inner markup. */
function buttons(html: string): { attributes: Record<string, string>; inner: string }[] {
  return [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/gs)].map(([, tag, inner]) => ({
    attributes: attributesOf(tag ?? ""),
    inner: inner ?? "",
  }));
}

/**
 * The name a button's text gives it: its text with every `aria-hidden` wrapper left out, as a
 * screen reader reads it. A wrapper holds an avatar, whose drawing holds no `<span>`, so it ends at
 * its first `</span>`.
 */
function nameOf(inner: string): string {
  return lineOf(inner.replace(/<span aria-hidden="true"[^>]*>.*?<\/span>/gs, ""));
}

/** The names of every button the panel draws, in order. */
function buttonNames(html: string): string[] {
  return buttons(html).map(({ inner }) => nameOf(inner));
}

/** The attributes of the goal choice's item named `label`. */
function choiceItem(html: string, label: string): Record<string, string> {
  const item = buttons(html).find(({ inner }) => nameOf(inner) === label);
  if (item === undefined) throw new Error(`no choice reads ${label}`);
  return item.attributes;
}

/**
 * A persona's toggle, found by its id: its attributes, the class of its avatar's tile (the `<div>`
 * right before the drawing) and the class of the name under it (its last `<span>`).
 */
function toggle(html: string, profile: Profile) {
  const found = buttons(html).find(
    ({ attributes }) => attributes.id === `arena-persona-${profile.id}`,
  );
  if (found === undefined) throw new Error(`no toggle for ${profile.id}`);
  const tile = attributesOf(found.inner.match(/<div[^>]*>(?=<svg)/)?.[0] ?? "");
  const name = [...found.inner.matchAll(/<span([^>]*)>([^<]*)<\/span>/g)].at(-1);
  return {
    attributes: found.attributes,
    tileClasses: (tile.class ?? "").split(" "),
    nameClasses: (attributesOf(name?.[1] ?? "").class ?? "").split(" "),
    name: nameOf(found.inner),
  };
}

/** The text of the element whose id is `id`. */
function textById(html: string, id: string): string {
  const found = html.match(new RegExp(`<([a-z0-9]+)[^>]*\\sid="${id}"[^>]*>(.*?)</\\1>`, "s"));
  if (found?.[2] === undefined) throw new Error(`no element with id ${id}`);
  return lineOf(found[2]);
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

test("at five personas the sixth toggle is unavailable, drawn faded, and the limit line says why", () => {
  const five = withPersonas(initialPanel(), sixProfiles.slice(0, 5));
  const html = render(five, sixProfiles);
  for (const profile of sixProfiles.slice(0, 5)) {
    const chosen = toggle(html, profile);
    expect(chosen.attributes["aria-pressed"], profile.label).toBe("true");
    expect(chosen.attributes, profile.label).not.toHaveProperty("disabled");
    // Pressed: a paper gap, then a ring in the persona's slot, around the avatar.
    expect(chosen.tileClasses, profile.label).toEqual(
      expect.arrayContaining(["ring-2", "ring-(--p)", "ring-offset-2", "ring-offset-paper"]),
    );
    expect(chosen.tileClasses, profile.label).not.toContain("opacity-50");
  }
  const [, , , , , fay] = sixProfiles;
  if (fay === undefined) throw new Error("sixProfiles holds six");
  const sixth = toggle(html, fay);
  expect(sixth.attributes["aria-pressed"]).toBe("false");
  expect(sixth.attributes).toHaveProperty("disabled");
  expect(sixth.tileClasses).not.toContain("ring-(--p)");
  // The avatar fades and the name turns ink-3, which holds 4.5:1; the button itself does not fade,
  // so its name is measured as it is drawn.
  expect(sixth.tileClasses).toContain("opacity-50");
  expect(sixth.nameClasses).toContain("text-ink-3");
  expect(sixth.attributes.class ?? "").not.toMatch(/opacity/);
  expect(lineOf(html)).toContain(
    "At most 5 personas: each run holds one of the browser's connections to io",
  );
  // Below five, every toggle is available.
  const four = render(withPersonas(initialPanel(), sixProfiles.slice(0, 4)), sixProfiles);
  for (const profile of sixProfiles) {
    const offered = toggle(four, profile);
    expect(offered.attributes, profile.label).not.toHaveProperty("disabled");
    expect(offered.tileClasses, profile.label).not.toContain("opacity-50");
    expect(offered.nameClasses, profile.label).toContain("text-ink");
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
  "POST /tasks carries the $label preset's sentence, start URL and success while the sentence is its own",
  async (preset) => {
    const state = dispatched(initialPanel(), { type: "goalChosen", goal: preset });
    // The goal choice shows the preset chosen.
    expect(choiceItem(render(state), preset.label)["aria-checked"]).toBe("true");
    const task = bundledTasks.find((candidate) => candidate.id === preset.id);
    const fetch = answer(Response.json({ task, rewritten: false }, { status: 201 }));
    await extractTask(taskRequestOf(state));
    expect(sentBody(fetch)).toStrictEqual({
      story: preset.sentence,
      startUrl: task?.startUrl,
      success: task?.success,
    });
  },
);

test("POST /tasks carries the success typed for an edited sentence, never the preset's", async () => {
  // Issue #196: the hard preset, a sentence about the address, and the address's condition typed.
  const state = dispatched(
    initialPanel(),
    { type: "sentenceEdited", sentence: "you want to verify your delivery address" },
    { type: "successEdited", success: "**/account/address" },
  );
  const stored: Task = {
    id: "task_verify-delivery-address",
    goal: "you want to verify your delivery address",
    startUrl: hard.startUrl,
    success: { type: "urlMatches", pattern: "**/account/address" },
    sourceStory: state.sentence,
    strippedPaths: [],
  };
  const fetch = answer(Response.json({ task: stored, rewritten: false }, { status: 201 }));
  const extraction = await extractTask(taskRequestOf(state));
  expect(sentBody(fetch)).toStrictEqual({
    story: "you want to verify your delivery address",
    startUrl: hard.startUrl,
    success: { type: "urlMatches", pattern: "**/account/address" },
  });
  // The status says what the task was stored with, so the person sees what counts as arriving.
  const checked = dispatched(state, { type: "checkAnswered", for: checkedFor(state), extraction });
  // The field's value is an attribute, so the page's text is the status's alone.
  const text = lineOf(render(checked));
  expect(text).toContain("The personas get: you want to verify your delivery address");
  expect(text).toContain("success · URL matches **/account/address");
  expect(text).not.toContain("deliveries/archive");
});

/**
 * The hard goal with the path-laden sentence, three personas and seed 1, not yet checked. The
 * sentence asks for the archive in other words, so the preset's success is taken for it again.
 */
function pathLadenPanel(): PanelState {
  return dispatched(
    withPersonas(initialPanel(), bundledProfiles.slice(0, MIN_PERSONAS)),
    { type: "sentenceEdited", sentence: PATH_LADEN },
    { type: "goalSuccessUsed" },
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
    for: checkedFor(unchecked),
    extraction,
  });
  const html = render(checked);
  const text = lineOf(html);
  expect(text).toContain("The personas get: you want to see what you ordered three months ago");
  expect(text).toContain("success · URL matches **/deliveries/archive");
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
    for: checkedFor(unchecked),
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
  const late = dispatched(edited, { type: "checkAnswered", for: checkedFor(asked), extraction });
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
    for: checkedFor(checking),
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

/** The sentence edited away from the preset's, which takes the preset's success with it. */
const edited = dispatched(initialPanel(), {
  type: "sentenceEdited",
  sentence: "you want to verify your delivery address",
});

test.each([
  ["empty", edited, NO_SUCCESS],
  // The natural mistake after a sentence edit: the path alone, which the Actor loop refuses.
  [
    "the path alone",
    dispatched(edited, { type: "successEdited", success: "/account/address" }),
    UNMATCHABLE_SUCCESS,
  ],
] as const)(
  "Check the goal is unavailable while the success is %s, and is described by why",
  (_, held, why) => {
    const html = render(held);
    const check = attributesOf(button(html, "Check the goal"));
    expect(check).toHaveProperty("disabled");
    expect(textById(html, check["aria-describedby"] ?? "")).toBe(why);
    // The field is described by the same line, and Start names the same first thing to do.
    expect(attributesOf(input(html, "arena-success"))["aria-describedby"]).toBe(
      check["aria-describedby"],
    );
    const start = attributesOf(button(html, "Start the race"));
    expect(textById(html, start["aria-describedby"] ?? "")).toBe(why);
    // Written from the start of a whole URL, the check is available and nothing describes it.
    const typed = render(
      dispatched(held, { type: "successEdited", success: "**/account/address" }),
    );
    const ready = attributesOf(button(typed, "Check the goal"));
    expect(ready).not.toHaveProperty("disabled");
    expect(ready).not.toHaveProperty("aria-describedby");
    expect(attributesOf(input(typed, "arena-success"))).not.toHaveProperty("aria-describedby");
    expect(lineOf(typed)).not.toContain(why);
  },
);

test("Use the preset's shows only while the success is not the preset's, and is not primary", () => {
  const shown: [string, PanelState][] = [
    [
      "an edited sentence's empty success",
      dispatched(initialPanel(), { type: "sentenceEdited", sentence: "find my address" }),
    ],
    [
      "a typed success",
      dispatched(initialPanel(), { type: "successEdited", success: "**/account/address" }),
    ],
  ];
  for (const [what, state] of shown) {
    const html = render(state);
    expect(buttonNames(html), what).toContain("Use the preset's");
    const use = buttons(html).find(({ inner }) => nameOf(inner) === "Use the preset's");
    expect(use?.attributes.type, what).toBe("button");
    expect(use?.attributes["data-variant"], what).toBe("ghost");
  }
  const hidden: [string, PanelState][] = [
    ["the preset as it opens", initialPanel()],
    [
      "the preset's success used for an edited sentence",
      dispatched(
        initialPanel(),
        { type: "sentenceEdited", sentence: "find my order from the spring" },
        { type: "goalSuccessUsed" },
      ),
    ],
    [
      "the sentence edited back",
      dispatched(
        initialPanel(),
        { type: "sentenceEdited", sentence: "find my order" },
        { type: "sentenceEdited", sentence: hard.sentence },
      ),
    ],
    ["the easy preset", dispatched(initialPanel(), { type: "goalChosen", goal: easy })],
  ];
  for (const [what, state] of hidden) {
    expect(buttonNames(render(state)), what).not.toContain("Use the preset's");
  }
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

test("Start the race is the one primary button, and Check the goal is outlined", () => {
  const html = render(withPersonas(initialPanel(), sixProfiles.slice(0, 3)), sixProfiles);
  const primary = buttons(html).filter(
    ({ attributes }) => attributes["data-variant"] === "default",
  );
  expect(primary.map(({ inner }) => nameOf(inner))).toStrictEqual(["Start the race"]);
  expect(attributesOf(button(html, "Check the goal"))["data-variant"]).toBe("outline");
});

test.each(GOAL_PRESETS)(
  "the $label choice draws its own sentence and its success's pattern in the field, and not the other's",
  (preset) => {
    const other = preset === easy ? hard : easy;
    const html = render(dispatched(initialPanel(), { type: "goalChosen", goal: preset }));
    expect(choiceItem(html, preset.label)["aria-checked"]).toBe("true");
    expect(choiceItem(html, other.label)["aria-checked"]).toBe("false");
    expect(sentenceOf(html)).toBe(preset.sentence);
    // Both presets wait for a URL: the field holds the pattern.
    expect(preset.success.type).toBe("urlMatches");
    const field = attributesOf(input(html, "arena-success"));
    expect(field.value).toBe(preset.success.type === "urlMatches" ? preset.success.pattern : "");
    expect(html).not.toContain(other.sentence);
    expect(html).not.toContain(other.success.type === "urlMatches" ? other.success.pattern : "");
  },
);

test("the sentence is a two-row field, and the success a URL pattern's mono text field its label names", () => {
  const html = render(initialPanel());
  const tag = attributesOf(html.match(/<textarea[^>]*>/)?.[0] ?? "");
  expect(tag.rows).toBe("2");
  const field = attributesOf(input(html, "arena-success"));
  expect(field.type).toBe("text");
  expect((field.class ?? "").split(" ")).toContain("mono");
  // The label, then what the field is, fixed and in mono as the check's answer words it, then the
  // pattern: "success  URL matches  **/deliveries/archive". A URL pattern is the one kind it takes.
  expect(html).toMatch(
    /<label [^>]*for="arena-success"[^>]*>success<\/label><span class="mono text-ink-3">URL matches<\/span><input[^>]*\sid="arena-success"/,
  );
  expect(html).not.toContain("success kind");
  expect(html).not.toContain("Element present");
  // With the preset's success, nothing describes it: there is nothing to do.
  expect(field).not.toHaveProperty("aria-describedby");
});

test("an empty success field shows the form a pattern takes", () => {
  const empty = render(
    dispatched(initialPanel(), { type: "sentenceEdited", sentence: "find my address" }),
  );
  const field = attributesOf(input(empty, "arena-success"));
  expect(field.value).toBe("");
  expect(field.placeholder).toBe("**/path/on/the/site");
  // Drawn in ink-3, which holds 4.5:1 on the field, so the self-check's floor holds for it too.
  expect((field.class ?? "").split(" ")).toContain("placeholder:text-ink-3");
});

test("the success conditions in words", () => {
  expect(successText(hard.success)).toBe("URL matches **/deliveries/archive");
  expect(successText(easy.success)).toBe("URL matches **/account/address");
  expect(successText({ type: "selectorPresent", selector: "#archive" })).toBe(
    "Element present: #archive",
  );
  expect(successText({ type: "requestObserved", method: "GET", urlPattern: "**/api/orders" })).toBe(
    "Request observed: GET **/api/orders",
  );
});

test("the labels are lowercase instrument labels, and the heading is for screen readers only", () => {
  const html = render(initialPanel());
  expect(html).toMatch(/<h2 [^>]*class="sr-only"[^>]*>Start a race<\/h2>/);
  const labels = [...html.matchAll(/<(span|label|legend)([^>]*)>([^<]*)<\/\1>/g)]
    .filter(([, , tag]) => (attributesOf(tag ?? "").class ?? "").split(" ").includes("mono-label"))
    .map(([, , , text]) => text);
  expect(labels).toStrictEqual(["goal", "sentence", "success", "cast", "seed"]);
});

test("every control is drawn, named and described, and the panel never says disabled", () => {
  const states = [
    initialPanel(),
    dispatched(initialPanel(), { type: "checkStarted" }),
    withPersonas(initialPanel(), sixProfiles.slice(0, 5)),
  ];
  for (const state of states) {
    const html = render(state, sixProfiles);
    // No visually hidden radio or checkbox stands in for a drawn control: the self-check measures
    // only what a sighted person sees. The three fields are named by their labels.
    expect(html).not.toMatch(/<input[^>]*type="(?:radio|checkbox)"/);
    const ids = [...html.matchAll(/<(?:input|textarea)[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toStrictEqual(["arena-sentence", "arena-success", "arena-seed"]);
    for (const id of ids) expect(html, id).toContain(`for="${id}"`);
    // Every button is named by its text: two goals, the check, six personas and Start. A persona's
    // avatar is hidden, so its toggle's name is the persona's name alone.
    expect(buttonNames(html)).toStrictEqual([
      easy.label,
      hard.label,
      "Check the goal",
      ...sixProfiles.map((profile) => profile.label),
      "Start the race",
    ]);
    for (const profile of sixProfiles) {
      expect(toggle(html, profile).attributes.type, profile.label).toBe("button");
    }
    // The goal choice and the cast are groups their labels name, the only two; the cast is
    // described by its line.
    expect(html).toMatch(/<div[^>]*role="radiogroup"[^>]*aria-label="goal"/);
    expect([...html.matchAll(/role="radiogroup"/g)]).toHaveLength(1);
    const cast = html.match(/<fieldset([^>]*)><legend[^>]*>(.*?)<\/legend>/s);
    expect(cast?.[2]).toBe("cast");
    const line = textById(html, attributesOf(cast?.[1] ?? "")["aria-describedby"] ?? "");
    expect(line).toMatch(/personas/);
    // The seed keeps its hint.
    const seed = attributesOf(input(html, "arena-seed"));
    expect(textById(html, seed["aria-describedby"] ?? "")).toBe(
      "One seed for every persona, on the LLM",
    );
    // What a person or a screen reader gets, as `router.test.tsx` collects it.
    const said = [
      ...[...html.matchAll(/>([^<]+)</g)].map((m) => m[1] ?? ""),
      ...[...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((m) => m[1] ?? ""),
    ].join(" ");
    expect(said.toLowerCase()).not.toContain("disabled");
  }
});

/** The stored-goal `<select>`, start tag to end tag, or `undefined` when none is drawn. */
function storedSelect(html: string): string | undefined {
  return html.match(/<select[^>]*\sid="arena-stored-goal"[^>]*>.*?<\/select>/s)?.[0];
}

/** A `<select>`'s options in order: each its value, its text and whether it is selected. */
function optionsOf(select: string) {
  return [...select.matchAll(/<option([^>]*)>(.*?)<\/option>/gs)].map(([, tag, inner]) => {
    const attributes = attributesOf(tag ?? "");
    return {
      value: attributes.value,
      text: lineOf(inner ?? ""),
      selected: "selected" in attributes,
    };
  });
}

/** The foreign task as a stored goal: the hard goal, started on https://example.com/. */
const foreign = storedGoalOf(foreignTask);

test("stored goals are listed by host and goal; loading is a skeleton, a failure a line", () => {
  // Listed: a native select its label names, its first option the prompt, selected on a preset.
  const listed = render(initialPanel(), bundledProfiles, { status: "listed", goals: [foreign] });
  const select = storedSelect(listed);
  if (select === undefined) throw new Error("no stored-goal select");
  expect(listed).toMatch(/<label[^>]*\sfor="arena-stored-goal"[^>]*>stored goal<\/label>/);
  expect(optionsOf(select)).toStrictEqual([
    { value: "", text: "Choose a stored goal", selected: true },
    {
      value: foreignTask.id,
      text: "example.com · you want to see what you ordered three months ago",
      selected: false,
    },
  ]);
  // Its width is capped and its text truncates: a rehearsal database lists many goals.
  const classes = (attributesOf(select.match(/<select[^>]*>/)?.[0] ?? "").class ?? "").split(" ");
  expect(classes).toEqual(expect.arrayContaining(["max-w-100", "truncate"]));

  // Loading: a skeleton in the select's place, and no select yet.
  const loading = render(initialPanel(), bundledProfiles, { status: "loading" });
  expect(storedSelect(loading)).toBeUndefined();
  expect(loading).toContain('data-slot="skeleton"');

  // Failed: a line naming io's reason, and the presets still offered.
  const failed = render(initialPanel(), bundledProfiles, {
    status: "failed",
    reason: "io answered 502",
  });
  expect(storedSelect(failed)).toBeUndefined();
  expect(lineOf(failed)).toContain(
    "Stored goals are unavailable: io answered 502. The two target-app goals still work.",
  );
  expect(choiceItem(failed, hard.label)["aria-checked"]).toBe("true");

  // None stored: a line, no select.
  const none = render(initialPanel());
  expect(storedSelect(none)).toBeUndefined();
  expect(lineOf(none)).toContain("No stored goals yet");
});

test("a preset draws no start line; a stored goal shows start · <url>, its option selected, no preset checked, and Use the stored goal's", () => {
  const stored: StoredGoals = { status: "listed", goals: [foreign] };
  // A preset: the success field alone under the sentence, as beat 4 shows it.
  const preset = render(initialPanel(), bundledProfiles, stored);
  expect(lineOf(preset)).not.toContain("start ·");

  const chosen = dispatched(initialPanel(), { type: "goalChosen", goal: foreign });
  const html = render(chosen, bundledProfiles, stored);
  // Where it starts, in mono, above the field that holds its own success.
  const start = html.match(/<p class="[^"]*\bmono text-ink-3">(start · [^<]*)<\/p>/);
  expect(start?.[1]).toBe("start · https://example.com/");
  expect(html.indexOf("start · ")).toBeLessThan(html.indexOf('id="arena-success"'));
  expect(attributesOf(input(html, "arena-success")).value).toBe("**/orders/history");
  expect(sentenceOf(html)).toBe(foreignTask.goal);
  const selected = optionsOf(storedSelect(html) ?? "").filter((option) => option.selected);
  expect(selected.map((option) => option.value)).toStrictEqual([foreignTask.id]);
  expect(choiceItem(html, easy.label)["aria-checked"]).toBe("false");
  expect(choiceItem(html, hard.label)["aria-checked"]).toBe("false");
  // Checked already, so Start waits on the personas alone, and the check's line names its success.
  const text = lineOf(html);
  expect(text).toContain(`The personas get: ${foreignTask.goal}`);
  expect(text).toContain(`success · ${successText(foreignTask.success)}`);
  expect(text).toContain("Choose 3 more personas");
  expect(text).not.toContain("Check the goal first");
  expect(buttonNames(html)).not.toContain("Use the stored goal's");
  // Its sentence edited, its success empties, and the button that brings it back names the goal.
  const edited = render(
    dispatched(chosen, { type: "sentenceEdited", sentence: "find my last order" }),
    bundledProfiles,
    stored,
  );
  expect(buttonNames(edited)).toContain("Use the stored goal's");
  expect(buttonNames(edited)).not.toContain("Use the preset's");
});

test("a stored goal's element success is a line, not a field: an edited sentence waits on a check, never on a success", () => {
  const element = storedGoalOf({
    ...foreignTask,
    id: "task_01k70f8x2m4n6p8q0r2s4t6v8y",
    success: { type: "selectorPresent", selector: "#order-history" },
  });
  const stored: StoredGoals = { status: "listed", goals: [element] };
  const edited = dispatched(
    withPersonas(
      dispatched(initialPanel(), { type: "goalChosen", goal: element }),
      bundledProfiles.slice(0, MIN_PERSONAS),
    ),
    { type: "sentenceEdited", sentence: "find my last order" },
  );
  const html = render(edited, bundledProfiles, stored);
  expect(html).not.toMatch(/<input[^>]*\sid="arena-success"/);
  expect(html).toMatch(
    /<p class="[^"]*\bmono text-ink-3">success · Element present: #order-history<\/p>/,
  );
  expect(buttonNames(html)).not.toContain("Use the stored goal's");
  expect(attributesOf(button(html, "Check the goal"))).not.toHaveProperty("disabled");
  expect(lineOf(html)).not.toContain(NO_SUCCESS);
  expect(lineOf(html)).toContain("Check the goal first");
});

test("the seed's hint names the backend the race runs on, as the settings dialog picks it", () => {
  const html = render(initialPanel(), bundledProfiles, NONE_STORED, "jev");
  const seed = attributesOf(input(html, "arena-seed"));
  expect(textById(html, seed["aria-describedby"] ?? "")).toBe("One seed for every persona, on Jev");
});
