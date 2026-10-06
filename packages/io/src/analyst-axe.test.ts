import { startUrlFor, TARGET_APP_DEFAULTS } from "@wayford/agent";
import {
  type AxeScan,
  Finding,
  type FullObservation,
  type Profile,
  type RunResult,
  WayfordError,
} from "@wayford/core";
import {
  axeScanFixture,
  observationFixture,
  profileFixture,
  taskFixture,
} from "@wayford/core/fixtures";
import { TARGET_APP_DEFAULT_QUERY } from "@wayford/filter/serve-target-app";
import { describe, expect, test } from "vitest";
import { axeDrafts } from "./analyst-axe.js";
import { axeUrl } from "./axe.js";
import { capture, type FakeAxe, fakeAxe, quiet, storedRun } from "./test-app.js";

const ada = profileFixture("prof_ada");
const vera = profileFixture("prof_vera");

const TASK = taskFixture("task_past-order");
const APP = "http://localhost:5174";

/** A target-app page at the app's defaults, as an axe URL. */
const atDefaults = (path: string) => axeUrl(path, TARGET_APP_DEFAULT_QUERY);
const DELIVERIES = atDefaults("/deliveries");

/** The real scan of `/deliveries` at the defaults: one `color-contrast` violation. */
const deliveriesScan = axeScanFixture("/deliveries");
const [contrast] = deliveriesScan.violations;
if (contrast === undefined) throw new Error("the /deliveries fixture holds no violation");

/** The observation fixture, as if taken at `path` on `origin`. */
const on = (path: string, origin = APP): FullObservation => ({
  ...observationFixture,
  url: `${origin}${path}`,
});

/** A stored run of `profile` standing on `paths`, one step each, at the app's defaults. */
function runOn(profile: Profile, id: string, paths: string[], origin = APP): RunResult {
  return storedRun({
    profile,
    seed: 1,
    runId: id,
    steps: paths.map((path) => ({ observation: on(path, origin) })),
  });
}

/** `run`, started at `startUrl` instead: other app parameters, or another site. */
const startedAt = (run: RunResult, startUrl: string): RunResult => ({ ...run, startUrl });

function drafts(runs: RunResult[], axe: FakeAxe, logger = quiet) {
  return axeDrafts({ taskId: TASK.id, runs, axe, logger });
}

describe("axeDrafts: the pages asked", () => {
  test("each page once, at its run's parameters, in the order a step first stood on it", async () => {
    const axe = fakeAxe();
    await drafts(
      [
        runOn(vera, "run_vera-1", ["/settings", "/deliveries", "/settings"]),
        runOn(ada, "run_ada-1", ["/", "/deliveries", "/settings/data"]),
      ],
      axe,
    );
    expect(axe.asked).toEqual([
      atDefaults("/settings"),
      DELIVERIES,
      atDefaults("/"),
      atDefaults("/settings/data"),
    ]);
  });

  test("two runs at different parameters ask two URLs for one page", async () => {
    const contrast3 = startUrlFor(TASK, { ...TARGET_APP_DEFAULTS, contrast: 3 });
    const axe = fakeAxe();
    await drafts(
      [
        runOn(vera, "run_vera-1", ["/deliveries"]),
        startedAt(runOn(vera, "run_vera-2", ["/deliveries"]), contrast3),
      ],
      axe,
    );
    expect(axe.asked).toEqual([DELIVERIES, "/deliveries?contrast=3&fontPx=16&targetPx=36"]);
  });

  test("a page outside the target app is never asked", async () => {
    const axe = fakeAxe();
    await drafts([runOn(vera, "run_vera-1", ["/nope", "/deliveries", "/deliveries/nope"])], axe);
    expect(axe.asked).toEqual([DELIVERIES]);
  });

  test("a run whose start URL is a public site, standing on its /, asks nothing", async () => {
    const site = "https://example.com";
    const run = storedRun({
      profile: vera,
      seed: 1,
      runId: "run_vera-site",
      task: { ...TASK, startUrl: `${site}/` },
      steps: [{ observation: on("/", site) }, { observation: on("/deliveries", site) }],
    });
    // Every start URL carries the app's parameters, whatever the site.
    expect(new URL(run.startUrl).search).toBe(TARGET_APP_DEFAULT_QUERY);
    const axe = fakeAxe([deliveriesScan]);

    expect(await drafts([run], axe)).toEqual([]);
    expect(axe.asked).toEqual([]);
  });

  test("a step off its run's origin is not asked; a run served on 127.0.0.1 is", async () => {
    const local = "http://127.0.0.1:5174";
    const axe = fakeAxe();
    await drafts(
      [
        runOn(vera, "run_vera-1", ["/settings"], "http://localhost:4000"),
        startedAt(
          runOn(ada, "run_ada-1", ["/account"], local),
          `${local}/${TARGET_APP_DEFAULT_QUERY}`,
        ),
      ],
      axe,
    );
    expect(axe.asked).toEqual([atDefaults("/account")]);
  });
});

