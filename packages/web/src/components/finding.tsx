/**
 * One finding of the report (`docs/DESIGN.md`, "Finding"), as `.wf-finding` draws it: its tags,
 * the claim, the evidence chips, the detail, and what to change. Its border is its certainty
 * (Principle 3): a hairline for a measurement or a filter decision, dashed for a hypothesis, dotted
 * for anything resting on a `folk` or `llm` threshold. Soft keeps the finding's group; it only
 * marks it (`docs/PLAN.md` F8 AC5).
 *
 * Every evidence chip opens its run at its step (`AGENTS.md`, "Every verdict clickable through to
 * evidence") and says how that run ended, so a failed run can be picked by its word.
 */
import { Link } from "@tanstack/react-router";
import { type Finding, isUnsourced, type RunId, type RunOutcome } from "@wayford/core";
import { cn } from "cn";
import { PersonaName } from "../runs/task-results.js";
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

const EVIDENCE_CHIP =
  "inline-flex min-h-8 items-center gap-1.5 rounded-sm border border-line-strong bg-paper px-2.5 mono text-ink transition-colors hover:bg-paper-sunken";

/**
 * `finding` as a card. `outcomeOf` says how an evidence run ended, from the report's own seeds.
 */
export function FindingCard({
  finding,
  outcomeOf,
}: {
  finding: Finding;
  outcomeOf: (runId: RunId) => RunOutcome;
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
      <div className="grid justify-items-start gap-1.5">
        {finding.evidence.map((ref) => {
          const word = OUTCOME_WORDS[outcomeOf(ref.runId)];
          return (
            <Link
              key={`${ref.runId}-${ref.stepIndex}`}
              to="/runs/$runId"
              params={{ runId: ref.runId }}
              search={{ step: ref.stepIndex }}
              className={EVIDENCE_CHIP}
            >
              {`${ref.runId} · step ${ref.stepIndex} · ${word}`}
              {/* A span, not CSS content: a pseudo-element's text joins the link's accessible name. */}
              <span aria-hidden="true" className="font-sans text-ink-3">
                →
              </span>
            </Link>
          );
        })}
      </div>
      <p className="body max-w-[68ch] text-pretty text-ink-2">{finding.detail}</p>
      <p className="grid grid-cols-[auto_1fr] items-start gap-2 border-t border-line pt-(--space-3) body text-ink">
        <span className="mono text-ink-3">change →</span>
        <span>{finding.recommendation}</span>
      </p>
    </article>
  );
}
