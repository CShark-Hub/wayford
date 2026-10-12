/**
 * The io box of `tasks/s4-04-analyst.md` end to end, on the target app's own facts
 * (`docs/specs/2026-10-05-s4-04-analyst.md`, "Acceptance mapping", and decision log, "How the
 * acceptance test gets real decisions"). The target app is walked once, on the desktop Ada, Kai
 * and Vera use, and the report's route facts come from that walk through `routeFactsFrom`, as
 * `server.ts` gets them through `routeFacts`.
 *
 * The stored runs are fake but their observations are not: each step is `perceive` over the
 * walked page at the run's seed, so the evidence check reads the decisions a real run of that
 * persona and seed got. Each run of the set stands on `/` as loaded, then on `/deliveries` as
 * loaded (route A's two pages), and ends there: Ada's in `success`, Kai's and Vera's in `gave_up`.
 * No run opens `/account` or `/settings`, where Vera's routes B and C close. Beside the set, three
 * runs the report must leave out: a sweep run, an older run of a persona and seed in the set, and
 * a run on the LLM. The Analyst is a fake that recommends for every finding it is asked about and
 * writes one hypothesis on a real step.
 */
import type { CompleteRequest } from "@wayford/agent";
import { fakeLlm } from "@wayford/agent/fake";
import {
  type DeviceKind,
  decisionState,
  type Finding,
  type FullObservation,
  isHardFinding,
  type PageMeasurement,
  type Profile,
  type Report,
  type RunResult,
  type RunSweep,
} from "@wayford/core";
import { profileFixture, targetAppJargon } from "@wayford/core/fixtures";
import { perceive } from "@wayford/filter/perceive";
import { routeOpenSeeds, routesFor, type WalkedRoute, walkRoutes } from "@wayford/filter/routes";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";
import { routeFactsFrom } from "./analyst-routes.js";
import { saveRun } from "./db/runs.js";
import {
  FAKE_JEV_MODEL,
  FAKE_LLM_MODEL,
  getJson,
  postJson,
  storedRun,
  type TestApp,
  testApp,
} from "./test-app.js";

const TASK = "task_past-order";
const SEEDS = [1, 2, 3, 4];
const JARGON = { jargon: targetAppJargon };
const ada = profileFixture("prof_ada");
const kai = profileFixture("prof_kai");
const vera = profileFixture("prof_vera");
const PERSONAS = [ada, kai, vera];
/** Ada, Kai and Vera all use it, so the walk measures it alone. */
const DEVICE: DeviceKind = "desktop";
const SWEEP: RunSweep = { sweepId: "swp_vera-contrast", axis: "contrast", value: 3 };
/** The hypothesis the fake Analyst writes, on Vera's seed-1 step at `/deliveries`. */
const HYPOTHESIS_TITLE = "Vera's runs leave /deliveries without opening the archive";

let walks: Map<DeviceKind, WalkedRoute[]>;
let t: TestApp;
/** The run set the report should read, by persona and seed. */
let chosen: RunResult[];
/** The three runs it should leave out. */
let leftOut: RunResult[];
let report: Report;
let analystCalls: CompleteRequest<z.ZodObject>[];

/** A page as the walk measured it on the desktop, as loaded, with no control clicked first. */
function asLoaded(page: string): PageMeasurement {
  for (const route of walks.get(DEVICE) ?? []) {
    const step = route.steps.find((s) => s.page === page && s.after.length === 0);
    if (step) return step.measurement;
  }
  throw new Error(`the walk on ${DEVICE} measured no ${page} as loaded`);
}

/** The persona's observation of a walked page at `seed`, as a run of it gets it. */
const observe = (page: string, profile: Profile, seed: number): FullObservation =>
  perceive(asLoaded(page), profile, seed, JARGON);

/** A run of the set, or one beside it: `/` then `/deliveries`, on Jev unless `modelId` says. */
function run(
  profile: Profile,
  seed: number,
  id: string,
  options: { modelId?: string; sweep?: RunSweep } = {},
): RunResult {
  return storedRun({
    profile,
    seed,
    runId: id,
    modelId: options.modelId ?? FAKE_JEV_MODEL,
    ...(options.sweep === undefined ? {} : { sweep: options.sweep }),
    outcome: profile.id === ada.id ? "success" : "gave_up",
    steps: ["/", "/deliveries"].map((page) => ({ observation: observe(page, profile, seed) })),
  });
}

