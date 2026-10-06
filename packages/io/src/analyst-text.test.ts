import type { FindingType, Report } from "@wayford/core";
import { profileFixture, reportFixture, reportFixtures } from "@wayford/core/fixtures";
import { describe, expect, test } from "vitest";
import { reportText } from "./analyst-text.js";

const hard = reportFixture("task_past-order");
const easy = reportFixture("task_next-parcel");

const HEADINGS: Record<FindingType, string> = {
  measurement: "Measurement findings",
  deterministic: "Deterministic findings",
  hypothesis: "Hypotheses",
};

/** The text's blocks, as blank lines part them. */
const blocksOf = (text: string) => text.split("\n\n");

/** The finding blocks under a type's heading: indented, up to the next block that is not. */
function underHeading(text: string, type: FindingType): string[] {
  const blocks = blocksOf(text);
  const start = blocks.findIndex((block) => block.startsWith(HEADINGS[type]));
  expect(start, `heading for ${type}`).toBeGreaterThan(-1);
  const rest = blocks.slice(start + 1);
  const end = rest.findIndex((block) => !block.startsWith("  "));
  return end === -1 ? rest : rest.slice(0, end);
}

/** The one block holding this finding's title. */
function findingBlock(text: string, title: string): string {
  const found = blocksOf(text).filter((block) => block.includes(title));
  expect(found, title).toHaveLength(1);
  return found[0] ?? "";
}

/** A finding block's basis line. Its detail may say "soft" of a threshold, so only this line counts. */
const basisLine = (block: string) => block.split("\n").find((line) => line.startsWith("    basis"));

/** The persona table's rows, split into cells. */
function personaRows(text: string): string[][] {
  const table = blocksOf(text).find((block) => block.startsWith("persona"));
  expect(table).toBeDefined();
  return (table ?? "")
    .split("\n")
    .slice(1)
    .map((row) => row.trim().split(/\s{2,}/));
}

describe("the header", () => {
  test("names the task, backend, time, analyst model, run count and both costs", () => {
    const head = blocksOf(reportText(hard))[0];
    expect(head).toContain("task_past-order");
    expect(head).toContain("jev");
    expect(head).toContain("2026-10-05T14:20:31.000Z");
    expect(head).toContain("openai/gpt-6-luna");
    expect(head).toMatch(/^runs\s+9$/m);
    expect(head).toContain("0.001376 USD for the runs");
    expect(head).toContain("0.003529 USD for the Analyst");
  });
});

describe("Scout's line", () => {
  test("reached: the feature works, right after the header", () => {
    expect(blocksOf(reportText(hard))[1]).toBe(
      "Scout reached the goal in 2 steps: the feature works.",
    );
  });

  test("no file: no ground truth", () => {
    expect(blocksOf(reportText(easy))[1]).toBe("Scout: no ground truth.");
  });

  test("not reached: said, and the feature is not called working", () => {
    const report: Report = {
      ...hard,
      scout: {
        status: "notReached",
        attempts: 3,
        modelId: "openai/gpt-6-luna",
        recordedAt: "2026-10-03T12:00:00.000Z",
      },
    };
    const text = reportText(report);
    expect(blocksOf(text)[1]).toBe("Scout did not reach the goal in 3 attempts.");
    expect(text).not.toContain("the feature works");
  });

  test("a hand-written ground truth says so", () => {
    const report: Report = {
      ...hard,
      scout: {
        status: "reached",
        steps: 1,
        modelId: "hand",
        recordedAt: "2026-10-03T12:00:00.000Z",
      },
    };
    expect(blocksOf(reportText(report))[1]).toBe(
      "Scout reached the goal in 1 step: the feature works. This ground truth was written by hand, not recorded by a Scout run.",
    );
  });
});

describe("the persona rows", () => {
  test.each(reportFixtures)("one row per persona of $taskId, by label", (report) => {
    const rows = personaRows(reportText(report));
    expect(rows.map((cells) => cells[0])).toStrictEqual(
      report.personas.map((result) => profileFixture(result.profileId).label),
    );
  });

  test("runs, errors, got through, route open and median on the hard goal", () => {
    expect(personaRows(reportText(hard))).toStrictEqual([
      ["Ada", "3", "0", "3/3", "3/3", "10.4 s"],
      ["Kai", "3", "0", "1/3", "3/3", "31.6 s"],
      ["Vera", "3", "0", "0/3", "1/3", "—"],
    ]);
  });

  test("a null route-open count reads —, and an error run is kept out of got through", () => {
    expect(personaRows(reportText(easy))).toStrictEqual([
      ["Ada", "2", "0", "2/2", "—", "9.0 s"],
      ["Kai", "2", "0", "1/2", "—", "27.3 s"],
      ["Vera", "2", "1", "1/1", "—", "15.8 s"],
    ]);
  });

  test("a profile id with no bundled profile stands in for its label", () => {
    const [first, ...others] = hard.personas;
    const stranger = { ...first, profileId: "prof_stranger" } as Report["personas"][number];
    const report: Report = { ...hard, personas: [stranger, ...others], findings: [] };
    expect(personaRows(reportText(report))[0]?.[0]).toBe("prof_stranger");
  });
});

