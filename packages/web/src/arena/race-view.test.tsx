import { createMemoryHistory, RouterContextProvider } from "@tanstack/react-router";
import {
  RunEvent,
  type RunLimit,
  runResultFromEvents,
  type StartedRun,
  type Task,
  type TaskId,
} from "@wayford/core";
import { profileFixtures, runEventFixtures } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { StreamStatus } from "../api/run-events.js";
import { screenshotUrl } from "../api/runs.js";
import { attributesOf, classesOf, lineOf, styleOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { STUCK_STEPS } from "./avatar-state.js";
import { demoRace, eventsOf } from "./demo-race.js";
import {
  avatarStateOf,
  beforeEnd,
  failed,
  finished,
  fixtureEvent,
  GOAL,
  hardTask,
  shifted,
  stuckRun,
  tileOf,
} from "./fixture-race.js";
import {
  type LaneFold,
  liveLane,
  type RaceSnapshot,
  raceOver,
  runView,
  storedLane,
  UNSTORED_LANE,
} from "./race.js";
import { RaceView } from "./race-view.js";

/** Vera's fixture run, as io's `POST /runs` would have handed it back. */
const vera: StartedRun = { id: "run_vera-hard-1", profileId: "prof_vera", seed: 424242 };

/** The race's `<header>`: the goal, its meta line and the source badge. */
function headerOf(html: string): string {
  const header = html.match(/<header[\s>][\s\S]*?<\/header>/)?.[0];
  if (header === undefined) throw new Error("No header");
  return header;
}

/** The fixture's events up to and including `index`: what the stream has delivered by then. */
function upTo(index: number): RunEvent[] {
  return runEventFixtures.slice(0, index + 1);
}

/** The text of the fixture's narration event at `index`. */
function narrationAt(index: number): string {
  const event = fixtureEvent(index);
  if (event.type !== "narration") throw new Error(`the fixture's event ${index} is not narration`);
  return event.text;
}

/** Vera's run ended by `outcome` in place of her give-up, and a budget run out by `limit` if given. */
function endedBy(outcome: string, limit?: RunLimit): RunEvent[] {
  const end = RunEvent.parse({ ...finished, outcome, ...(limit === undefined ? {} : { limit }) });
  return [...beforeEnd, end];
}

/** The hard goal as the check hands it back for a race: the same goal, on a task minted for it. */
const raceTask: Task = { ...hardTask, id: "task_minted-for-race" };

/**
 * The race of `runs` after `snapshot`, on the hard goal, inside the app's router, so its links
 * build their hrefs. A static render runs no effect. A stored report is on the goal, the hard
 * goal's, unless `unreported`: the goal was edited, or no report is stored on it.
 */
function renderRace(
  runs: readonly StartedRun[],
  snapshot: RaceSnapshot,
  { unreported = false }: { unreported?: boolean } = {},
): string {
  const reportTask: TaskId | undefined = unreported ? undefined : hardTask.id;
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/race"] }) });
  return renderToStaticMarkup(
    <RouterContextProvider router={router}>
      <RaceView
        task={raceTask}
        label="Hard goal"
        seeds={[runs[0]?.seed ?? 1]}
        runs={runs}
        foldOf={(run) => liveLane(snapshot, run.id)}
        source="live"
        over={raceOver(runs, snapshot)}
        profiles={profileFixtures}
        reportTask={reportTask}
        onNewRace={() => {}}
      />
    </RouterContextProvider>,
  );
}

/** Vera's race of one, after `events`, her stream at `stream`. */
function render(events: readonly RunEvent[], stream: StreamStatus = "open"): string {
  return renderRace([vera], {
    events: new Map([[vera.id, events]]),
    streams: new Map([[vera.id, stream]]),
  });
}

/** The finish order list's entries, each on one line. */
function finishLines(html: string): string[] {
  const list = html.match(/<ol [^>]*aria-live="polite"[^>]*>(.*?)<\/ol>/s)?.[1] ?? "";
  return [...list.matchAll(/<li(?:\s[^>]*)?>(.*?)<\/li>/gs)].map(([, item]) => lineOf(item ?? ""));
}

/** The attributes of the `<svg>` in Vera's lane: her avatar, which comes first. */
function avatarOf(html: string): Record<string, string> {
  return attributesOf(tileOf(html, vera).match(/<svg[^>]*>/)?.[0] ?? "");
}

/** The attributes of the `<div>` around Vera's avatar: its squircle tile. */
function avatarTileOf(html: string, run: StartedRun = vera): Record<string, string> {
  return attributesOf(tileOf(html, run).match(/<div[^>]*>(?=<svg)/)?.[0] ?? "");
}

/** What Vera's lane says, on one line. */
function tileText(html: string): string {
  return lineOf(tileOf(html, vera));
}

/**
 * The text after a lane's narration label, in its bubble; `undefined` when the lane draws no
 * bubble, as before the first narration or on a Jev run (#195).
 */
function narrationOf(html: string, run: StartedRun = vera): string | undefined {
  const found = tileOf(html, run).match(
    /<span[^>]*>narration · after the fact<\/span>((?:(?!<\/p>).)*)<\/p>/s,
  );
  return found === null ? undefined : lineOf(found[1] ?? "");
}

/** A lane's detail line: its text and its classes, or undefined when it has none. */
function detailOf(html: string, run: StartedRun = vera) {
  const found = tileOf(html, run).match(/<p(\s[^>]*\bdata-detail=""[^>]*)>(.*?)<\/p>/s);
  if (found === null) return undefined;
  return {
    text: lineOf(found[2] ?? ""),
    classes: classesOf(attributesOf(found[1] ?? "")),
  };
}

/**
 * A lane's right column, the `<div>` around its `readout` clock, as "outcome | clock | steps": each
 * of its three spans on one line. The outcome's span holds its glyph, which has no text. The run
 * link under them is `runLinkOf`'s.
 */
function standingOf(html: string, run: StartedRun = vera): string {
  const tile = tileOf(html, run);
  const clock = tile.search(/<span class="readout[\s"]/);
  if (clock === -1) throw new Error(`no clock in ${run.id}`);
  const column = tile
    .slice(tile.lastIndexOf("<div", clock), tile.indexOf("</div>", clock))
    .replace(/<a\s.*?<\/a>/s, "");
  return [...column.matchAll(/<span[^>]*>(.*?)<\/span>/gs)]
    .map(([, inner]) => lineOf(inner ?? ""))
    .join(" | ");
}

