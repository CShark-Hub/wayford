/**
 * The RULES bound on the real filter (`docs/specs/2026-10-05-s4-05-sweep.md`, §7; `docs/RULES.md`,
 * the calibration row "Sweep on contrast"): `runSweep` for Vera on contrast at 2.0, 3.0 and 4.0, on
 * the real `runActor` against the served target app, with route-open from the real route walk.
 *
 * The fake Actor follows route A as the filter shows it. At each step it clicks the link whose name
 * matches the step's known name on every unmasked character, so a degraded link is followed and a
 * gone one is not; when none matches, it gives up. For Vera route-open is route A open, since P4
 * closes B and C, so at every value the successes must equal the route-open seeds. That is
 * stronger than "successes never above route-open", which a fake that never succeeds would pass.
 *
 * No test reaches a model or a network: `fetch` throws from the moment the app is up.
 */
import { llmActor, parseLlmSettings } from "@wayford/agent";
import { fakeLlm } from "@wayford/agent/fake";
import { type ActorResponse, type Seed, sweptProfile } from "@wayford/core";
import { profileFixture, targetAppJargon, taskFixture } from "@wayford/core/fixtures";
import { perceive } from "@wayford/filter/perceive";
import { routeOpenSeeds, routesFor, type WalkedRoute, walkRoutes } from "@wayford/filter/routes";
import {
  serveTargetApp,
  TARGET_APP_ROUTES,
  type TargetApp,
} from "@wayford/filter/serve-target-app";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { sharedBrowser, sharedChromium } from "./chromium.js";
import { loadRun } from "./db/runs.js";
import { loadSweep } from "./db/sweeps.js";
import { createRunner } from "./runner.js";
import { routeOpenFrom, runSweep } from "./sweep.js";
import { noBackend, quiet, runnerDefaults, type TempStore, tempStore } from "./test-app.js";

// The walk and the app's build take longer than vitest's 5 s hook default, and the sweep runs
// twelve runs, each recording, encoding and saving a video.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

// "fake" has no price in models.yaml, so no run here can build the real adapter by mistake.
const settings = parseLlmSettings({ LLM_API_KEY: "test-key", LLM_ACTOR_MODEL: "fake" });

const vera = profileFixture("prof_vera");
const task = taskFixture("task_past-order");
const routeA = TARGET_APP_ROUTES.find(({ id }) => id === "A");
if (routeA === undefined) throw new Error("the target app has no route A");

/** U+2592, filter's `MASK_GLYPH` (`mask.ts`), which no package entry exports. */
const MASK_GLYPH = "▒";

/** A page line of the observation text: its ref, role and quoted name. History lines start "- On". */
const PAGE_LINE = /^\[(e[1-9][0-9]*)\] (\S+) ("(?:[^"\\]|\\.)*") at /;

/**
 * True when `shown` can be `known` read through the mask: the same length in code points, and
 * every character equal or masked. A mask keeps the name's length (`docs/RULES.md`, "The mask").
 */
function reads(shown: string, known: string): boolean {
  const seen = [...shown];
  const real = [...known];
  return (
    seen.length === real.length && seen.every((char, i) => char === real[i] || char === MASK_GLYPH)
  );
}

/**
 * One answer along route A, read from the page it is shown: the step taken on the page's path,
 * clicked by the first link that reads as its name, or give up.
 */
function followRouteA(request: { messages: { content: string }[] }): ActorResponse {
  const lines = (request.messages[1]?.content ?? "").split("\n");
  // The page comes last in the turn, so its URL line is the last one.
  const url = lines.findLast((line) => line.startsWith("URL: "))?.slice("URL: ".length);
  const path = url === undefined ? undefined : new URL(url).pathname;
  const step = routeA?.steps.find(({ page }) => page === path);
  const giveUp: ActorResponse = { narration: "I cannot find it here.", action: { type: "giveUp" } };
  if (step === undefined) return giveUp;
  for (const line of lines) {
    const match = PAGE_LINE.exec(line);
    if (match?.[1] === undefined || match[2] !== step.role || match[3] === undefined) continue;
    if (reads(JSON.parse(match[3]), step.name)) {
      return { narration: `${step.name} looks right.`, action: { type: "click", ref: match[1] } };
    }
  }
  return giveUp;
}

let target: TargetApp;
let store: TempStore;
let routes: readonly WalkedRoute[];
/** Every browser the shared Chromium launched, so the test can close them. */
const browsers: Browser[] = [];

