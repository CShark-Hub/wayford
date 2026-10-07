import { startUrlFor, TARGET_APP_DEFAULTS } from "@wayford/agent";
import {
  type AxeScan,
  type AxeViolation,
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
import type { AxeLookup } from "./axe.js";
import { targetAppPage } from "./page-ref.js";
import { capture, fakeAxe, quiet, storedRun } from "./test-app.js";

const ada = profileFixture("prof_ada");
const vera = profileFixture("prof_vera");

const TASK = taskFixture("task_past-order");
const APP = "http://localhost:5174";

/** A target-app page at the app's defaults on `origin`, by its whole URL: the key it is asked by. */
const atDefaults = (path: string, origin = APP) =>
  targetAppPage(origin, path, TARGET_APP_DEFAULT_QUERY).url;
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

/** `scan` keyed by `url` instead, with `violations` in place of its own. */
const scanOf = (url: string, violations: AxeScan["violations"]): AxeScan => ({
  ...deliveriesScan,
  url,
  violations,
});

function drafts(runs: RunResult[], axe: AxeLookup, logger = quiet, targetAppOrigin = APP) {
  return axeDrafts({ taskId: TASK.id, runs, axe, targetAppOrigin, logger });
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
    expect(axe.asked).toEqual([
      DELIVERIES,
      "http://localhost:5174/deliveries?contrast=3&fontPx=16&targetPx=36",
    ]);
  });

  test("on a target-app run, a page outside the app's paths is never asked", async () => {
    const axe = fakeAxe();
    await drafts([runOn(vera, "run_vera-1", ["/nope", "/deliveries", "/deliveries/nope"])], axe);
    expect(axe.asked).toEqual([DELIVERIES]);
  });

  test("on a target-app run, a step off the app's origin is not asked", async () => {
    const run = storedRun({
      profile: vera,
      seed: 1,
      runId: "run_vera-1",
      steps: [
        { observation: on("/settings", "http://localhost:4000") },
        { observation: on("/deliveries") },
      ],
    });
    const axe = fakeAxe();
    await drafts([run], axe);
    expect(axe.asked).toEqual([DELIVERIES]);
  });

  test("a run on the origin handed in is on the target app, whatever its host and port", async () => {
    const served = "http://127.0.0.1:41234";
    const axe = fakeAxe();
    await drafts(
      [
        startedAt(
          runOn(ada, "run_ada-1", ["/account"], served),
          `${served}/${TARGET_APP_DEFAULT_QUERY}`,
        ),
      ],
      axe,
      quiet,
      served,
    );
    expect(axe.pages).toEqual([{ url: atDefaults("/account", served), onTargetApp: true }]);
  });

  test("a run on 127.0.0.1 or on another port of localhost is on another site: its pages are asked as it stood on them", async () => {
    const axe = fakeAxe();
    await drafts(
      [
        startedAt(
          runOn(vera, "run_vera-1", ["/settings"], "http://localhost:4000"),
          "http://localhost:4000/",
        ),
        startedAt(
          runOn(ada, "run_ada-1", ["/account"], "http://127.0.0.1:5174"),
          `http://127.0.0.1:5174/${TARGET_APP_DEFAULT_QUERY}`,
        ),
      ],
      axe,
    );
    expect(axe.pages).toEqual([
      { url: "http://localhost:4000/settings", onTargetApp: false },
      { url: "http://127.0.0.1:5174/account", onTargetApp: false },
    ]);
  });

  test("a run whose start URL is a public site asks its own pages, never the target app's", async () => {
    const site = "https://example.com";
    const run = storedRun({
      profile: vera,
      seed: 1,
      runId: "run_vera-site",
      task: { ...TASK, startUrl: `${site}/` },
      steps: [{ observation: on("/", site) }, { observation: on("/deliveries", site) }],
    });
    // Every stored run's start URL carries the app's parameters, and still this is another site.
    expect(new URL(run.startUrl).search).toBe(TARGET_APP_DEFAULT_QUERY);
    const axe = fakeAxe([deliveriesScan]);

    expect(await drafts([run], axe)).toEqual([]);
    expect(axe.asked).toEqual([`${site}/`, `${site}/deliveries`]);
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

describe("axeDrafts: off the target app", () => {
  const SITE = "https://example.com";

  /** A run of `profile` started at `SITE`, standing on `paths` there, one step each. */
  const onSite = (profile: Profile, id: string, paths: string[]) =>
    startedAt(runOn(profile, id, paths, SITE), `${SITE}/`);

  test("a run on an app on localhost:<another port> cites none of the target app's violations, and its own", async () => {
    const other = "http://localhost:8080";
    const imageAlt: AxeViolation = {
      ruleId: "image-alt",
      impact: "critical",
      tags: ["wcag2a", "wcag111"],
      help: "Images must have alternative text",
      nodes: 2,
    };
    const axe = fakeAxe([deliveriesScan, scanOf(`${other}/deliveries`, [imageAlt])]);
    const runs = [
      startedAt(runOn(vera, "run_vera-1", ["/deliveries", "/deliveries"], other), `${other}/`),
      startedAt(runOn(ada, "run_ada-1", ["/deliveries"], other), `${other}/`),
    ];

    const result = await drafts(runs, axe);

    expect(axe.pages).toEqual([{ url: `${other}/deliveries`, onTargetApp: false }]);
    expect(result).toEqual([
      {
        finding: {
          id: expect.stringMatching(/^fnd_/),
          taskId: TASK.id,
          type: "measurement",
          axeRuleId: "image-alt",
          title:
            "axe-core: Images must have alternative text (image-alt) on http://localhost:8080/deliveries",
          detail:
            "axe-core 4.13.0 reports image-alt on http://localhost:8080/deliveries, scanned on desktop: 2 elements, impact critical, WCAG tags wcag2a, wcag111. 2 of the report's runs stood on the page.",
          evidence: [
            { runId: "run_vera-1", stepIndex: 0 },
            { runId: "run_ada-1", stepIndex: 0 },
          ],
          basis: [],
          personaIds: [],
        },
        fallback:
          "Fix what axe-core's image-alt rule reports on http://localhost:8080/deliveries: Images must have alternative text.",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("app's");
  });

  test("a page is a step's page on any origin, without its hash", async () => {
    const www = "https://www.example.com";
    // The start URL redirected to `www.`, whose pages are still the run's.
    const run = storedRun({
      profile: vera,
      seed: 1,
      runId: "run_vera-site",
      task: { ...TASK, startUrl: `${SITE}/` },
      steps: ["/#main", "/docs#intro", "/", "/docs#usage", "/"].map((path) => ({
        observation: on(path, www),
      })),
    });
    const axe = fakeAxe([scanOf(`${www}/docs`, [contrast])]);

    const result = await drafts([run], axe);

    expect(axe.asked).toEqual([`${www}/`, `${www}/docs`]);
    expect(result).toMatchObject([
      {
        finding: {
          title: `axe-core: ${contrast.help} (color-contrast) on ${www}/docs`,
          evidence: [{ runId: "run_vera-site", stepIndex: 1 }],
        },
      },
    ]);
  });

  test("a report over runs on more than ten foreign pages scans ten: those the most runs stood on, in the order first stood on", async () => {
    const page = (n: number) => `${SITE}/page-${n}`;
    const all = Array.from({ length: 12 }, (_, i) => `/page-${i + 1}`);
    // Every page stood on by two runs, but for /page-2 and /page-5, by one.
    const runs = [
      onSite(vera, "run_vera-1", all),
      onSite(
        ada,
        "run_ada-1",
        all.filter((path) => path !== "/page-2" && path !== "/page-5"),
      ),
    ];
    const { lines, logger } = capture();
    const axe = fakeAxe([
      scanOf(page(12), [contrast]),
      scanOf(page(2), [contrast]),
      scanOf(page(1), [contrast]),
    ]);

    const result = await drafts(runs, axe, logger);

    expect(axe.asked).toEqual([1, 3, 4, 6, 7, 8, 9, 10, 11, 12].map(page));
    expect(result.map((d) => d.finding.title)).toEqual([
      `axe-core: ${contrast.help} (color-contrast) on ${page(1)}`,
      `axe-core: ${contrast.help} (color-contrast) on ${page(12)}`,
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      skipped: [
        { url: page(2), runs: 1 },
        { url: page(5), runs: 1 },
      ],
      msg: expect.stringContaining("these give no axe finding"),
    });
  });

  test("a tie at the cut goes to the page stood on first", async () => {
    // Eleven pages, one run each, stood on from /k down to /a: by URL, /k would be the one left out.
    const paths = [..."kjihgfedcba"].map((letter) => `/${letter}`);
    const { lines, logger } = capture();
    const axe = fakeAxe();

    await drafts([onSite(vera, "run_vera-1", paths)], axe, logger);

    expect(axe.asked).toEqual(paths.slice(0, 10).map((path) => `${SITE}${path}`));
    expect(lines).toMatchObject([{ skipped: [{ url: `${SITE}/a`, runs: 1 }] }]);
  });

  test("ten foreign pages or fewer are all asked, with no warning", async () => {
    const paths = Array.from({ length: 10 }, (_, i) => `/page-${i + 1}`);
    const { lines, logger } = capture();
    const axe = fakeAxe();

    await drafts([onSite(vera, "run_vera-1", paths)], axe, logger);

    expect(axe.asked).toHaveLength(10);
    expect(lines).toEqual([]);
  });
});