/**
 * The href of the link in `run`'s lane, and its text with the arrow `RaceLane` hides from its
 * name; undefined when the lane has none.
 */
function runLinkOf(html: string, run: StartedRun = vera) {
  const links = [...tileOf(html, run).matchAll(/<a\s([^>]*)>(.*?)<\/a>/gs)];
  if (links.length > 1) throw new Error(`${run.id}'s lane holds more than one link`);
  const [link] = links;
  if (link === undefined) return undefined;
  return { href: attributesOf(link[1] ?? "").href, text: lineOf(link[2] ?? "") };
}

/** The goal strip's link that reads `text`: its href and classes; undefined while it has none. */
function stripLinkOf(html: string, text: "See the report" | "Analyse this race") {
  const strip = html.slice(0, html.indexOf("<ol"));
  const tag = strip.match(new RegExp(`<a\\s([^>]*)>${text}</a>`))?.[1];
  if (tag === undefined) return undefined;
  const attributes = attributesOf(tag);
  return { href: attributes.href, classes: classesOf(attributes) };
}

/** The goal strip's words, on one line. */
function stripText(html: string): string {
  return lineOf(html.slice(0, html.indexOf("<ol")));
}

/** The goal strip's result line, on one line, with its k/n's classes; undefined while it has none. */
function resultLineOf(html: string) {
  const strip = html.slice(0, html.indexOf("<ol"));
  const found = strip.match(/<p[^>]*>(<span ([^>]*)>\d+\/\d+<\/span>.*?)<\/p>/s);
  if (found === null) return undefined;
  return { text: lineOf(found[1] ?? ""), countClasses: classesOf(attributesOf(found[2] ?? "")) };
}

/** The track's label: every step in words. */
function trackLabelOf(html: string, run: StartedRun = vera): string {
  const tag = tileOf(html, run).match(/<div[^>]*role="img"[^>]*>/)?.[0] ?? "";
  return attributesOf(tag)["aria-label"] ?? "";
}