beforeAll(async () => {
  // Walked once, before `fetch` is stubbed: the walk builds and serves its own app.
  const [walks, served, temp] = await Promise.all([
    walkRoutes([vera.device]),
    serveTargetApp(),
    tempStore(),
  ]);
  target = served;
  store = temp;
  const walked = routesFor(walks, task.id, vera.device);
  if (walked === undefined) throw new Error(`${task.id} has no route table`);
  routes = walked;
  vi.stubGlobal("fetch", () => {
    throw new Error("a test reached for the network");
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await Promise.all(browsers.map((browser) => browser.close()));
  await store?.close();
  await target?.close();
});

/**
 * Up to two seeds from 1 to 30 where Vera at contrast 3.0 sees route A's last link, the hard link,
 * degraded, then up to two where it is gone, read from `perceive` on the walked page.
 */
function splitSeeds(): { degraded: Seed[]; gone: Seed[] } {
  const last = routes.find(({ id }) => id === "A")?.steps.at(-1);
  if (last === undefined) throw new Error("route A was not walked");
  const strict = sweptProfile(vera, "contrast", 3);
  const degraded: Seed[] = [];
  const gone: Seed[] = [];
  for (let seed = 1; seed <= 30; seed++) {
    const states = perceive(last.measurement, strict, seed, { jargon: targetAppJargon })
      .elements.filter(({ role, name }) => role === last.role && name === last.name)
      .map(({ state }) => state);
    // Never whole at 3.0 (`docs/RULES.md`, the route table): degraded or gone.
    expect(states, `seed ${seed}`).not.toContain("visible");
    if (states.includes("degraded")) {
      if (degraded.length < 2) degraded.push(seed);
    } else if (gone.length < 2) gone.push(seed);
  }
  return { degraded, gone };
}

test("Vera's contrast sweep succeeds on exactly the route-open seeds at every value, on the real filter", async () => {
  const { degraded, gone } = splitSeeds();
  // The seed split the bound needs: at 3.0 the hard link degraded on some and gone on others.
  expect(degraded.length).toBeGreaterThan(0);
  expect(gone.length).toBeGreaterThan(0);
  const seeds = [...degraded, ...gone].sort((a, b) => a - b);

  const routeOpen = routeOpenFrom(routes, targetAppJargon, routeOpenSeeds);
  // Route-open is route A open: P4 closes B and C at every value swept.
  for (const value of [2, 3, 4]) {
    const swept = sweptProfile(vera, "contrast", value);
    for (const { seed, open } of routeOpenSeeds(routes, swept, seeds, {
      jargon: targetAppJargon,
    })) {
      expect(open, `contrast ${value}, seed ${seed}`).toStrictEqual(open.length === 0 ? [] : ["A"]);
    }
  }
  expect(routeOpen(sweptProfile(vera, "contrast", 3), seeds)).toStrictEqual(degraded);

  const runner = createRunner({
    ...runnerDefaults(store),
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
      // A fresh fake per run, one answer per step the loop allows at most.
      llm: llmActor({
        settings,
        llm: () => fakeLlm({ actor: Array.from({ length: 20 }, () => followRouteA) }),
      }),
      jev: noBackend,
    },
  });
  const sweep = await runSweep(
    { db: store.db, runner, logger: quiet, routeOpen },
    {
      task: { ...task, startUrl: `${target.origin}/` },
      profile: vera,
      axis: "contrast",
      from: 2,
      to: 4,
      step: 1,
      seeds,
      backend: "llm",
    },
  );
  expect(await loadSweep(store.db, sweep.id)).toStrictEqual(sweep);

  expect(sweep.status).toBe("complete");
  expect(sweep.values.map(({ value }) => value)).toStrictEqual([2, 3, 4]);
  for (const row of sweep.values) {
    const at = `contrast ${row.value}`;
    expect(row.errors, at).toBe(0);
    expect(row.successes, at).toBe(row.routeOpenSeeds?.length);
    // Seed by seed, too: the runs that got through are the seeds the walk left a route open in.
    const runs = await Promise.all(row.runIds.map((id) => loadRun(store.db, id)));
    const through = runs.flatMap((run) => (run?.outcome === "success" ? [run.seed] : []));
    expect(through, at).toStrictEqual(row.routeOpenSeeds);
  }
  expect(sweep.values.find(({ value }) => value === 3)?.successes).toBeGreaterThan(0);
});