const idOf = (profile: Profile, seed: number) => `run_${profile.label.toLowerCase()}-${seed}`;

/** The draft keys the answer schema asks a recommendation for: one per deterministic finding. */
function draftKeys(request: CompleteRequest<z.ZodObject>): string[] {
  const recommendations = request.schema.shape.recommendations;
  if (!(recommendations instanceof z.ZodObject)) {
    throw new Error("the answer schema has no recommendations object");
  }
  return Object.keys(recommendations.shape);
}

beforeAll(async () => {
  walks = await walkRoutes([DEVICE]);
}, 120_000);

beforeAll(async () => {
  const fake = fakeLlm({
    analyst: [
      (request: CompleteRequest<z.ZodObject>) => ({
        recommendations: Object.fromEntries(
          draftKeys(request).map((key) => [key, `Recommendation ${key}.`]),
        ),
        hypotheses: [
          {
            title: HYPOTHESIS_TITLE,
            detail: "Each of her runs scrolls /deliveries and gives up there.",
            recommendation: "Make the link to past orders easier to see.",
            evidence: [{ runId: idOf(vera, 1), stepIndex: 1 }],
            rules: ["P1"],
          },
        ],
      }),
    ],
  });
  analystCalls = fake.calls;
  t = await testApp({
    llm: fake,
    routes: routeFactsFrom(walks, targetAppJargon),
  });

  chosen = PERSONAS.flatMap((profile) =>
    SEEDS.map((seed) => run(profile, seed, idOf(profile, seed))),
  );
  leftOut = [
    run(vera, 1, "run_vera-sweep-1", { sweep: SWEEP }),
    run(kai, 2, "run_kai-older-2"),
    run(ada, 3, "run_ada-llm-3", { modelId: FAKE_LLM_MODEL }),
  ];
  // Started in this order, a second apart: the older Kai run first, so the set's Kai seed 2 is the
  // latest of its persona and seed; the sweep and LLM runs last, the newest of all.
  const [sweep, older, other] = leftOut as [RunResult, RunResult, RunResult];
  for (const [i, stored] of [older, ...chosen, sweep, other].entries()) {
    await saveRun(t.db, stored, new Date(Date.UTC(2026, 9, 5, 12, 0, i)).toISOString());
  }

  const { status, body } = await postJson(t.app, `/reports/${TASK}`, {});
  expect(status).toBe(201);
  report = body;
}, 30_000);

afterAll(async () => {
  await t?.close();
});

/** The route facts of the desktop walk, independently of the report. */
function openSeeds(profile: Profile) {
  const routes = routesFor(walks, TASK, DEVICE);
  if (routes === undefined) throw new Error(`${TASK} has no route table`);
  return routeOpenSeeds(routes, profile, SEEDS, JARGON);
}

const deterministic = (profile: Profile): Finding[] =>
  report.findings.filter((f) => f.type === "deterministic" && f.personaIds.includes(profile.id));

/** The seeds where the filter cut Vera's "Order archive" on `/deliveries` with P1. */
function veraCutSeeds(): number[] {
  return SEEDS.filter((seed) => {
    const link = observe("/deliveries", vera, seed).elements.find(
      (e) => e.role === "link" && e.name === "Order archive",
    );
    return (
      link?.state === "invisible" &&
      link.decisions.some((d) => d.rule === "P1" && decisionState(d) === "invisible")
    );
  });
}

