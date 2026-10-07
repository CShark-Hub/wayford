/**
 * The runs API on the real `runActor` (`docs/specs/2026-10-02-s4-03-runs-api.md`, "Acceptance
 * mapping"): Ada on two seeds, started at once by one `POST /runs` on the easy goal, against the
 * served target app, through `sharedChromium` on a counting `launch`.
 *
 * No test reaches a model or a network. The Actor is `llmActor` on the fake adapter, and `fetch`
 * throws from the moment the app is up. The fake answers from the page it is shown, since a fake
 * built per run cannot know its persona: "Delivery address" when shown, else "Your account", else
 * give up.
 */
import { llmActor, parseLlmSettings } from "@wayford/agent";
import { fakeLlm } from "@wayford/agent/fake";
import { type ActorResponse, runResultFromEvents } from "@wayford/core";
import { taskFixture } from "@wayford/core/fixtures";
import {
  serveTargetApp,
  TARGET_APP_DEFAULT_QUERY,
  type TargetApp,
} from "@wayford/filter/serve-target-app";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { sharedBrowser, sharedChromium } from "./chromium.js";
import { saveTask } from "./db/tasks.js";
import type { StartedRun } from "./runner.js";
import { noBackend, postJson, readEvents, type TestApp, testApp } from "./test-app.js";

// Building the app and launching Chromium take longer than vitest's 5 s hook default, and each run
// records, encodes and saves a video.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// "fake" has no price in models.yaml, so no run here can build the real adapter by mistake.
const settings = parseLlmSettings({ LLM_API_KEY: "test-key", LLM_ACTOR_MODEL: "fake" });

/** A page line of the observation text, such as `[e3] link "Deliveries" at 410,25`. */
const PAGE_LINE = /^\[(e[1-9][0-9]*)\] (.*)$/;

/**
 * The ref of the first page line naming `link "<name>"` in the turn the request carries
 * (`messages[1]`), or `undefined` when the persona was not shown one. History lines start with
 * "- On", so only the page is searched.
 */
function linkRef(request: { messages: { content: string }[] }, name: string): string | undefined {
  const named = `link ${JSON.stringify(name)} at `;
  for (const line of (request.messages[1]?.content ?? "").split("\n")) {
    const match = PAGE_LINE.exec(line);
    if (match?.[1] !== undefined && match[2]?.startsWith(named)) return match[1];
  }
  return undefined;
}

/** One answer along the easy route, read from the page it is shown. */
function easyRoute(request: { messages: { content: string }[] }): ActorResponse {
  for (const name of ["Delivery address", "Your account"]) {
    const ref = linkRef(request, name);
    if (ref !== undefined)
      return { narration: `${name} looks right.`, action: { type: "click", ref } };
  }
  return { narration: "I cannot find it here.", action: { type: "giveUp" } };
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

let target: TargetApp;
let io: TestApp;
/** Every browser the shared Chromium launched, so the test can count them and close them. */
const browsers: Browser[] = [];

beforeAll(async () => {
  target = await serveTargetApp();
  io = await testApp({
    // The app served on a free port, so its runs get the parameters and the jargon list.
    targetAppOrigin: target.origin,
    run: sharedChromium(
      sharedBrowser(async () => {
        const browser = await chromium.launch();
        browsers.push(browser);
        return browser;
      }),
    ),
    backends: {
      // A fresh fake per run, so two runs at once never share a queue of answers.
      llm: llmActor({ settings, llm: () => fakeLlm({ actor: [easyRoute, easyRoute, easyRoute] }) }),
      // The request names no backend, so its runs take the default, `llm`.
      jev: noBackend,
    },
  });
  vi.stubGlobal("fetch", () => {
    throw new Error("a test reached for the network");
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await Promise.all(browsers.map((browser) => browser.close()));
  await io?.close();
  await target?.close();
});

test("two runs started together share one Chromium, end success and are stored as the fold of their streams", async () => {
  const task = { ...taskFixture("task_next-parcel"), startUrl: `${target.origin}/` };
  await saveTask(io.db, task);

  const { status, body } = await postJson(io.app, "/runs", {
    taskId: task.id,
    profileIds: ["prof_ada"],
    seeds: [7, 8],
  });
  expect(status).toBe(202);
  const runs: StartedRun[] = body.runs;
  expect(runs.map(({ profileId, seed }) => [profileId, seed])).toStrictEqual([
    ["prof_ada", 7],
    ["prof_ada", 8],
  ]);

  // Both streams at once, read to their ends.
  const streams = await Promise.all(
    runs.map(async ({ id }) => readEvents(await io.app.request(`/runs/${id}/events`))),
  );
  // One browser for runs that started together (F6 AC1).
  expect(browsers).toHaveLength(1);

  for (const [i, { id, seed }] of runs.entries()) {
    const events = streams[i]?.events ?? [];
    expect(events.every((event) => event.runId === id)).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "runFinished", outcome: "success" });

    const stored = await (await io.app.request(`/runs/${id}`)).json();
    expect(stored).toStrictEqual(runResultFromEvents(events));
    expect(stored).toMatchObject({ id, profileId: "prof_ada", seed, outcome: "success" });
    // On the served app's origin, so the runner handed the run the app's parameters.
    expect(stored.startUrl).toBe(`${target.origin}/${TARGET_APP_DEFAULT_QUERY}`);

    const video = await io.app.request(`/runs/${id}/video`);
    expect(video.status).toBe(200);
    expect(video.headers.get("content-type")).toBe("video/webm");
    expect(video.headers.get("content-disposition")).toContain(`ada-seed${seed}-${id}.webm`);
    expect((await video.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const shot = await io.app.request(`/runs/${id}/steps/0/screenshot`);
    expect(shot.status).toBe(200);
    expect(shot.headers.get("content-type")).toBe("image/png");
    expect([...new Uint8Array(await shot.arrayBuffer()).subarray(0, 8)]).toStrictEqual(
      PNG_SIGNATURE,
    );
  }
});