describe("runView folds a run's events so far into what its lane shows", () => {
  test("before runStarted: idle, with no time, narration or screenshot", () => {
    expect(runView([])).toStrictEqual({
      state: "idle",
      stuckOn: undefined,
      simulatedMs: undefined,
      narration: undefined,
      screenshotStep: undefined,
    });
  });

  test("the time is the simulated time of every step planned or wasted so far, none before the first, at every prefix", () => {
    // Step 0's click costs 4182 ms, step 1's scroll 3120, step 2's double click 3774, step 3, wasted,
    // 2700, and step 4's give-up 2700: each counts from the event that carries it, its
    // actionPlanned or its stepWasted, to the end.
    expect(runEventFixtures.map((_, i) => runView(upTo(i)).simulatedMs)).toStrictEqual([
      ...Array(3).fill(undefined),
      ...Array(4).fill(4182),
      ...Array(4).fill(7302),
      ...Array(3).fill(11_076),
      ...Array(3).fill(13_776),
      ...Array(3).fill(16_476),
    ]);
  });

  test("the wall clock decides nothing: the same events with other timestamps read the same time", () => {
    // Each event a minute after the one before it, as a slow model would stretch the run.
    const slow = runEventFixtures.map((event, i) =>
      RunEvent.parse({ ...event, timestamp: shifted(event.timestamp, i * 60_000) }),
    );
    expect(runView(slow).simulatedMs).toBe(runView(runEventFixtures).simulatedMs);
  });

  test("after step 0 lands: moving, 4.2 s in, the first narration and step 0's screenshot", () => {
    expect(runView(upTo(4))).toStrictEqual({
      state: "moving",
      stuckOn: undefined,
      simulatedMs: 4182,
      narration: narrationAt(2),
      screenshotStep: 0,
    });
  });

  test("the screenshot is the latest landed action's that carries one", () => {
    const steps = runEventFixtures.map((_, i) => runView(upTo(i)).screenshotStep);
    expect(steps).toStrictEqual([
      ...Array(4).fill(undefined),
      ...Array(4).fill(0),
      ...Array(4).fill(1),
      ...Array(6).fill(2),
      4,
      4,
    ]);
    // A landed action that took no screenshot leaves the last one in place.
    const event = fixtureEvent(18);
    if (event.type !== "actionPerformed") throw new Error("event 18 must be actionPerformed");
    const { screenshotPath: _taken, ...withoutShot } = event;
    expect(runView([...upTo(17), RunEvent.parse(withoutShot)]).screenshotStep).toBe(2);
  });

  test("at runFinished: gave up, ended at its timestamp, the time held there", () => {
    expect(runView(runEventFixtures)).toStrictEqual({
      state: "gaveUp",
      stuckOn: undefined,
      simulatedMs: 16_476,
      narration: narrationAt(16),
      screenshotStep: 4,
      ended: { outcome: "gave_up", at: "2026-09-22T10:00:15.500Z" },
    });
  });

  test("a budget run out keeps the limit that cut it off, and a run recorded before it none", () => {
    expect(runView(endedBy("budget_exceeded", "steps")).ended).toStrictEqual({
      outcome: "budget_exceeded",
      limit: "steps",
      at: "2026-09-22T10:00:15.500Z",
    });
    expect(runView(endedBy("budget_exceeded")).ended).toStrictEqual({
      outcome: "budget_exceeded",
      at: "2026-09-22T10:00:15.500Z",
    });
  });

  test("a crash ends as error, with runFailed's message", () => {
    expect(runView([...beforeEnd, failed])).toStrictEqual({
      state: "error",
      stuckOn: undefined,
      simulatedMs: 16_476,
      narration: narrationAt(16),
      screenshotStep: 4,
      ended: {
        outcome: "error",
        at: "2026-09-22T10:00:15.500Z",
        error: "Target page, context or browser has been closed",
      },
    });
  });
});

describe("a lane's narration follows the latest narration event of its run", () => {
  test("Vera's line: no bubble, then the first narration after event 2, the second after 6, the last after 16", () => {
    // At every prefix: the bubble holds the latest narration so far, and there is none before the
    // first. Each narration shows from its own event on: 2, 6, 10 and 16.
    const lines = runEventFixtures.map((_, i) => narrationOf(render(upTo(i))));
    expect(lines).toStrictEqual([
      ...Array(2).fill(undefined),
      ...Array(4).fill(narrationAt(2)),
      ...Array(4).fill(narrationAt(6)),
      ...Array(6).fill(narrationAt(10)),
      ...Array(4).fill(narrationAt(16)),
    ]);
  });

  test("a run with no narration event, as a Jev run: no bubble and no label", () => {
    const jevRun = RunEvent.array().parse(
      runEventFixtures.filter((event) => event.type !== "narration"),
    );
    // Still a whole run: it folds, and only the narration is gone.
    expect(runResultFromEvents(jevRun).steps.every((step) => step.narration === "")).toBe(true);
    const html = render(jevRun);
    expect(tileOf(html, vera)).not.toContain("after the fact");
    expect(runView(jevRun).narration).toBeUndefined();
  });
});

