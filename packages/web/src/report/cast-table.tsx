/**
 * The report's cast table (`docs/design/screens/report.html`): one row per persona, in report
 * order, with its seeds, its two numbers side by side and never merged (`docs/DESIGN.md`,
 * Principle 4), the gap between them, and its median simulated time to get through (B3's clock),
 * never the wall-clock median the report also keeps, which measures the model and the machine.
 * Route open is the filter's, counted over every seed; got through is the agent's, counted over
 * the runs that did not error, so a crash never reads as the persona failing.
 *
 * Every number opens the runs behind it: a seed cell its run, route open every run of the persona
 * on the goal (no runs filter selects route-open seeds), got through the runs that got through.
 * The persona's name picks it (`?persona=`), which narrows the findings below to theirs.
 *
 * Under a persona that did not get through on every seed, a why line (#238, `WhyRow`) names a
 * finding but does not claim it is why a seed ended.
 *
 * Each row sets its persona's slot variables, which the seed strip and the gap bar fill from. Every
 * text cell holds its text in a `<p>`, so `check:self` measures it.
 *
 * The headers of the two numbers each carry a hint saying what the number counts and how far to
 * trust it (#240). Each header is named by its label alone, so a screen reader does not repeat the
 * hint button's name with every cell of the column.
 *
 * In a window narrower than the table, the table scrolls sideways in a box of its own, not the page
 * (#265). In the page column's grid a scroll container's minimum width is 0, so the table no longer
 * sets the column's width, and the header, the findings and the footer keep to the window. The box
 * is `relative`, so a `NoValue`'s `sr-only` reason, positioned absolutely, is placed in the box and
 * not against the page.
 */
import { Link } from "@tanstack/react-router";
import type {
  Finding,
  FindingType,
  PersonaResult,
  ProfileId,
  Report,
  RunOutcome,
} from "@wayford/core";
import { cn } from "cn";
import { Fragment, type ReactNode, useId } from "react";
import { slotOf, slotStyle } from "../avatar/slots.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { CertaintyGlyph } from "../components/certainty.js";
import { findingLine } from "../components/finding.js";
import { count, OUTCOME_WORDS } from "../components/outcome-words.js";
import { PersonaAvatar, PersonaName, personaLabel } from "../components/persona-avatar.js";
import { GapBar, NoValue, Readout } from "../components/readout.js";
import { SeedStrip } from "../components/seed-strip.js";
import { Hint } from "../components/ui/tooltip.js";
import { formatSeconds } from "../runs/step-replay.js";

/** The bundled profiles by id: a persona among them is drawn with its avatar. */
const PROFILES = new Map(bundledProfiles.map((profile) => [profile.id, profile]));

/**
 * A pick link matches the URL only exactly, search included: TanStack would otherwise mark a link
 * back to no `persona` current on every URL, since every search holds an empty one. The picked row
 * says it is current itself.
 */
export const EXACT = { exact: true } as const;

/** "seeds 1–3" (or "seeds 1 to 3" with `to` " to "): the span of `seeds`; "seed 1" for one. */
function seedSpan(seeds: readonly number[], to = "–"): string {
  const first = Math.min(...seeds);
  const last = Math.max(...seeds);
  return first === last ? `seed ${first}` : `seeds ${first}${to}${last}`;
}

/**
 * A persona's rows light together: each persona's rows are a `<tbody>` of their own, which draws
 * the rule under them.
 */
const ROW = "transition-colors group-hover:bg-paper-sunken";
const HEAD = "px-(--space-3) py-(--space-2) align-bottom whitespace-nowrap label text-ink-3";

/**
 * What each of the two numbers counts, in its header's hint. Each says its certainty in words, as
 * the glyph beside the label is hidden from assistive technology.
 */
const NUMBER_HINTS = {
  routeOpen:
    "Seeds where at least one route to the goal stayed open, out of the persona's seeds. Deterministic: the filter decides it in code, from the persona's limits and the seed, with no model.",
  gotThrough:
    "Runs that reached the goal, out of those that did not error. Code checks the goal; the way there is the agent's and varies, so read it as a hypothesis.",
} as const;
const CELL = "px-(--space-3) py-(--space-2)";

/** The persona's cell: avatar and name if bundled, `PersonaName` if not. The name picks it. */
function PersonaCell({
  taskId,
  profileId,
  picked,
}: {
  taskId: string;
  profileId: string;
  picked: boolean;
}) {
  const profile = PROFILES.get(profileId);
  const name = personaLabel(profileId);
  return (
    <div className="flex items-center gap-(--space-3)">
      {profile === undefined ? null : <PersonaAvatar profile={profile} className="size-10" />}
      <p>
        <Link
          to="/report/$taskId"
          params={{ taskId }}
          search={picked ? {} : { persona: profileId }}
          activeOptions={EXACT}
          aria-current={picked ? "true" : undefined}
          className="inline-flex min-h-8 items-center rounded-sm underline-offset-4 transition-colors hover:underline aria-[current=true]:underline"
        >
          {profile === undefined ? (
            <PersonaName profileId={profileId} />
          ) : (
            <span className="font-display text-2xl font-bold tracking-tight text-ink">{name}</span>
          )}
        </Link>
      </p>
    </div>
  );
}

