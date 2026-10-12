/**
 * The report's findings in three groups side by side (`docs/PLAN.md` F8 AC1): measurement, the
 * page as axe measured it; deterministic, what the filter decided in code; hypothesis, what was
 * read from the runs. Each group is headed by its certainty glyph (`docs/DESIGN.md`, Principle 3)
 * and a hint saying where its findings come from (#240), and keeps the report's order within it. A
 * finding keeps its group whatever its basis: soft only marks it (`FindingCard`).
 *
 * With a persona picked, a group keeps that persona's findings and every measurement, since a
 * measurement holds for whoever is looking, and its count reads "N of M", so nothing left out is
 * hidden. A finding's evidence leads with that persona's runs.
 */
import type { Finding, FindingType, ProfileId, Report, RunId } from "@wayford/core";
import { CertaintyGlyph, type CertaintyLine } from "../components/certainty.js";
import { type CitedRun, FindingCard } from "../components/finding.js";
import { personaLabel } from "../components/persona-avatar.js";
import { Hint } from "../components/ui/tooltip.js";
import { useLandOnHash } from "../land-on-hash.js";

/**
 * Each group's glyph, name, what it is, and the hint its header's Info button opens (#240): where
 * its findings come from, and how far to trust them. In the order the columns run.
 */
const GROUPS: {
  type: FindingType;
  line: CertaintyLine;
  name: string;
  what: string;
  hint: string;
}[] = [
  {
    type: "measurement",
    line: "measured",
    name: "Measurement",
    what: "the page, by axe",
    // axe scans the page each step stood on, never the goal page a run reaches (`analyst-axe.ts`).
    // A card's `change →` is the Analyst's, so neither this hint nor the next says the card has no
    // model in it.
    hint: "Measured by axe-core, an accessibility scanner, on pages the runs stood on, each loaded afresh at desktop size. It is about the page, not a persona, so it stays in view whichever persona is picked. What to change is the Analyst's.",
  },
  {
    type: "deterministic",
    line: "deterministic",
    name: "Deterministic",
    what: "the filter, in code",
    hint: "Decided in code by the filter, from the persona's limits: what did not reach the model. The same seed gives the same decision. What to change is the Analyst's.",
  },
  {
    type: "hypothesis",
    line: "hypothesis",
    name: "Hypothesis",
    what: "read from the runs",
    hint: "Written by the Analyst, a model, from what the agent did in the runs. A reading worth checking, not a measured fact.",
  },
];

/** Whether `finding` stays in view with `persona` picked: theirs, or a measurement. */
function kept(finding: Finding, persona: ProfileId | undefined): boolean {
  return (
    persona === undefined || finding.type === "measurement" || finding.personaIds.includes(persona)
  );
}

/**
 * One group: its header and its cards, or a line saying it has none. The header holds the heading,
 * then the hint: outside the `<h2>`, the button's name stays out of the heading's, which names the
 * section. In a narrow column the three words drop under the name whole, and the count never
 * breaks.
 */
function Group({
  line,
  name,
  what,
  hint,
  findings,
  total,
  persona,
  runOf,
}: {
  line: CertaintyLine;
  name: string;
  what: string;
  hint: string;
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
      <header className="flex items-center gap-(--space-2) border-b border-line-strong pb-(--space-2)">
        <h2 id={id} className="flex flex-1 flex-wrap items-center gap-x-(--space-2)">
          <CertaintyGlyph line={line} />
          <span className="lead font-semibold text-ink">{name}</span>
          <span className="mono-label text-ink-2">{count}</span>
          <span className="ml-auto body text-ink-3">{what}</span>
        </h2>
        <Hint label={`Explain ${name}`} hint={hint} />
      </header>
      {findings.length === 0 ? (
        <p className="body text-ink-2">
          {persona === undefined
            ? "None in this group."
            : `None of ${personaLabel(persona)}'s in this group.`}
        </p>
      ) : (
        // Each card under its finding's id, the anchor a cast row's why line links to (#238).
        findings.map((finding) => (
          <div key={finding.id} id={finding.id} tabIndex={-1} className="scroll-mt-(--space-4)">
            <FindingCard finding={finding} runOf={runOf} persona={persona} />
          </div>
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
  // The card a why line links to is scrolled to once drawn, and takes focus (#238). Only once the
  // fonts have loaded: in a wider fallback font a findings header wraps to two lines, and the card
  // would move up once it unwraps.
  useLandOnHash();
  return (
    <div className="grid gap-(--space-4) lg:grid-cols-3">
      {GROUPS.map(({ type, line, name, what, hint }) => {
        const group = report.findings.filter((finding) => finding.type === type);
        return (
          <Group
            key={type}
            line={line}
            name={name}
            what={what}
            hint={hint}
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
