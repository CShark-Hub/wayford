import { RunEvent, runResultFromEvents } from "@wayford/core";
import { profileFixtures, runEventFixtures } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { StreamStatus } from "../api/run-events.js";
import { type StartedRun, screenshotUrl } from "../api/runs.js";
import { attributesOf, classesOf, lineOf, styleOf } from "../preview/rendered-markup.js";
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
import { type RaceSnapshot, runView } from "./race.js";
import { RaceView } from "./race-view.js";

/** Vera's fixture run, as io's `POST /runs` would have handed it back. */
const vera: StartedRun = { id: "run_vera-hard-1", profileId: "prof_vera", seed: 424242 };

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

/** Vera's run ended by `outcome` in place of her give-up. */
function endedBy(outcome: string): RunEvent[] {
  return [...beforeEnd, RunEvent.parse({ ...finished, outcome })];
}

/** The race of `runs` after `snapshot`, on the hard goal. */
function renderRace(runs: readonly StartedRun[], snapshot: RaceSnapshot): string {
  return renderToStaticMarkup(
    <RaceView
      task={hardTask}
      label="Hard goal"
      seed={runs[0]?.seed ?? 1}
      runs={runs}
      snapshot={snapshot}
      profiles={profileFixtures}
      onNewRace={() => {}}
    />,
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

/** The text after a lane's narration label, which must be there even when no narration is. */
function narrationOf(html: string, run: StartedRun = vera): string {
  const found = tileOf(html, run).match(
    /<span[^>]*>narration · after the fact<\/span>((?:(?!<\/p>).)*)<\/p>/s,
  );
  if (found === null) throw new Error(`no narration label in ${run.id}`);
  return lineOf(found[1] ?? "");
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
 * of its three spans on one line. The outcome's span holds its glyph, which has no text.
 */
function standingOf(html: string, run: StartedRun = vera): string {
  const tile = tileOf(html, run);
  const clock = tile.search(/<span class="readout[\s"]/);
  if (clock === -1) throw new Error(`no clock in ${run.id}`);
  const column = tile.slice(tile.lastIndexOf("<div", clock), tile.indexOf("</div>", clock));
  return [...column.matchAll(/<span[^>]*>(.*?)<\/span>/gs)]
    .map(([, inner]) => lineOf(inner ?? ""))
    .join(" | ");
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
      elapsedMs: undefined,
      narration: undefined,
      screenshotStep: undefined,
    });
  });

  test("elapsed time is the latest event's timestamp less runStarted's, at every prefix", () => {
    const start = Date.parse(fixtureEvent(0).timestamp);
    runEventFixtures.forEach((event, i) => {
      expect(runView(upTo(i)).elapsedMs, `after event ${i}`).toBe(
        Date.parse(event.timestamp) - start,
      );
    });
  });

  test("after step 0 lands: moving, 3 s in, the first narration and step 0's screenshot", () => {
    expect(runView(upTo(4))).toStrictEqual({
      state: "moving",
      stuckOn: undefined,
      elapsedMs: 3000,
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
      elapsedMs: 15_500,
      narration: narrationAt(16),
      screenshotStep: 4,
      ended: { outcome: "gave_up", at: "2026-09-22T10:00:15.500Z" },
    });
  });

  test("a crash ends as error, with runFailed's message", () => {
    expect(runView([...beforeEnd, failed])).toStrictEqual({
      state: "error",
      stuckOn: undefined,
      elapsedMs: 15_500,
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
  test("Vera's line: empty, then the first narration after event 2, the second after 6, the last after 16", () => {
    // At every prefix: the line holds the latest narration so far, and nothing before the first.
    // Each narration shows from its own event on: 2, 6, 10 and 16.
    const lines = runEventFixtures.map((_, i) => narrationOf(render(upTo(i))));
    expect(lines).toStrictEqual([
      ...Array(2).fill(""),
      ...Array(4).fill(narrationAt(2)),
      ...Array(4).fill(narrationAt(6)),
      ...Array(6).fill(narrationAt(10)),
      ...Array(4).fill(narrationAt(16)),
    ]);
  });

  test("a run with no narration event, as a Jev run: the label and nothing after it", () => {
    const jevRun = RunEvent.array().parse(
      runEventFixtures.filter((event) => event.type !== "narration"),
    );
    // Still a whole run: it folds, and only the narration is gone.
    expect(runResultFromEvents(jevRun).steps.every((step) => step.narration === "")).toBe(true);
    const html = render(jevRun);
    expect(narrationOf(html)).toBe("");
    expect(runView(jevRun).narration).toBeUndefined();
  });
});

describe("the state in words, with what grounds it", () => {
  test("idle is waiting, an action makes it moving", () => {
    // Before runStarted the clock is a dash.
    expect(standingOf(render([]))).toBe("Waiting | — | 0 steps so far");
    expect(avatarStateOf(render(upTo(3)), vera)).toBe("idle");
    expect(standingOf(render(upTo(3)))).toBe("Waiting | 0:02.5 | 1 step so far");
    expect(avatarStateOf(render(upTo(4)), vera)).toBe("moving");
    expect(standingOf(render(upTo(4)))).toBe("Moving | 0:03.0 | 1 step so far");
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
    expect(standingOf(through)).toBe("Got through | 0:15.5 | 5 steps");

    const gaveUp = render(runEventFixtures);
    expect(avatarStateOf(gaveUp, vera)).toBe("gaveUp");
    expect(standingOf(gaveUp)).toBe("Gave up | 0:15.5 | 5 steps");
    // The word alone: the stored code is not printed after it.
    expect(tileText(gaveUp)).not.toContain("gave_up");
    expect(detailOf(gaveUp)).toBeUndefined();
    // The track ends on the give-up, which it counts.
    expect(trackLabelOf(gaveUp)).toBe("5 steps: click, scroll, doubleClick, wasted, gave up");

    // A budget run out has its own word, not Gave up's.
    const overBudget = render(endedBy("budget_exceeded"));
    expect(standingOf(overBudget)).toBe("Over budget | 0:15.5 | 5 steps");
    expect(tileText(overBudget)).not.toContain("Gave up");
    expect(tileText(overBudget)).not.toContain("budget_exceeded");

    // A crash is the tool failing: its message, in fault.
    const error = render([...beforeEnd, failed]);
    expect(avatarStateOf(error, vera)).toBe("error");
    expect(standingOf(error)).toBe("Error | 0:15.5 | 5 steps");
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
      expect(finishLines(html), stream).toStrictEqual(["– Vera Gave up 0:15.5"]);
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
    expect(standingOf(html, ada)).toBe("Got through | 0:06.5 | 2 steps");
    expect(trackLabelOf(html, ada)).toBe("2 steps: click, scroll; got through, 1st");
    expect(tileOf(html, ada)).toMatch(/>1st</);

    expect(standingOf(html, kai)).toBe("Moving | 0:13.0 | 5 steps so far");
    expect(trackLabelOf(html, kai)).toBe(
      "5 steps so far: click, scroll, doubleClick, wasted, under way",
    );
    expect(tileOf(html, kai)).toContain('data-pip="now"');

    expect(standingOf(html, veraRace)).toBe("Gave up | 0:15.5 | 5 steps");
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
    expect(finishLines(html)).toStrictEqual(["1. Ada Got through 0:06.5", "– Vera Gave up 0:15.5"]);
  });
});

describe("around the lanes", () => {
  /** The "New race" button's start tag. */
  function newRace(html: string): Record<string, string> {
    const tag = html.match(/<button[^>]*>New race<\/button>/)?.[0];
    if (tag === undefined) throw new Error("no New race button");
    return attributesOf(tag);
  }

  test("New race waits until every run has ended or lost its stream, and says why while it waits", () => {
    const running = render(upTo(8));
    const waiting = newRace(running);
    expect(waiting).toHaveProperty("disabled");
    expect(waiting["data-variant"]).toBe("outline");
    expect(running).toMatch(
      new RegExp(
        `id="${waiting["aria-describedby"]}"[^>]*>New race opens once every run has ended: io keeps running them, and a new race would queue behind them\\.<`,
      ),
    );
    // What the race says never names the button's state.
    expect(lineOf(running).toLowerCase()).not.toContain("disabled");

    for (const [what, html] of [
      ["ended", render(runEventFixtures, "ended")],
      ["lost", render(upTo(8), "failed")],
    ] as const) {
      const open = newRace(html);
      expect(open, what).not.toHaveProperty("disabled");
      expect(open, what).not.toHaveProperty("aria-describedby");
      expect(lineOf(html), what).not.toContain("New race opens once");
    }
  });

  test("the goal strip: the preset's tag and the task id, the goal in quotes, its success in mono, and the seed", () => {
    const html = render([]);
    expect(hardTask.goal).toBe(GOAL);
    expect(html).toMatch(new RegExp(`<h2 [^>]*id="race-goal"[^>]*><q>${GOAL}</q></h2>`));
    const strip = html.slice(0, html.indexOf("<ol"));
    expect(lineOf(strip)).toMatch(/^Hard goal task_past-order /);
    expect(strip).toMatch(
      /<p class="[^"]*\bmono\b[^"]*">success · URL matches \*\*\/deliveries\/archive<\/p>/,
    );
    // The seed in a mono box, its word in ink-3.
    expect(strip).toMatch(
      /<span class="[^"]*\bmono\b[^"]*"><span class="text-ink-3">seed<\/span>424242<\/span>/,
    );
  });

  test("the finish order is the one live region, hidden from sight, and lists a run once it ends", () => {
    const running = render(upTo(18));
    expect(running.match(/aria-live=/g)).toHaveLength(1);
    expect(running).toMatch(/<ol [^>]*aria-live="polite"[^>]*><\/ol>/);
    expect(lineOf(running)).toContain("No run has ended yet");
    // The lanes show the places on their posts; the list is for screen readers.
    expect(running).toMatch(
      /<section [^>]*aria-labelledby="race-finish-order"[^>]*class="sr-only"[^>]*>\s*<h3 [^>]*id="race-finish-order"[^>]*>Finish order<\/h3>/,
    );

    const ended = render(runEventFixtures);
    expect(ended.match(/aria-live=/g)).toHaveLength(1);
    expect(finishLines(ended)).toStrictEqual(["– Vera Gave up 0:15.5"]);
    expect(lineOf(ended)).not.toContain("No run has ended yet");
  });

  test("the finish order numbers only the runs that got through, as their posts do: a give-up before them follows with no number", () => {
    // Vera gives up at 0:15.5, then Ada gets through at 0:20.0: her run is the fixture's, its end a
    // success 4.5 s later. Ada's post reads 1st, so the list must too, though Vera ended first.
    const ada: StartedRun = { id: "run_ada-hard-1", profileId: "prof_ada", seed: vera.seed };
    const adaEvents = eventsOf(ada, runEventFixtures, (event) =>
      event.type === "runFinished"
        ? {
            outcome: "success",
            timestamp: shifted(event.timestamp, 4500),
            durationMs: event.durationMs + 4500,
          }
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
    expect(standingOf(html)).toBe("Gave up | 0:15.5 | 5 steps");

    expect(finishLines(html)).toStrictEqual(["1. Ada Got through 0:20.0", "– Vera Gave up 0:15.5"]);
    expect(tileOf(html, ada)).toMatch(/>1st</);
    expect(trackLabelOf(html, ada)).toMatch(/; got through, 1st$/);
    expect(tileOf(html, vera)).not.toMatch(/>1st</);
  });
});