/**
 * The median's cell: the median simulated time over the runs that got through, or "—" with why
 * there is none: no run got through, or one that did carries no time, as runs stored before s2-09
 * do not. `medianSimulatedMs` is absent on a report stored before it.
 */
function MedianCell({
  successes,
  median,
}: {
  successes: number;
  median: number | null | undefined;
}) {
  if (successes === 0) return <NoValue reason="no run got through" className="mono" />;
  if (median === null || median === undefined) {
    return <NoValue reason="not timed: runs stored before simulated time" className="mono" />;
  }
  return <p className="mono text-ink">{formatSeconds(median)}</p>;
}

/** One persona's row. */
function CastRow({
  taskId,
  result,
  picked,
}: {
  taskId: string;
  result: PersonaResult;
  picked: boolean;
}) {
  const { profileId, seeds, runs, errors, successes, routeOpenSeeds, medianSimulatedMs } = result;
  const counted = runs - errors;
  const name = personaLabel(profileId);
  return (
    <tr
      data-persona={profileId}
      style={slotStyle(slotOf(profileId))}
      className={cn(ROW, picked && "bg-paper-sunken")}
    >
      <td className={CELL}>
        <PersonaCell taskId={taskId} profileId={profileId} picked={picked} />
      </td>
      <td className={CELL}>
        <SeedStrip
          seeds={seeds}
          label={`${name}, ${seedSpan(
            result.seeds.map((seed) => seed.seed),
            " to ",
          )}`}
        />
      </td>
      <td className={cn(CELL, "text-right")}>
        <Readout
          kind="routeOpen"
          value={routeOpenSeeds === null ? null : { k: routeOpenSeeds, n: seeds.length }}
          to={{ to: "/runs", search: { taskId, profileId } }}
          opens={`Every stored run of ${name} on this goal, which can include runs this report leaves out`}
        />
      </td>
      <td className={cn(CELL, "text-right")}>
        <Readout
          kind="gotThrough"
          value={counted === 0 ? null : { k: successes, n: counted }}
          to={{ to: "/runs", search: { taskId, profileId, outcome: "success" } }}
          opens={`Every stored run of ${name} on this goal that got through, which can include runs this report leaves out`}
        />
        {errors > 0 ? <p className="mono text-ink-2">{count(errors, "error")}</p> : null}
      </td>
      <td className={cn(CELL, "ps-(--space-6)")}>
        <GapBar seeds={seeds} />
      </td>
      <td className={cn(CELL, "text-right")}>
        <MedianCell successes={successes} median={medianSimulatedMs} />
      </td>
    </tr>
  );
}

/** The seed endings a why line counts, in its order: the persona's own two, then the tool's. */
const ENDINGS: readonly RunOutcome[] = ["gave_up", "budget_exceeded", "error"];

/** A finding type's rank on a why line: a filter decision, then a measurement, a guess last. */
const RANK: Record<FindingType, number> = { deterministic: 0, measurement: 1, hypothesis: 2 };

const WHY_LINK =
  "inline-flex min-h-8 items-center text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink";

/**
 * The finding a why line names for `profileId`: the first that names the persona by type
 * (`RANK`), then in the report's order. Undefined when none names it.
 */
function leadFindingOf(findings: readonly Finding[], profileId: ProfileId): Finding | undefined {
  // A stable sort: findings of one type keep the report's order.
  return findings
    .filter((finding) => finding.personaIds.includes(profileId))
    .sort((a, b) => RANK[a.type] - RANK[b.type])[0];
}

/**
 * The line under `result`'s row, or nothing when every seed got through: its seeds by how they
 * ended, then the finding that names the persona, or why there is none to show.
 */