describe("the state in words, with what grounds it", () => {
  test("idle is waiting, an action makes it moving", () => {
    // Before the first step is planned the clock is a dash: no step has a time yet.
    expect(standingOf(render([]))).toBe("Waiting | — | 0 steps so far");
    expect(standingOf(render(upTo(2)))).toBe("Waiting | — | 1 step so far");
    expect(avatarStateOf(render(upTo(3)), vera)).toBe("idle");
    expect(standingOf(render(upTo(3)))).toBe("Waiting | 0:04.2 | 1 step so far");
    expect(avatarStateOf(render(upTo(4)), vera)).toBe("moving");
    expect(standingOf(render(upTo(4)))).toBe("Moving | 0:04.2 | 1 step so far");
    expect(detailOf(render(upTo(4)))).toBeUndefined();
  });

  test("stuck names what the rule counted: the last 2 steps and the page they left as it was", () => {
    expect(STUCK_STEPS).toBe(2);
    // Vera's variant, after step 5's observation: steps 3 and 4 both left /settings as it was.
    const stuck = stuckRun.slice(0, 18);
    expect(runView(stuck).stuckOn).toBe("/settings");
    const html = render(stuck);
    expect(avatarStateOf(html, vera)).toBe("stuck");
    expect(standingOf(html)).toMatch(/^Stuck \| /);
    const detail = detailOf(html);
    expect(detail?.text).toBe("Stuck: the last 2 steps left /settings as it was");
    expect(detail?.classes).toContain("text-ink-2");
    expect(detail?.classes).not.toContain("text-fault");
    expect(tileOf(html, vera)).toContain('<span class="mono">/settings</span>');
  });

  test("an ended run: its outcome word, the clock held at its end, and every step counted", () => {
    const through = render(endedBy("success"));
    expect(avatarStateOf(through, vera)).toBe("done");
    expect(standingOf(through)).toBe("Got through | 0:16.5 | 5 steps");

    const gaveUp = render(runEventFixtures);
    expect(avatarStateOf(gaveUp, vera)).toBe("gaveUp");
    expect(standingOf(gaveUp)).toBe("Gave up | 0:16.5 | 5 steps");
    // The word alone: the stored code is not printed after it.
    expect(tileText(gaveUp)).not.toContain("gave_up");
    expect(detailOf(gaveUp)).toBeUndefined();
    // The track ends on the give-up, which it counts.
    expect(trackLabelOf(gaveUp)).toBe("5 steps: click, scroll, doubleClick, wasted, gave up");

    // A budget run out has its own word, not Gave up's: the limit that cut it off, or Over budget
    // when its runFinished names none, as one recorded before #196. The track and the finish
    // order say the same word.
    for (const [limit, word] of [
      ["steps", "Hit the step cap"],
      ["clock", "Out of time"],
      [undefined, "Over budget"],
    ] as const) {
      const html = render(endedBy("budget_exceeded", limit));
      expect(standingOf(html), word).toBe(`${word} | 0:16.5 | 5 steps`);
      expect(trackLabelOf(html), word).toBe(
        `5 steps: click, scroll, doubleClick, wasted, ${word.toLowerCase()}`,
      );
      expect(finishLines(html), word).toStrictEqual([`– Vera ${word} 0:16.5`]);
      expect(tileText(html), word).not.toContain("Gave up");
      expect(tileText(html), word).not.toContain("budget_exceeded");
    }

    // A crash is the tool failing: its message, in fault.
    const error = render([...beforeEnd, failed]);
    expect(avatarStateOf(error, vera)).toBe("error");
    expect(standingOf(error)).toBe("Error | 0:16.5 | 5 steps");
    expect(detailOf(error)).toStrictEqual({
      text: "Target page, context or browser has been closed",
      classes: expect.arrayContaining(["text-fault"]),
    });
    expect(tileText(error)).not.toContain("Gave up");
  });

  test("a stream lost mid-run: what was last seen, in fault, the avatar plain and dimmed, listed with no place", () => {
    for (const [index, seen] of [
      [3, "waiting"],
      [8, "moving"],
    ] as const) {
      const html = render(upTo(index), "failed");
      expect(standingOf(html), `after event ${index}`).toMatch(/^Stream lost \| /);
      expect(detailOf(html), `after event ${index}`).toStrictEqual({
        text: `Stream lost: last seen ${seen}`,
        classes: expect.arrayContaining(["text-fault"]),
      });
      // No live state: no `data-state`, no badge, no state in the avatar's title.
      expect(avatarOf(html)).not.toHaveProperty("data-state");
      expect(avatarTileOf(html).class).toContain("opacity-50");
      expect(tileOf(html, vera)).not.toContain('data-part="state"');
      expect(tileText(html)).not.toContain("Run state");
      // A lost run never ended: its track has no end mark and its post is not reached.
      expect(tileOf(html, vera)).not.toContain("data-end=");
      expect(finishLines(html)).toStrictEqual(["– Vera Stream lost"]);
    }
    // The same events on an open stream: live, and nothing lost.
    const open = render(upTo(8), "open");
    expect(avatarStateOf(open, vera)).toBe("moving");
    expect(avatarTileOf(open).class).not.toContain("opacity-50");
    expect(tileText(open)).not.toContain("Stream lost");
    expect(finishLines(open)).toStrictEqual([]);
  });

  test("a stream lost mid-run draws no step under way: its track holds only the steps that ran", () => {
    for (const [index, label] of [
      [1, "1 step so far"],
      [3, "1 step so far"],
      [15, "5 steps so far: click, scroll, doubleClick, wasted"],
    ] as const) {
      const lost = render(upTo(index), "failed");
      expect(tileOf(lost, vera), `after event ${index}`).not.toContain('data-pip="now"');
      expect(trackLabelOf(lost), `after event ${index}`).toBe(label);
      // The same events on an open stream: the step under way is drawn.
      expect(tileOf(render(upTo(index)), vera), `after event ${index}`).toContain('data-pip="now"');
    }
  });

  test("a stream that failed after the run's end still shows the end, listed", () => {
    for (const stream of ["failed", "ended"] as const) {
      const html = render(runEventFixtures, stream);
      expect(avatarStateOf(html, vera), stream).toBe("gaveUp");
      expect(standingOf(html), stream).toMatch(/^Gave up \| /);
      expect(lineOf(html), stream).not.toContain("Stream lost");
      expect(finishLines(html), stream).toStrictEqual(["– Vera Gave up 0:16.5"]);
    }
  });
});