describe("the report on the hard goal, over Ada, Kai and Vera on seeds 1 to 4", () => {
  test("one Analyst call, over the set and none of the runs left out", () => {
    expect(analystCalls.map((call) => call.role)).toStrictEqual(["analyst"]);
    const message = analystCalls[0]?.messages[1]?.content ?? "";
    for (const r of chosen) expect(message).toContain(r.id);
    for (const r of leftOut) expect(message).not.toContain(r.id);
  });

  test("the numbers are the stored runs' and routeOpenSeeds'", () => {
    expect(report.backend).toBe("jev");
    expect(report.runCount).toBe(chosen.length);
    expect(report.personas.map((p) => p.profileId)).toStrictEqual(PERSONAS.map((p) => p.id));
    for (const profile of PERSONAS) {
      const runs = chosen.filter((r) => r.profileId === profile.id);
      const open = openSeeds(profile);
      const result = report.personas.find((p) => p.profileId === profile.id);
      expect(result, profile.label).toMatchObject({
        runs: runs.length,
        successes: runs.filter((r) => r.outcome === "success").length,
        errors: runs.filter((r) => r.outcome === "error").length,
        routeOpenSeeds: open.filter((seed) => seed.open.length > 0).length,
      });
      expect(result?.seeds, profile.label).toStrictEqual(
        runs.map((r) => ({
          seed: r.seed,
          runId: r.id,
          outcome: r.outcome,
          openRoutes: open.find((seed) => seed.seed === r.seed)?.open,
        })),
      );
    }
    // Not vacuous: Ada got through every time, the others never; Ada and Kai always kept a route.
    expect(report.personas.map((p) => [p.successes, p.routeOpenSeeds])).toMatchObject([
      [4, 4],
      [0, 4],
      [0, expect.any(Number)],
    ]);
  });

  test("Vera's closure of route A is a P1 finding with wcag22 and her /deliveries steps", () => {
    const cut = veraCutSeeds();
    // Not vacuous: P1 cuts the link in at least one of her four seeds.
    expect(cut.length).toBeGreaterThan(0);
    const findings = deterministic(vera);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      title: `Vera, ${cut.length} of 4 seeds: the link "Order archive" on /deliveries is cut by P1`,
      basis: [{ rule: "P1", provenance: "wcag22" }],
      personaIds: [vera.id],
      recommendation: expect.stringMatching(/^Recommendation d\d+\.$/),
    });
    // Exactly the `/deliveries` step of each of her runs whose seed cut the link.
    expect(findings[0]?.evidence).toStrictEqual(
      cut.map((seed) => ({ runId: idOf(vera, seed), stepIndex: 1 })),
    );
    expect(findings[0] && isHardFinding(findings[0])).toBe(true);
  });

  test("Kai's closure of route A is an A1 finding, folk and so soft; Ada has none", () => {
    const [finding, ...more] = deterministic(kai);
    expect(more).toStrictEqual([]);
    expect(finding).toMatchObject({
      title: 'Kai, 4 of 4 seeds: the link "Order archive" on /deliveries is cut by A1',
      basis: [{ rule: "A1", provenance: "folk" }],
      evidence: SEEDS.map((seed) => ({ runId: idOf(kai, seed), stepIndex: 1 })),
    });
    expect(finding && isHardFinding(finding)).toBe(false);
    expect(deterministic(ada)).toStrictEqual([]);
  });

  test("Vera's routes B and C close where no run of hers stood: listed, no finding", () => {
    // Her runs stood on `/` and `/deliveries` only.
    const pages = chosen
      .filter((r) => r.profileId === vera.id)
      .flatMap((r) => r.steps.map((step) => new URL(step.urlBefore).pathname));
    expect(new Set(pages)).toStrictEqual(new Set(["/", "/deliveries"]));

    expect(report.unevidencedClosures).toStrictEqual([
      {
        profileId: vera.id,
        routeId: "B",
        page: "/account",
        role: "button",
        name: "More options",
        rules: ["P4"],
        seeds: 4,
      },
      {
        profileId: vera.id,
        routeId: "C",
        page: "/settings",
        role: "link",
        name: "Your data",
        rules: ["P4"],
        seeds: 4,
      },
    ]);
    for (const finding of report.findings) {
      expect(finding.title).not.toMatch(/More options|Your data|\/account|\/settings/);
    }
  });

  test("the hypothesis on a real step is kept, its persona and provenance from the profiles", () => {
    expect(report.findings.filter((f) => f.type === "hypothesis")).toMatchObject([
      {
        title: HYPOTHESIS_TITLE,
        evidence: [{ runId: idOf(vera, 1), stepIndex: 1 }],
        personaIds: [vera.id],
        basis: [{ rule: "P1", provenance: "wcag22" }],
      },
    ]);
  });

  test("the sweep run, the older run and the run on the LLM are left out and counted", () => {
    expect(report.leftOut).toStrictEqual({ olderRuns: 1, otherBackend: 1, sweepRuns: 1 });
    const read = new Set(report.personas.flatMap((p) => p.seeds.map((s) => s.runId)));
    expect(read).toStrictEqual(new Set(chosen.map((r) => r.id)));
  });

  test("GET returns the stored report", async () => {
    expect(await getJson(t.app, `/reports/${TASK}`)).toStrictEqual({ status: 200, body: report });
  });
});