describe("the findings", () => {
  test.each(reportFixtures)("every finding of $taskId sits under its type's heading", (report) => {
    const text = reportText(report);
    for (const finding of report.findings) {
      const blocks = underHeading(text, finding.type);
      expect(blocks.some((block) => block.includes(finding.title))).toBe(true);
    }
  });

  test("the headings come in the order measurement, deterministic, hypothesis", () => {
    const text = reportText(hard);
    const at = (type: FindingType) => text.indexOf(`\n${HEADINGS[type]}`);
    expect(at("measurement")).toBeGreaterThan(-1);
    expect(at("measurement")).toBeLessThan(at("deterministic"));
    expect(at("deterministic")).toBeLessThan(at("hypothesis"));
  });

  test("a type with no finding says none", () => {
    expect(underHeading(reportText(easy), "measurement")).toStrictEqual(["  none"]);
  });

  test("Kai's A1 finding is soft, with its source", () => {
    const kai = hard.findings.find((finding) => finding.basis.some((b) => b.rule === "A1"));
    const block = findingBlock(reportText(hard), kai?.title ?? "missing");
    expect(basisLine(block)).toMatch(/^ {4}basis\s+A1 \(folk\); soft$/);
  });

  test("Vera's P1 finding is not soft, and names wcag22", () => {
    const vera = hard.findings.find(
      (finding) => finding.type === "deterministic" && finding.basis.some((b) => b.rule === "P1"),
    );
    const block = findingBlock(reportText(hard), vera?.title ?? "missing");
    expect(basisLine(block)).toMatch(/^ {4}basis\s+P1 \(wcag22\)$/);
  });

  test("a hypothesis is labelled as one, never as soft", () => {
    const text = reportText(hard);
    const heading = blocksOf(text).find((block) => block.startsWith(HEADINGS.hypothesis));
    expect(heading).toContain("not measured");
    const blocks = underHeading(text, "hypothesis");
    expect(blocks).toHaveLength(1);
    for (const block of blocks) {
      // Its basis is sourced (P1, wcag22), so only the type keeps it from being hard.
      expect(basisLine(block)).toMatch(/^ {4}basis\s+P1 \(wcag22\)$/);
    }
  });

  test.each(reportFixtures)(
    "each finding of $taskId shows its evidence, detail and recommendation",
    (report) => {
      const text = reportText(report);
      for (const finding of report.findings) {
        const block = findingBlock(text, finding.title);
        for (const ref of finding.evidence) expect(block).toContain(ref.runId);
        expect(block).toContain(finding.detail);
        expect(block).toContain(finding.recommendation);
      }
    },
  );

  test("evidence reads by run, each run's steps as ranges, runs in the order first cited", () => {
    const [first] = hard.findings;
    if (first === undefined) throw new Error("the hard-goal fixture holds no finding");
    const evidence = [
      { runId: "run_vera-past-order-2", stepIndex: 5 },
      { runId: "run_vera-past-order-2", stepIndex: 3 },
      { runId: "run_vera-past-order-2", stepIndex: 4 },
      { runId: "run_vera-past-order-3", stepIndex: 1 },
      { runId: "run_vera-past-order-2", stepIndex: 7 },
    ];
    const report = { ...hard, findings: [{ ...first, evidence }] };
    expect(findingBlock(reportText(report), first.title)).toContain(
      "evidence        run_vera-past-order-2 steps 3-5, 7; run_vera-past-order-3 step 1",
    );
  });

  test("a measurement shows its axe rule, and an empty basis reads none", () => {
    const measurement = hard.findings.find((finding) => finding.type === "measurement");
    const block = findingBlock(reportText(hard), measurement?.title ?? "missing");
    expect(block).toMatch(/^ {4}axe rule\s+color-contrast$/m);
    expect(block).toMatch(/^ {4}basis\s+none$/m);
  });
});

describe("what was left out", () => {
  test("the left-out counts", () => {
    expect(reportText(hard)).toContain(
      "Left out: 2 older runs of a persona and seed already read, 3 runs on llm, 0 sweep runs.",
    );
    expect(reportText(easy)).toContain(
      "Left out: 0 older runs of a persona and seed already read, 0 runs on llm, 0 sweep runs.",
    );
  });

  test("both unevidenced closures, with persona, route, element, page, rules and seeds", () => {
    const text = reportText(hard);
    expect(text).toContain(
      '  Vera, route B: button "More options" on /account, cut by P4 in 3 of 3 seeds',
    );
    expect(text).toContain(
      '  Vera, route C: link "Your data" on /settings, cut by P4 in 3 of 3 seeds',
    );
  });

  test("no unevidenced closure says none", () => {
    const blocks = blocksOf(reportText(easy).trimEnd());
    const closures = blocks.find((block) => block.startsWith("Routes the filter closed"));
    expect(closures?.split("\n").slice(1)).toStrictEqual(["  none"]);
  });

  test("the left-out counts and the closures come last, in that order", () => {
    const blocks = blocksOf(reportText(hard).trimEnd());
    expect(blocks.at(-2)).toMatch(/^Left out:/);
    expect(blocks.at(-1)).toMatch(/^Routes the filter closed/);
  });
});