describe("the lane", () => {
  test("is an article its heading names, in the persona's slot, her 64 px avatar inside", () => {
    const html = render(upTo(4));
    const attributes = attributesOf(html.match(/<article [^>]*>/)?.[0] ?? "");
    expect(attributes["aria-labelledby"]).toBe("race-run_vera-hard-1");
    expect(html).toMatch(/<h3 [^>]*id="race-run_vera-hard-1"[^>]*>Vera<\/h3>/);
    expect(styleOf(attributes)["--p"]).toBe("var(--persona-cobalt)");
    expect(avatarOf(html)["data-state"]).toBe("moving");
    expect(classesOf(avatarTileOf(html))).toContain("size-16");
  });

  test("the latest step's screenshot, served by io, or a box that there is none yet", () => {
    const before = tileOf(render(upTo(3)), vera);
    expect(before).not.toContain("<img");
    expect(lineOf(before)).toContain("No screenshot yet");

    for (const [index, step] of [
      [4, 0],
      [17, 2],
      [18, 4],
    ] as const) {
      const img = attributesOf(tileOf(render(upTo(index)), vera).match(/<img [^>]*>/)?.[0] ?? "");
      expect(img.alt, `after event ${index}`).toBe(`Vera, after step ${step}`);
      expect(img.src, `after event ${index}`).toBe(screenshotUrl(vera.id, step));
    }
  });
});

describe("the race in progress, as demoRace holds it", () => {
  const [ada, kai, veraRace] = demoRace.runs;
  if (ada === undefined || kai === undefined || veraRace === undefined) {
    throw new Error("demoRace holds three runs");
  }
  const html = renderRace(demoRace.runs, { events: demoRace.events, streams: new Map() });

  test("one lane per run, in the runs' order, in a list", () => {
    const lanes = html.match(/<ol class="[^"]*">(.*?)<\/ol>/s)?.[1] ?? "";
    const names = [...lanes.matchAll(/<li[^>]*><article[^>]*>.*?<h3[^>]*>(.*?)<\/h3>/gs)].map(
      ([, name]) => name,
    );
    expect(names).toStrictEqual(["Ada", "Kai", "Vera"]);
  });

  test("Ada reached the post first, Kai moves on, Vera gave up", () => {
    expect(standingOf(html, ada)).toBe("Got through | 0:07.3 | 2 steps");
    expect(trackLabelOf(html, ada)).toBe("2 steps: click, scroll; got through, 1st");
    expect(tileOf(html, ada)).toMatch(/>1st</);

    expect(standingOf(html, kai)).toBe("Moving | 0:13.8 | 5 steps so far");
    expect(trackLabelOf(html, kai)).toBe(
      "5 steps so far: click, scroll, doubleClick, wasted, under way",
    );
    expect(tileOf(html, kai)).toContain('data-pip="now"');

    expect(standingOf(html, veraRace)).toBe("Gave up | 0:16.5 | 5 steps");
    expect(tileOf(html, veraRace)).toContain('data-end="gaveUp"');
    expect(tileOf(html, veraRace)).not.toMatch(/>1st</);
  });

  test("each lane's latest screenshot", () => {
    const shots = demoRace.runs.map((run) =>
      attributesOf(tileOf(html, run).match(/<img [^>]*>/)?.[0] ?? ""),
    );
    expect(shots.map(({ src, alt }) => [src, alt])).toStrictEqual([
      [screenshotUrl(ada.id, 1), "Ada, after step 1"],
      [screenshotUrl(kai.id, 2), "Kai, after step 2"],
      [screenshotUrl(veraRace.id, 4), "Vera, after step 4"],
    ]);
  });

  test("the finish order lists the two runs that ended, in words and the clock, the one through numbered", () => {
    expect(finishLines(html)).toStrictEqual(["1. Ada Got through 0:07.3", "– Vera Gave up 0:16.5"]);
  });

  test("the two runs that ended link to their run detail; Kai's, still running, does not", () => {
    expect(runLinkOf(html, ada)).toStrictEqual({ href: `/runs/${ada.id}`, text: "See the run →" });
    expect(runLinkOf(html, kai)).toBeUndefined();
    expect(runLinkOf(html, veraRace)).toStrictEqual({
      href: `/runs/${veraRace.id}`,
      text: "See the run →",
    });
  });

  test("Kai still runs, so the race does not yet lead to a report", () => {
    expect(stripLinkOf(html, "See the report")).toBeUndefined();
    expect(stripLinkOf(html, "Analyse this race")).toBeUndefined();
    expect(resultLineOf(html)).toBeUndefined();
  });
});

