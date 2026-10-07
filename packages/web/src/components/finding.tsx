/**
 * One finding of the report (`docs/DESIGN.md`, "Finding"), as `.wf-finding` draws it: its tags,
 * the claim, the detail, what to change, and last, in lighter type, the runs behind it. Its border
 * is its certainty (Principle 3): a hairline for a measurement or a filter decision, dashed for a
 * hypothesis, dotted for anything resting on a `folk` or `llm` threshold. Soft keeps the finding's
 * group; it only marks it (`docs/PLAN.md` F8 AC5).
 *
 * Every finding links to the runs behind it (`AGENTS.md`, "Every verdict clickable through to
 * evidence"): one link per run, however many of its steps the finding cites, landing on the
 * earliest of them. The link says whose run it was, its seed and how it ended, so a failed run can
 * be picked by its word. Three show and the rest wait behind "Show N more", so a finding backed by
 * every seed does not make its card, and its column, far taller than the others. With a persona
 * picked, its runs come first, so its own evidence stays in view. The run's replay is where the
 * steps belong.
 */
import { Link } from "@tanstack/react-router";
import {
  type EvidenceRef,
  type Finding,
  isUnsourced,
  type ProfileId,
  type RunId,
  type RunOutcome,
  type Seed,
} from "@wayford/core";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import { PersonaName, personaLabel } from "../runs/task-results.js";
import type { CertaintyLine } from "./certainty.js";
import { OUTCOME_WORDS } from "./outcome-words.js";
import { ProvenanceTag, Tag } from "./tag.js";

/**
 * The line a finding is drawn with. Soft wins over every type: a basis with an unsourced threshold
 * is soft whatever the type says. A hypothesis is never `measured`, and a measurement or a filter
 * decision is never dashed.
 */
export function findingLine(finding: Finding): CertaintyLine {
  if (finding.basis.some((entry) => isUnsourced(entry.provenance))) return "soft";
  if (finding.type === "hypothesis") return "hypothesis";
  if (finding.type === "deterministic") return "deterministic";
  return "measured";
}

const BORDER: Record<CertaintyLine, string> = {
  measured: "border border-solid border-line",
  deterministic: "border border-solid border-line",
  hypothesis: "border-2 border-dashed border-line-strong",
  soft: "border-2 border-dotted border-line-strong",
};

/** What the report knows of a run it read: whose it was, its seed and how it ended. */
export type CitedRun = { profileId: ProfileId; seed: Seed; outcome: RunOutcome };

/** How many evidence links a card shows before "Show N more". */
const SHOWN = 3;

const EVIDENCE_LINK =
  "inline-flex min-h-8 items-center gap-1.5 body text-ink-2 transition-colors hover:text-ink";
const UNDERLINED = "underline decoration-line-strong underline-offset-4";

/**
 * The runs `evidence` cites, in the order it first names them but `persona`'s first, each at the
 * earliest step it cites in that run.
 */
function runsCited(
  evidence: readonly EvidenceRef[],
  runOf: (runId: RunId) => CitedRun,
  persona: ProfileId | undefined,
): EvidenceRef[] {
  const firstStep = new Map<RunId, number>();
  for (const { runId, stepIndex } of evidence) {
    firstStep.set(runId, Math.min(firstStep.get(runId) ?? stepIndex, stepIndex));
  }
  const picked = (runId: RunId) => runOf(runId).profileId === persona;
  return [...firstStep]
    .map(([runId, stepIndex]) => ({ runId, stepIndex }))
    .sort((a, b) => Number(picked(b.runId)) - Number(picked(a.runId)));
}

/** The evidence row: a link per run cited, the first three, and a toggle for the rest. */
function EvidenceLinks({
  evidence,
  runOf,
  persona,
}: {
  evidence: readonly EvidenceRef[];
  runOf: (runId: RunId) => CitedRun;
  persona: ProfileId | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  // The rest open before the toggle, so focus moves to the first of them, not past them.
  const firstOfRest = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (expanded) firstOfRest.current?.focus();
  }, [expanded]);
  const runs = runsCited(evidence, runOf, persona);
  const rest = runs.length - SHOWN;
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-x-(--space-2)">
      <span className="mono py-1 text-ink-3">evidence</span>
      <ul className="flex flex-wrap items-center gap-x-(--space-4)">
        {(expanded ? runs : runs.slice(0, SHOWN)).map(({ runId, stepIndex }, i) => {
          const run = runOf(runId);
          return (
            <li key={runId}>
              <Link
                ref={i === SHOWN ? firstOfRest : undefined}
                to="/runs/$runId"
                params={{ runId }}
                search={{ step: stepIndex }}
                className={EVIDENCE_LINK}
              >
                <span className={UNDERLINED}>
                  {`${personaLabel(run.profileId)}, seed `}
                  <span className="mono">{run.seed}</span>
                  {` · ${OUTCOME_WORDS[run.outcome]}`}
                </span>
                {/* A span, not CSS content: a pseudo-element's text joins the link's accessible name. */}
                <span aria-hidden="true" className="font-sans text-ink-3">
                  →
                </span>
              </Link>
            </li>
          );
        })}
        {rest > 0 ? (
          <li>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
              className={cn(EVIDENCE_LINK, UNDERLINED, "cursor-pointer")}
            >
              {expanded ? "Show fewer" : `Show ${rest} more`}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** `finding` as a card. `persona` is the one picked on the report, if any. */
export function FindingCard({
  finding,
  runOf,
  persona,
}: {
  finding: Finding;
  runOf: (runId: RunId) => CitedRun;
  persona?: ProfileId | undefined;
}) {
  const line = findingLine(finding);
  return (
    <article
      data-line={line}
      className={cn("grid gap-(--space-3) rounded-md bg-surface px-5 py-4", BORDER[line])}
    >
      <div className="flex flex-wrap items-center gap-2">
        {finding.personaIds.map((id) => (
          <PersonaName key={id} profileId={id} />
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {line === "soft" ? <Tag variant="soft">soft</Tag> : null}
          {finding.axeRuleId === undefined ? null : <Tag>{`axe · ${finding.axeRuleId}`}</Tag>}
          {finding.basis.map((entry) => (
            <span key={`${entry.rule}-${entry.provenance}`} className="contents">
              <Tag variant="rule">{entry.rule}</Tag>
              <ProvenanceTag provenance={entry.provenance} />
            </span>
          ))}
        </div>
      </div>
      <h3 className="title text-balance text-ink">{finding.title}</h3>
      <p className="body max-w-[68ch] text-pretty text-ink-2">{finding.detail}</p>
      <p className="grid grid-cols-[auto_1fr] items-start gap-2 border-t border-line pt-(--space-3) body text-ink">
        <span className="mono text-ink-3">change →</span>
        <span>{finding.recommendation}</span>
      </p>
      <EvidenceLinks evidence={finding.evidence} runOf={runOf} persona={persona} />
    </article>
  );
}
