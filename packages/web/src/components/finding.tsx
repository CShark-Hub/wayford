/**
 * One finding of the report (`docs/DESIGN.md`, "Finding"), as `.wf-finding` draws it: its persona,
 * the claim, its tags, the detail with "Show more", which opens what to change (#241), and last, in
 * lighter type, the runs behind it. Its border is its certainty (Principle 3): a hairline for a
 * measurement or a filter decision, dashed for a hypothesis, dotted for anything resting on a
 * `folk` or `llm` threshold. Soft keeps the finding's group; it only marks it (`docs/PLAN.md` F8
 * AC5).
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
import { useEffect, useId, useRef, useState } from "react";
import type { CertaintyLine } from "./certainty.js";
import { RuleTag } from "./filter-states.js";
import { OUTCOME_WORDS } from "./outcome-words.js";
import { PersonaName, personaLabel } from "./persona-avatar.js";
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
/** A button that shows or hides part of the card: "Show more" and "Show N more" look alike. */
const TOGGLE = cn(EVIDENCE_LINK, UNDERLINED, "cursor-pointer");

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
              className={TOGGLE}
            >
              {expanded ? "Show fewer" : `Show ${rest} more`}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * `finding` as a card. `persona` is the one picked on the report, if any.
 *
 * At rest (#241) the card is short enough for three columns to be read side by side: the persona,
 * the title in two lines, its tags in one quiet line, the detail's first line, and the evidence.
 * "Show more" opens the whole title and detail, and what to change. The clamp is CSS only, so a screen
 * reader hears the title and the detail whole either way.
 */
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
  const [open, setOpen] = useState(false);
  const id = useId();
  // The tags under the title: soft, the axe rule, each basis rule and its source. No row when none.
  // The axe tag breaks inside the card when wider than it (#269): its rule id is any axe rule, and
  // "axe · color-contrast" alone is wider than a card in a 320 px window on Linux. The other tags
  // come from fixed lists and the widest, "folk · no source", fits the narrowest card.
  const tags = [
    line === "soft" ? (
      <Tag key="soft" variant="soft">
        soft
      </Tag>
    ) : null,
    finding.axeRuleId === undefined ? null : (
      <Tag key="axe" breaks>{`axe · ${finding.axeRuleId}`}</Tag>
    ),
    ...finding.basis.map((entry) => (
      <span key={`${entry.rule}-${entry.provenance}`} className="contents">
        <RuleTag rule={entry.rule} />
        <ProvenanceTag provenance={entry.provenance} />
      </span>
    )),
  ].filter((tag) => tag !== null);
  return (
    <article
      data-line={line}
      className={cn(
        "grid gap-(--space-2) rounded-md bg-surface px-5 py-4 wrap-anywhere",
        BORDER[line],
      )}
    >
      {finding.personaIds.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {finding.personaIds.map((id) => (
            <PersonaName key={id} profileId={id} />
          ))}
        </div>
      )}
      <h3
        id={`${id}-title`}
        className={cn("body font-semibold text-balance text-ink", !open && "line-clamp-2")}
      >
        {finding.title}
      </h3>
      {tags.length === 0 ? null : <div className="flex flex-wrap items-center gap-2">{tags}</div>}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-(--space-2)">
        <p
          id={`${id}-detail`}
          className={cn("body max-w-[68ch] text-pretty text-ink-2", !open && "line-clamp-1")}
        >
          {finding.detail}
        </p>
        <button
          type="button"
          aria-expanded={open}
          // The title and the detail, and once open the change it shows: an id only while it is drawn.
          aria-controls={`${id}-title ${id}-detail${open ? ` ${id}-change` : ""}`}
          // One "Show more" a card: the title, whole even while clamped, says which finding it opens.
          aria-describedby={`${id}-title`}
          onClick={() => setOpen(!open)}
          className={TOGGLE}
        >
          {open ? "Show less" : "Show more"}
        </button>
      </div>
      {open ? (
        <p
          id={`${id}-change`}
          className="grid grid-cols-[auto_1fr] items-start gap-2 border-t border-line pt-(--space-2) body text-ink"
        >
          <span className="mono text-ink-3">change →</span>
          <span>{finding.recommendation}</span>
        </p>
      ) : null}
      <EvidenceLinks evidence={finding.evidence} runOf={runOf} persona={persona} />
    </article>
  );
}
