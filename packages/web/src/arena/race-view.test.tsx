import { RunEvent, runResultFromEvents } from "@wayford/core";
import { profileFixture, profileFixtures, runEventFixtures } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { StreamStatus } from "../api/run-events.js";
import { type StartedRun, screenshotUrl } from "../api/runs.js";
import { personaColour } from "../avatar/parts.js";
import { attributesOf, detailsOf, lineOf, styleOf } from "../preview/rendered-markup.js";
import { STUCK_STEPS } from "./avatar-state.js";
import {
  avatarStateOf,
  beforeEnd,
  failed,
  finished,
  fixtureEvent,
  GOAL,
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

/** Vera's race of one, after `events`, her stream at `stream`. */
function render(events: readonly RunEvent[], stream: StreamStatus = "open"): string {
  const snapshot: RaceSnapshot = {
    events: new Map([[vera.id, events]]),
    streams: new Map([[vera.id, stream]]),
  };
  return renderToStaticMarkup(
    <RaceView
      goal={GOAL}
      seed={vera.seed}
      runs={[vera]}
      snapshot={snapshot}
      profiles={profileFixtures}
      onNewRace={() => {}}
    />,
  );
}

/** The finish order list's entries, each on one line. */
function finishLines(html: string): string[] {
  const list = html.match(/<ol [^>]*aria-live="polite"[^>]*>(.*?)<\/ol>/s)?.[1] ?? "";
  return [...list.matchAll(/<li(?:\s[^>]*)?>(.*?)<\/li>/gs)].map(([, item]) => lineOf(item ?? ""));
}

/** The attributes of the `<svg>` in Vera's tile: her avatar. */
function avatarOf(html: string): Record<string, string> {
  return attributesOf(tileOf(html, vera).match(/<svg[^>]*>/)?.[0] ?? "");
}

/** What Vera's tile says, on one line. */
function tileText(html: string): string {
  return lineOf(tileOf(html, vera));
}

/** Vera's tile's narration line, which must be there even when it is empty. */
function narrationOf(html: string): string {
  const details = detailsOf(tileOf(html, vera));
  expect(details).toHaveProperty("Narration");
  return details.Narration ?? "";
}

/** `text` in the quotes the tile sets a narration line in. */
function quoted(text: string): string {
  return `“${text}”`;
}

describe("runView folds a run's events so far into what its tile shows", () => {
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

describe("a tile's narration line follows the latest narration event of its run", () => {
  test("Vera's line: empty, then the first narration after event 2, the second after 6, the last after 16", () => {
    // At every prefix: the line holds the latest narration so far, and nothing before the first.
    // Each narration shows from its own event on: 2, 6, 10 and 16.
    const lines = runEventFixtures.map((_, i) => narrationOf(render(upTo(i))));
    expect(lines).toStrictEqual([
      ...Array(2).fill(""),
      ...Array(4).fill(quoted(narrationAt(2))),
      ...Array(4).fill(quoted(narrationAt(6))),
      ...Array(6).fill(quoted(narrationAt(10))),
      ...Array(4).fill(quoted(narrationAt(16))),
    ]);
  });

  test("a run with no narration event, as a Jev run: the label and an empty line", () => {
    const jevRun = RunEvent.array().parse(
      runEventFixtures.filter((event) => event.type !== "narration"),
    );
    // Still a whole run: it folds, and only the narration is gone.
    expect(runResultFromEvents(jevRun).steps.every((step) => step.narration === "")).toBe(true);
    const html = render(jevRun);
    expect(narrationOf(html)).toBe("");
    expect(tileOf(html, vera)).toMatch(/<dt[^>]*>Narration<\/dt>\s*<dd[^>]*><\/dd>/);
    expect(runView(jevRun).narration).toBeUndefined();
  });
});

describe("the state in words, with what grounds it", () => {
  test("idle is waiting, an action makes it moving", () => {
    expect(avatarStateOf(render(upTo(3)), vera)).toBe("idle");
    expect(tileText(render(upTo(3)))).toContain("Waiting");
    expect(avatarStateOf(render(upTo(4)), vera)).toBe("moving");
    expect(tileText(render(upTo(4)))).toContain("Moving");
  });

  test("stuck names what the rule counted: the last 2 steps and the page they left as it was", () => {
    expect(STUCK_STEPS).toBe(2);
    // Vera's variant, after step 5's observation: steps 3 and 4 both left /settings as it was.
    const stuck = stuckRun.slice(0, 18);
    expect(runView(stuck).stuckOn).toBe("/settings");
    const html = render(stuck);
    expect(avatarStateOf(html, vera)).toBe("stuck");
    expect(tileText(html)).toContain("Stuck: the last 2 steps left /settings as it was");
    expect(tileOf(html, vera)).toContain('<span class="font-mono">/settings</span>');
  });

  test("an ended run: done, gave up with its stored outcome, error with its message", () => {
    const done = render(endedBy("success"));
    expect(avatarStateOf(done, vera)).toBe("done");
    expect(tileText(done)).toContain("Done");

    const gaveUp = render(runEventFixtures);
    expect(avatarStateOf(gaveUp, vera)).toBe("gaveUp");
    expect(tileText(gaveUp)).toContain("Gave up: gave_up");
    expect(tileOf(gaveUp, vera)).toContain('<span class="font-mono">gave_up</span>');
    expect(tileText(render(endedBy("budget_exceeded")))).toContain("Gave up: budget_exceeded");

    const error = render([...beforeEnd, failed]);
    expect(avatarStateOf(error, vera)).toBe("error");
    expect(tileText(error)).toContain("Error: Target page, context or browser has been closed");
    expect(tileText(error)).not.toContain("Gave up");
  });

  test("a stream lost mid-run: what was last seen, the avatar plain and dimmed, listed with no place", () => {
    for (const [index, seen] of [
      [3, "waiting"],
      [8, "moving"],
    ] as const) {
      const html = render(upTo(index), "failed");
      expect(tileText(html), `after event ${index}`).toContain(`Stream lost: last seen ${seen}`);
      // No live state: no `data-state`, no badge, no state in the avatar's title.
      expect(avatarOf(html)).not.toHaveProperty("data-state");
      expect(avatarOf(html).class).toContain("opacity-50");
      expect(tileOf(html, vera)).not.toContain('data-part="state"');
      expect(tileText(html)).not.toContain("Run state");
      expect(finishLines(html)).toStrictEqual(["– Vera Stream lost"]);
    }
    // The same events on an open stream: live, and nothing lost.
    const open = render(upTo(8), "open");
    expect(avatarStateOf(open, vera)).toBe("moving");
    expect(avatarOf(open).class).not.toContain("opacity-50");
    expect(tileText(open)).not.toContain("Stream lost");
    expect(finishLines(open)).toStrictEqual([]);
  });

  test("a stream that failed after the run's end still shows the end, ranked", () => {
    for (const stream of ["failed", "ended"] as const) {
      const html = render(runEventFixtures, stream);
      expect(avatarStateOf(html, vera), stream).toBe("gaveUp");
      expect(tileText(html), stream).toContain("Gave up: gave_up");
      expect(lineOf(html), stream).not.toContain("Stream lost");
      expect(finishLines(html), stream).toStrictEqual(["1. Vera Gave up 15.5 s"]);
    }
  });
});

describe("the tile", () => {
  test("is an article its heading names, the persona's colour on top and her avatar inside", () => {
    const html = render(upTo(4));
    const start = html.match(/<article [^>]*>/)?.[0] ?? "";
    const attributes = attributesOf(start);
    expect(attributes["aria-labelledby"]).toBe("race-run_vera-hard-1");
    expect(html).toMatch(/<h3 [^>]*id="race-run_vera-hard-1"[^>]*>Vera<\/h3>/);
    expect(styleOf(attributes)["border-top-color"]).toBe(
      personaColour(profileFixture("prof_vera")),
    );
    expect(tileOf(html, vera)).toContain("<svg");
  });

  test("elapsed time from the timestamps, a dash before runStarted", () => {
    expect(detailsOf(tileOf(render([]), vera)).Elapsed).toBe("—");
    expect(detailsOf(tileOf(render(upTo(4)), vera)).Elapsed).toBe("3 s");
    expect(detailsOf(tileOf(render(runEventFixtures), vera)).Elapsed).toBe("15.5 s");
  });

  test("the latest step's screenshot, served by io, or a line that there is none yet", () => {
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

describe("around the tiles", () => {
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

  test("a heading with the goal, and the seed in monospace", () => {
    const html = render([]);
    expect(html).toMatch(new RegExp(`<h2 [^>]*>${GOAL}</h2>`));
    expect(html).toContain('<span class="font-mono">424242</span>');
  });

  test("the finish order is the one live region, and lists a run once it ends", () => {
    const running = render(upTo(18));
    expect(running.match(/aria-live=/g)).toHaveLength(1);
    expect(running).toMatch(/<ol [^>]*aria-live="polite"[^>]*><\/ol>/);
    expect(lineOf(running)).toContain("No run has ended yet");

    const ended = render(runEventFixtures);
    expect(ended.match(/aria-live=/g)).toHaveLength(1);
    const list = ended.match(/<ol [^>]*aria-live="polite"[^>]*>(.*?)<\/ol>/s)?.[1] ?? "";
    expect(lineOf(list)).toBe("1. Vera Gave up 15.5 s");
    expect(lineOf(ended)).not.toContain("No run has ended yet");
  });
});