describe("axeDrafts: the drafts", () => {
  test("a violation on a page the runs stood on is one measurement, cited on each run's first step there", async () => {
    const runs = [
      runOn(vera, "run_vera-1", ["/", "/deliveries", "/deliveries"]),
      runOn(ada, "run_ada-1", ["/settings"]),
      runOn(ada, "run_ada-2", ["/deliveries", "/settings", "/deliveries"]),
    ];

    const [draft, ...rest] = await drafts(runs, fakeAxe([deliveriesScan]));

    expect(rest).toEqual([]);
    expect(draft?.finding).toEqual({
      id: expect.stringMatching(/^fnd_/),
      taskId: TASK.id,
      type: "measurement",
      axeRuleId: "color-contrast",
      title:
        "axe-core: Elements must meet minimum color contrast ratio thresholds (color-contrast) on /deliveries",
      detail:
        "axe-core 4.13.0 reports color-contrast on /deliveries, scanned on desktop at the app's ?contrast=2&fontPx=16&targetPx=36: 1 element, impact serious, WCAG tags wcag2aa, wcag143. 2 of the report's runs stood on the page.",
      evidence: [
        { runId: "run_vera-1", stepIndex: 1 },
        { runId: "run_ada-2", stepIndex: 0 },
      ],
      basis: [],
      personaIds: [],
    });
    expect(draft?.fallback).toBe(
      "Fix what axe-core's color-contrast rule reports on /deliveries: Elements must meet minimum color contrast ratio thresholds.",
    );
    expect(Finding.safeParse({ ...draft?.finding, recommendation: "x" }).success).toBe(true);
  });

  test("each violation is one draft, in the scan's order; a null impact reads impact not given", async () => {
    const scan: AxeScan = {
      ...deliveriesScan,
      violations: [
        contrast,
        {
          ruleId: "target-size",
          impact: null,
          tags: ["wcag22aa", "wcag258"],
          help: "All touch targets must be 24px large, or leave sufficient space",
          nodes: 3,
        },
      ],
    };

    const result = await drafts([runOn(vera, "run_vera-1", ["/deliveries"])], fakeAxe([scan]));

    expect(result.map((d) => d.finding.axeRuleId)).toEqual(["color-contrast", "target-size"]);
    expect(result[1]?.finding.detail).toBe(
      "axe-core 4.13.0 reports target-size on /deliveries, scanned on desktop at the app's ?contrast=2&fontPx=16&targetPx=36: 3 elements, impact not given, WCAG tags wcag22aa, wcag258. 1 of the report's runs stood on the page.",
    );
  });

  test("a violation on a page no run stood on gives none", async () => {
    const settingsData: AxeScan = { ...axeScanFixture("/settings/data"), violations: [contrast] };
    const axe = fakeAxe([settingsData]);

    expect(await drafts([runOn(vera, "run_vera-1", ["/deliveries"])], axe)).toEqual([]);
    expect(axe.asked).toEqual([DELIVERIES]);
  });

  test("a failed scan gives none for its page and a warning naming the page and code; the rest still count", async () => {
    const { lines, logger } = capture();
    const settings = atDefaults("/settings");
    const axe = fakeAxe([deliveriesScan], {
      [settings]: new WayfordError("target_app_unavailable", "the target app is down"),
    });

    const result = await drafts(
      [runOn(vera, "run_vera-1", ["/settings", "/deliveries"])],
      axe,
      logger,
    );

    expect(axe.asked).toEqual([settings, DELIVERIES]);
    expect(result.map((d) => d.finding.axeRuleId)).toEqual(["color-contrast"]);
    expect(lines).toMatchObject([{ url: settings, code: "target_app_unavailable" }]);
  });

  test("any other error is a bug, and propagates", async () => {
    const axe = fakeAxe([], { [DELIVERIES]: new Error("a bug in the lookup") });
    await expect(drafts([runOn(vera, "run_vera-1", ["/deliveries"])], axe)).rejects.toThrow(
      "a bug in the lookup",
    );
  });
});
