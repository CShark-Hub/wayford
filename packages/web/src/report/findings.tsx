/**
 * The report's findings in three groups side by side (`docs/PLAN.md` F8 AC1): measurement, the
 * page as axe measured it; deterministic, what the filter decided in code; hypothesis, what was
 * read from the runs. Each group is headed by its certainty glyph (`docs/DESIGN.md`, Principle 3),
 * and keeps the report's order within it. A finding keeps its group whatever its basis: soft only
 * marks it (`FindingCard`).
 *
 * With a persona picked, a group keeps that persona's findings and every measurement, since a
 * measurement holds for whoever is looking, and its count reads "N of M", so nothing left out is
 * hidden. A finding's evidence leads with that persona's runs.
 */
import type { Finding, FindingType, ProfileId, Report, RunId } from "@wayford/core";
import { CertaintyGlyph, type CertaintyLine } from "../components/certainty.js";
import { type CitedRun, FindingCard } from "../components/finding.js";
import { personaLabel } from "../runs/task-results.js";

/** Each group's glyph, name and what it is, in the order the columns run. */
const GROUPS: { type: FindingType; line: CertaintyLine; name: string; what: string }[] = [
  { type: "measurement", line: "measured", name: "Measurement", what: "the page, by axe" },
  {
    type: "deterministic",
    line: "deterministic",
    name: "Deterministic",
    what: "the filter, in code",
  },
  { type: "hypothesis", line: "hypothesis", name: "Hypothesis", what: "read from the runs" },
];

/** Whether `finding` stays in view with `persona` picked: theirs, or a measurement. */
function kept(finding: Finding, persona: ProfileId | undefined): boolean {
  return (
    persona === undefined || finding.type === "measurement" || finding.personaIds.includes(persona)
  );
}

/** One group: its heading and its cards, or a line saying it has none. */
function Group({
  line,
  name,
  what,
  findings,
  total,
  persona,
  runOf,
}: {
  line: CertaintyLine;
  name: string;
  what: string;
  /** The group's findings in view. */
  findings: readonly Finding[];
  /** How many the group holds unfiltered. */
  total: number;
  persona: ProfileId | undefined;
  runOf: (runId: RunId) => CitedRun;
}) {
  const id = `findings-${line}`;
  const count = persona === undefined ? `${total}` : `${findings.length} of ${total}`;
  return (
    <section aria-labelledby={id} className="grid content-start gap-(--space-3)">
      <h2
        id={id}
        className="flex items-center gap-(--space-2) border-b border-line-strong pb-(--space-2)"
      >
        <CertaintyGlyph line={line} />
        <span className="lead font-semibold text-ink">{name}</span>
        <span className="mono-label text-ink-2">{count}</span>
        <span className="ml-auto body text-ink-3">{what}</span>
      </h2>
      {findings.length === 0 ? (
        <p className="body text-ink-2">
          {persona === undefined
            ? "None in this group."
            : `None of ${personaLabel(persona)}'s in this group.`}
        </p>
      ) : (
        findings.map((finding) => (
          <FindingCard key={finding.id} finding={finding} runOf={runOf} persona={persona} />
        ))
      )}
    </section>
  );
}

/**
 * Whose each of `report`'s runs was, its seed and how it ended, from the report's own seeds.
 * `Report` holds every evidence run among them, so a run it does not name is a broken report, and
 * throws.
 */
export function runsOf(report: Report): (runId: RunId) => CitedRun {
  const runs = new Map(
    report.personas.flatMap((result) =>
      result.seeds.map((seed): [RunId, CitedRun] => [
        seed.runId,
        { profileId: result.profileId, seed: seed.seed, outcome: seed.outcome },
      ]),
    ),
  );
  return (runId) => {
    const run = runs.get(runId);
    if (run === undefined)
      throw new Error(`${runId} is not a run of the report on ${report.taskId}`);
    return run;
  };
}

/** `report`'s findings in their three groups, narrowed to `persona`'s when one is picked. */
export function Findings({ report, persona }: { report: Report; persona: ProfileId | undefined }) {
  const runOf = runsOf(report);
  return (
    <div className="grid gap-(--space-4) lg:grid-cols-3">
      {GROUPS.map(({ type, line, name, what }) => {
        const group = report.findings.filter((finding) => finding.type === type);
        return (
          <Group
            key={type}
            line={line}
            name={name}
            what={what}
            findings={group.filter((finding) => kept(finding, persona))}
            total={group.length}
            persona={persona}
            runOf={runOf}
          />
        );
      })}
    </div>
  );
}