function WhyRow({
  taskId,
  result,
  findings,
  picked,
}: {
  taskId: string;
  result: PersonaResult;
  findings: readonly Finding[];
  picked: boolean;
}) {
  const { profileId, seeds } = result;
  const ended = ENDINGS.map((outcome) => ({
    outcome,
    n: seeds.filter((seed) => seed.outcome === outcome).length,
  })).filter(({ n }) => n > 0);
  if (ended.length === 0) return null;
  const name = personaLabel(profileId);
  // A finding is offered only where the persona ended a seed itself: none explains an error.
  const onlyErrors = ended.every(({ outcome }) => outcome === "error");
  const finding = onlyErrors ? undefined : leadFindingOf(findings, profileId);
  const ownRuns = (
    <Link to="/runs" search={{ taskId, profileId }} className={WHY_LINK}>
      {`Open ${name}'s runs`}
    </Link>
  );
  let reason: ReactNode;
  if (finding !== undefined) {
    const line = findingLine(finding);
    reason = (
      <>
        <CertaintyGlyph line={line} />
        {/* The word beside the glyph, which assistive technology does not read. */}
        <span className="mono text-ink-3">{line === "measured" ? "measurement" : line}</span>
        <Link
          to="/report/$taskId"
          params={{ taskId }}
          search={{ persona: profileId }}
          hash={finding.id}
          // With the persona picked, the link is current only once followed, hash and all.
          activeOptions={{ exact: true, includeHash: true }}
          className={cn(WHY_LINK, "min-w-0 text-pretty")}
        >
          {finding.title}
        </Link>
      </>
    );
  } else {
    reason = (
      <>
        <span>
          {onlyErrors ? `An error is the tool's, not ${name}'s.` : `No finding names ${name}.`}
        </span>
        {ownRuns}
      </>
    );
  }
  return (
    <tr data-why={profileId} className={cn(ROW, picked && "bg-paper-sunken")}>
      <td />
      <td colSpan={5} className={cn(CELL, "pt-0")}>
        {/* Two parts, the counts and the finding: on a narrow row the finding wraps whole, flush left. */}
        <p className="flex flex-wrap items-center gap-x-(--space-5) body text-ink-2">
          <span className="inline-flex flex-wrap items-center gap-x-(--space-2)">
            <span>{`${count(seeds.length, "seed")}:`}</span>
            {ended.map(({ outcome, n }, i) => (
              <Fragment key={outcome}>
                {i === 0 ? null : <span className="text-ink-3">·</span>}
                <Link
                  to="/runs"
                  search={{ taskId, profileId, outcome }}
                  // The filter is by outcome, not by this report's seeds, as the readouts' is.
                  title={`Every stored run of ${name} on this goal marked ${OUTCOME_WORDS[outcome]}, which can include runs this report leaves out`}
                  className={WHY_LINK}
                >
                  {/* One flex item, so the space before the count is not trimmed at its edge. */}
                  <span>
                    {`${OUTCOME_WORDS[outcome]} in `}
                    <span className="mono">{n}</span>
                  </span>
                </Link>
              </Fragment>
            ))}
          </span>
          <span className="inline-flex min-w-0 flex-wrap items-center gap-x-(--space-2)">
            {reason}
          </span>
        </p>
      </td>
    </tr>
  );
}

/** `report`'s personas, one row each, with `picked`'s row marked and a why line where one is due. */
export function CastTable({ report, picked }: { report: Report; picked: string | undefined }) {
  const span = seedSpan(report.personas.flatMap((result) => result.seeds.map((s) => s.seed)));
  const routeOpenId = useId();
  const gotThroughId = useId();
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line-strong">
            <th scope="col" className={cn(HEAD, "text-left")}>
              <p>persona</p>
            </th>
            <th scope="col" className={cn(HEAD, "text-left")}>
              <p>{span}</p>
            </th>
            <th scope="col" aria-labelledby={routeOpenId} className={cn(HEAD, "text-right")}>
              <p className="inline-flex items-center gap-(--space-2)">
                <CertaintyGlyph line="deterministic" />
                <span id={routeOpenId}>route open</span>
                <Hint label="Explain route open" hint={NUMBER_HINTS.routeOpen} />
              </p>
            </th>
            <th scope="col" aria-labelledby={gotThroughId} className={cn(HEAD, "text-right")}>
              <p className="inline-flex items-center gap-(--space-2)">
                <CertaintyGlyph line="hypothesis" />
                <span id={gotThroughId}>got through</span>
                <Hint label="Explain got through" hint={NUMBER_HINTS.gotThrough} />
              </p>
            </th>
            <th scope="col" className={cn(HEAD, "ps-(--space-6) text-left")}>
              <p>gap</p>
            </th>
            <th scope="col" className={cn(HEAD, "text-right")}>
              <p>median simulated time</p>
            </th>
          </tr>
        </thead>
        {report.personas.map((result) => (
          <tbody key={result.profileId} className="group border-b border-line">
            <CastRow taskId={report.taskId} result={result} picked={result.profileId === picked} />
            <WhyRow
              taskId={report.taskId}
              result={result}
              findings={report.findings}
              picked={result.profileId === picked}
            />
          </tbody>
        ))}
      </table>
    </div>
  );
}
