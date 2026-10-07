import type { Profile, Task } from "@wayford/core";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { type Extraction, extractTask } from "../api/runs.js";
import { bundledProfiles, bundledTasks } from "../bundled-fixtures.js";
import { attributesOf, decode, lineOf } from "../preview/rendered-markup.js";
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

/** The attributes of the goal choice's item named `label`. */
function goalItem(html: string, label: string): Record<string, string> {
  const item = buttons(html).find(({ inner }) => nameOf(inner) === label);
  if (item === undefined) throw new Error(`no goal item reads ${label}`);
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
  "POST /tasks carries the edited sentence with the $label preset's start URL and success",
  async (preset) => {
    const state = dispatched(
      initialPanel(),
      { type: "presetChosen", presetId: preset.id },
      { type: "sentenceEdited", sentence: "I want to find something on this shop" },
    );
    // The goal choice shows the preset chosen.
    expect(goalItem(render(state), preset.label)["aria-checked"]).toBe("true");
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

test("Start the race is the one primary button, and Check the goal is outlined", () => {
  const html = render(withPersonas(initialPanel(), sixProfiles.slice(0, 3)), sixProfiles);
  const primary = buttons(html).filter(
    ({ attributes }) => attributes["data-variant"] === "default",
  );
  expect(primary.map(({ inner }) => nameOf(inner))).toStrictEqual(["Start the race"]);
  expect(attributesOf(button(html, "Check the goal"))["data-variant"]).toBe("outline");
});

test.each(GOAL_PRESETS)(
  "the $label choice draws its own sentence and its success condition, and not the other's",
  (preset) => {
    const other = preset === easy ? hard : easy;
    const html = render(dispatched(initialPanel(), { type: "presetChosen", presetId: preset.id }));
    expect(goalItem(html, preset.label)["aria-checked"]).toBe("true");
    expect(goalItem(html, other.label)["aria-checked"]).toBe("false");
    expect(sentenceOf(html)).toBe(preset.sentence);
    const success = html.match(/<p[^>]*\sid="arena-success"[^>]*>(.*?)<\/p>/s);
    expect(lineOf(success?.[1] ?? "")).toBe(`success · ${successText(preset.success)}`);
    const text = lineOf(html);
    expect(text).not.toContain(other.sentence);
    expect(text).not.toContain(successText(other.success));
  },
);

test("the sentence is a two-row field, described by its success", () => {
  const html = render(initialPanel());
  const tag = attributesOf(html.match(/<textarea[^>]*>/)?.[0] ?? "");
  expect(tag.rows).toBe("2");
  expect(tag["aria-describedby"]).toBe("arena-success");
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
  expect(labels).toStrictEqual(["goal", "sentence", "cast", "seed"]);
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
    // only what a sighted person sees. The two fields are named by their labels.
    expect(html).not.toMatch(/<input[^>]*type="(?:radio|checkbox)"/);
    const ids = [...html.matchAll(/<(?:input|textarea)[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toStrictEqual(["arena-sentence", "arena-seed"]);
    for (const id of ids) expect(html, id).toContain(`for="${id}"`);
    // Every button is named by its text: two goals, the check, six personas and Start. A
    // persona's avatar is hidden, so its toggle's name is the persona's name alone.
    expect(buttons(html).map(({ inner }) => nameOf(inner))).toStrictEqual([
      easy.label,
      hard.label,
      "Check the goal",
      ...sixProfiles.map((profile) => profile.label),
      "Start the race",
    ]);
    for (const profile of sixProfiles) {
      expect(toggle(html, profile).attributes.type, profile.label).toBe("button");
    }
    // The goal choice and the cast are groups their labels name; the cast is described by its line.
    expect(html).toMatch(/<div[^>]*role="radiogroup"[^>]*aria-label="goal"/);
    const cast = html.match(/<fieldset([^>]*)><legend[^>]*>(.*?)<\/legend>/s);
    expect(cast?.[2]).toBe("cast");
    const line = textById(html, attributesOf(cast?.[1] ?? "")["aria-describedby"] ?? "");
    expect(line).toMatch(/personas/);
    // The seed keeps its hint.
    const seed = attributesOf(input(html, "arena-seed"));
    expect(textById(html, seed["aria-describedby"] ?? "")).toBe("One seed for every persona");
    // What a person or a screen reader gets, as `router.test.tsx` collects it.
    const said = [
      ...[...html.matchAll(/>([^<]+)</g)].map((m) => m[1] ?? ""),
      ...[...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((m) => m[1] ?? ""),
    ].join(" ");
    expect(said.toLowerCase()).not.toContain("disabled");
  }
});