describe("around the lanes", () => {
  /** The "New race" button's start tag. */
  function newRace(html: string): Record<string, string> {
    const tag = html.match(/<button[^>]*>New race<\/button>/)?.[0];
    if (tag === undefined) throw new Error("no New race button");
    return attributesOf(tag);
  }

  test("New race is open while the race runs, and says the runs go on and a new race queues", () => {
    const running = render(upTo(8));
    const open = newRace(running);
    // Several races can run at once (issue #194): the button never waits.
    expect(open).not.toHaveProperty("disabled");
    expect(open["data-variant"]).toBe("outline");
    expect(running).toMatch(
      new RegExp(
        `id="${open["aria-describedby"]}"[^>]*>io keeps running this race, and the Race tab brings you back to it\\. A new race queues its runs behind these\\.<`,
      ),
    );

    for (const [what, html] of [
      ["ended", render(runEventFixtures, "ended")],
      ["lost", render(upTo(8), "failed")],
    ] as const) {
      const over = newRace(html);
      expect(over, what).not.toHaveProperty("disabled");
      expect(over, what).not.toHaveProperty("aria-describedby");
      expect(lineOf(html), what).not.toContain("io keeps running this race");
    }
  });

  test("once the race is over on a goal with a stored report: See the report opens it, in ink, after New race; Analyse this race follows, quiet", () => {
    const running = render(upTo(8));
    expect(stripLinkOf(running, "See the report")).toBeUndefined();
    expect(stripLinkOf(running, "Analyse this race")).toBeUndefined();
    for (const [what, html] of [
      ["ended", render(runEventFixtures, "ended")],
      ["lost", render(upTo(8), "failed")],
    ] as const) {
      // The preset's task, whose report is stored: the race's own task has none yet.
      const report = stripLinkOf(html, "See the report");
      expect(report?.href, what).toBe(`/report/${hardTask.id}`);
      // The primary look: ink, as `Button`'s default variant draws it. New race stays outlined.
      expect(report?.classes, what).toEqual(expect.arrayContaining(["bg-ink", "text-paper"]));
      expect(newRace(html)["data-variant"], what).toBe("outline");
      expect(html.indexOf(">New race<"), what).toBeLessThan(html.indexOf(">See the report<"));
      // The race's own report, which starts the Analyst on arrival, as a ghost button.
      const analyse = stripLinkOf(html, "Analyse this race");
      expect(analyse?.href, what).toBe(`/report/${raceTask.id}?analyse=true`);
      expect(analyse?.classes, what).toEqual(expect.arrayContaining(["bg-transparent"]));
      expect(stripText(html), what).toContain("This race is not in the stored report.");
    }
  });

  test("once the race is over on a goal with no stored report, edited or never analysed: Analyse this race is the way on, and no stored report is claimed", () => {
    const html = renderRace(
      [vera],
      { events: new Map([[vera.id, runEventFixtures]]), streams: new Map() },
      { unreported: true },
    );
    expect(stripLinkOf(html, "See the report")).toBeUndefined();
    const analyse = stripLinkOf(html, "Analyse this race");
    expect(analyse?.href).toBe(`/report/${raceTask.id}?analyse=true`);
    expect(analyse?.classes).toEqual(expect.arrayContaining(["bg-ink", "text-paper"]));
    expect(stripText(html)).not.toContain("stored report");
    expect(resultLineOf(html)?.text).toBe("0/1 got through");
  });

  test("once the race is over, a line says how many got through, k/n in mono, and how many streams were lost", () => {
    const ada: StartedRun = { id: "run_ada-hard-1", profileId: "prof_ada", seed: vera.seed };
    const adaThrough = eventsOf(ada, endedBy("success"));
    // A race that gave up only is the no-report test's above.
    const cases: [string, readonly StartedRun[], RaceSnapshot, string][] = [
      [
        "an error",
        [vera],
        { events: new Map([[vera.id, [...beforeEnd, failed]]]), streams: new Map() },
        "0/1 got through",
      ],
      [
        "one through, one gave up",
        [ada, vera],
        {
          events: new Map([
            [ada.id, adaThrough],
            [vera.id, runEventFixtures],
          ]),
          streams: new Map(),
        },
        "1/2 got through",
      ],
      [
        "one through, one stream lost",
        [ada, vera],
        {
          events: new Map([
            [ada.id, adaThrough],
            [vera.id, upTo(8)],
          ]),
          streams: new Map([[vera.id, "failed"]]),
        },
        "1/2 got through, 1 stream lost",
      ],
    ];
    for (const [what, runs, snapshot, line] of cases) {
      const html = renderRace(runs, snapshot);
      expect(resultLineOf(html), what).toStrictEqual({
        text: line,
        countClasses: expect.arrayContaining(["mono"]),
      });
    }
  });

  test("the goal strip: the preset's tag and the task id, the goal in quotes, its success in mono, and the seed", () => {
    const html = render([]);
    expect(hardTask.goal).toBe(GOAL);
    expect(html).toMatch(new RegExp(`<h2 [^>]*id="race-goal"[^>]*><q>${GOAL}</q></h2>`));
    const strip = html.slice(0, html.indexOf("<ol"));
    expect(lineOf(strip)).toMatch(/^Hard goal task_minted-for-race /);
    expect(strip).toMatch(
      /<p class="[^"]*\bmono\b[^"]*">success · URL matches \*\*\/deliveries\/archive<\/p>/,
    );
    // The seed in a mono box, its word in ink-3.
    expect(strip).toMatch(
      /<span class="[^"]*\bmono\b[^"]*"><span class="text-ink-3">seed<\/span>424242<\/span>/,
    );
  });

  test("the strip says once, in the meta ink, that the clocks are simulated, not the wall clock", () => {
    for (const [what, html] of [
      ["before a step", render([])],
      ["running", render(upTo(8))],
      ["ended", render(runEventFixtures, "ended")],
    ] as const) {
      const strip = html.slice(0, html.indexOf("<ol"));
      const captions = [...strip.matchAll(/<p class="([^"]*)">([^<]*simulated[^<]*)<\/p>/gi)];
      expect(
        captions.map(([, classes, text]) => [lineOf(text ?? ""), classes?.split(" ")]),
        what,
      ).toStrictEqual([
        [
          "Simulated time from the KLM and Fitts's law, not the wall clock",
          expect.arrayContaining(["body", "text-ink-3"]),
        ],
      ]);
      // Once on the Race: the lanes' clocks say it only in their labels.
      expect(lineOf(html).match(/wall clock/g), what).toHaveLength(1);
    }
  });

  test("each lane's clock is labelled simulated time, its visible text unchanged", () => {
    const html = render(upTo(8));
    const clock = tileOf(html, vera)
      .match(/<span ([^>]*\breadout\b[^>]*)>(.*?)<\/span>/)
      ?.slice(1);
    expect(clock?.[1]).toBe("0:07.3");
    expect(attributesOf(clock?.[0] ?? "")["aria-label"]).toBe("simulated time 0:07.3");
  });

  test("the finish order is the one live region, hidden from sight, and lists a run once it ends", () => {
    const running = render(upTo(18));
    expect(running.match(/aria-live=/g)).toHaveLength(1);
    expect(running).toMatch(/<ol [^>]*aria-live="polite"[^>]*><\/ol>/);
    expect(lineOf(running)).toContain("No run has ended yet");
    // The lanes show the places on their posts; the list is for screen readers, and names the
    // clock it ranks by.
    expect(running).toMatch(
      /<section [^>]*aria-labelledby="race-finish-order"[^>]*class="sr-only"[^>]*>\s*<h3 [^>]*id="race-finish-order"[^>]*>Finish order, by simulated time<\/h3>/,
    );

    const ended = render(runEventFixtures);
    expect(ended.match(/aria-live=/g)).toHaveLength(1);
    expect(finishLines(ended)).toStrictEqual(["– Vera Gave up 0:16.5"]);
    expect(lineOf(ended)).not.toContain("No run has ended yet");
  });

  test("the finish order numbers only the runs that got through, as their posts do: a give-up before them follows with no number", () => {
    // Vera gives up at 0:16.5, then Ada gets through at 0:20.0: her run is the fixture's, its last
    // step 3.5 s longer and its end a success. Ada's post reads 1st, so the list must too, though
    // Vera ended first.
    const ada: StartedRun = { id: "run_ada-hard-1", profileId: "prof_ada", seed: vera.seed };
    const adaEvents = eventsOf(ada, runEventFixtures, (event) =>
      event.type === "runFinished"
        ? { outcome: "success" }
        : event.type === "actionPlanned" && event.stepIndex === 4
          ? { simulatedMs: (event.simulatedMs ?? 0) + 3500 }
          : {},
    );
    const html = renderRace([ada, vera], {
      events: new Map([
        [ada.id, adaEvents],
        [vera.id, runEventFixtures],
      ]),
      streams: new Map(),
    });
    expect(standingOf(html, ada)).toBe("Got through | 0:20.0 | 5 steps");
    expect(standingOf(html)).toBe("Gave up | 0:16.5 | 5 steps");

    expect(finishLines(html)).toStrictEqual(["1. Ada Got through 0:20.0", "– Vera Gave up 0:16.5"]);
    expect(tileOf(html, ada)).toMatch(/>1st</);
    expect(trackLabelOf(html, ada)).toMatch(/; got through, 1st$/);
    expect(tileOf(html, vera)).not.toMatch(/>1st</);
  });
});

