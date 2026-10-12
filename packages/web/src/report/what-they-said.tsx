/**
 * The Report's "What they said" (#197): per persona, one link per seed to its run, opened at its
 * narration, which run detail lists whole, one line per step (`runs/narration-list.tsx`). The
 * Report holds no narration, only each seed's run and how it ended, so the section links to the
 * words and reads no run itself. A Jev report says in one line why it has nothing to link: Jev
 * writes no narration, and every run in the report is on the report's backend.
 *
 * The label `narration · after the fact` stands under the heading, as wherever narration is shown
 * (`docs/DESIGN.md`, Principle 6). `?persona=` narrows the findings, not this: every persona's
 * narration stays one click away.
 */
import { Link } from "@tanstack/react-router";
import type { PersonaResult, Report } from "@wayford/core";
import { EVIDENCE_LINK, RunLinkText } from "../components/finding.js";
import { OUTCOME_WORDS } from "../components/outcome-words.js";
import { PersonaName, personaLabel } from "../components/persona-avatar.js";
import { NOTE } from "../runs/details.js";
import { NARRATION_HASH } from "../runs/replay.js";
import { NARRATION_LABEL } from "../runs/step-replay.js";

/** The section's heading id, which labels it, and its label line's, which describes it. */
const HEADING = "report-narration";
const LABEL = `${HEADING}-label`;

/** One persona's row: the name, then a link per seed. */
function PersonaRow({ result }: { result: PersonaResult }) {
  const { profileId, seeds } = result;
  const whose = `what ${personaLabel(profileId)} said`;
  return (
    // In a narrow window the name stands above the links; from `sm` up, beside them.
    <li
      data-said={profileId}
      className="grid items-start gap-x-(--space-4) sm:grid-cols-[--spacing(40)_minmax(0,1fr)]"
    >
      <p className="flex min-h-8 min-w-0 items-center body text-ink wrap-anywhere">
        <PersonaName profileId={profileId} />
      </p>
      <ul className="flex min-w-0 flex-wrap items-center gap-x-(--space-4)">
        {seeds.map((seed) => (
          <li key={seed.runId}>
            {/* Named by a label, not an `sr-only` suffix, whose text a browser joins to the name
                with a space: "Gave up , what Kai said". The name starts with the words shown
                (WCAG 2.5.3), and its end keeps it apart from the evidence links'. */}
            <Link
              to="/runs/$runId"
              params={{ runId: seed.runId }}
              hash={NARRATION_HASH}
              aria-label={`seed ${seed.seed} · ${OUTCOME_WORDS[seed.outcome]}, ${whose}`}
              className={EVIDENCE_LINK}
            >
              <RunLinkText seed={seed.seed} outcome={seed.outcome} />
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}

/** Where each persona's narration is: a link per seed, or on a Jev report, why there is none. */
export function WhatTheySaid({ report }: { report: Report }) {
  return (
    <section aria-labelledby={HEADING} aria-describedby={LABEL} className="grid gap-(--space-2)">
      {/* A `<div>`, not a `<header>`: the findings' groups are the page's headed sections. */}
      <div className="border-b border-line-strong pb-(--space-2)">
        <h2 id={HEADING} className="lead font-semibold text-ink">
          What they said
        </h2>
        <p id={LABEL} className="mono-label text-ink-3">
          {NARRATION_LABEL}
        </p>
      </div>
      {report.backend === "jev" ? (
        <p className={NOTE}>Every run in this report ran on Jev, and Jev writes no narration.</p>
      ) : (
        <>
          <p className="body max-w-[68ch] text-pretty text-ink-2">
            Each link opens the run at its narration, one line per step it stored.
          </p>
          <ul className="grid gap-(--space-2)">
            {report.personas.map((result) => (
              <PersonaRow key={result.profileId} result={result} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