describe("a race drawn from its runs' records", () => {
  /**
   * The race of `runs` on `seeds`, each lane as `foldOf` folds it, drawn from records, inside the
   * app's router, with the hard goal's stored report to lead to.
   */
  function renderStored(
    runs: readonly StartedRun[],
    foldOf: (run: StartedRun) => LaneFold,
    seeds: readonly number[] = [vera.seed],
  ): string {
    const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/race"] }) });
    return renderToStaticMarkup(
      <RouterContextProvider router={router}>
        <RaceView
          task={raceTask}
          label="Hard goal"
          seeds={seeds}
          runs={runs}
          foldOf={foldOf}
          source="stored"
          over
          profiles={profileFixtures}
          reportTask={hardTask.id}
          onNewRace={() => {}}
        />
      </RouterContextProvider>,
    );
  }

  test("the header's badge reads stored here, live while the race runs, and nothing once it is over", () => {
    const stored = renderStored([vera], () => storedLane(runResultFromEvents(runEventFixtures)));
    expect(headerOf(stored)).toMatch(/data-source="stored"/);
    expect(headerOf(render([]))).toMatch(/data-source="live"/);
    expect(render(runEventFixtures, "ended")).not.toMatch(/data-source/);
  });

  test("a stored run's lane reads as its live lane did at its end", () => {
    const stored = renderStored([vera], () => storedLane(runResultFromEvents(runEventFixtures)));
    const live = render(runEventFixtures, "ended");
    expect(standingOf(stored)).toBe(standingOf(live));
    expect(narrationOf(stored)).toBe(narrationOf(live));
    expect(avatarStateOf(stored, vera)).toBe(avatarStateOf(live, vera));
    expect(finishLines(stored)).toStrictEqual(finishLines(live));
    // io holds the record it was drawn from, so the lane links to the run, as the ended live lane.
    expect(runLinkOf(stored)).toStrictEqual(runLinkOf(live));
    expect(runLinkOf(stored)?.href).toBe(`/runs/${vera.id}`);
    // Over, so the strip leads on to the goal's stored report as the live race's did at its end.
    expect(stripLinkOf(stored, "See the report")).toStrictEqual(
      stripLinkOf(live, "See the report"),
    );
  });

  test("a run io kept no record of: Stream lost, and the note says why, in fault", () => {
    const html = renderStored([vera], () => UNSTORED_LANE);
    expect(standingOf(html)).toBe("Stream lost | — | no steps stored");
    expect(detailOf(html)?.text).toBe(
      "No record: the run never started, or io stopped or failed to store it",
    );
    expect(detailOf(html)?.classes).toContain("text-fault");
    expect(finishLines(html)).toStrictEqual(["– Vera Stream lost"]);
    // No record, so no run detail to link to.
    expect(runLinkOf(html)).toBeUndefined();
  });

  test("on several seeds, the strip names every seed and each lane its persona's seed", () => {
    const second: StartedRun = { ...vera, id: "run_vera-hard-2", seed: 7 };
    const html = renderStored([vera, second], () => UNSTORED_LANE, [vera.seed, second.seed]);
    expect(html).toMatch(/<span class="text-ink-3">seeds<\/span>424242, 7<\/span>/);
    expect(html).toMatch(/<h3 id="race-run_vera-hard-1"[^>]*>Vera, seed 424242<\/h3>/);
    expect(html).toMatch(/<h3 id="race-run_vera-hard-2"[^>]*>Vera, seed 7<\/h3>/);
  });
});
