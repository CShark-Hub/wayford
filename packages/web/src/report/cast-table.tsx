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
 * Each row sets its persona's slot variables, which the seed strip and the gap bar fill from. Every
 * text cell holds its text in a `<p>`, so `check:self` measures it.
 */
import { Link } from "@tanstack/react-router";
import type { PersonaResult, Report } from "@wayford/core";
import { cn } from "cn";
import { slotOf, slotStyle } from "../avatar/slots.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { CertaintyGlyph } from "../components/certainty.js";
import { count } from "../components/outcome-words.js";
import { PersonaAvatar, PersonaName, personaLabel } from "../components/persona-avatar.js";
import { GapBar, NoValue, Readout } from "../components/readout.js";
import { SeedStrip } from "../components/seed-strip.js";
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

const HEAD = "px-(--space-3) py-(--space-2) align-bottom whitespace-nowrap label text-ink-3";
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
      className={cn(
        "border-b border-line transition-colors hover:bg-paper-sunken",
        picked && "bg-paper-sunken",
      )}
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

/** `report`'s personas, one row each, with `picked`'s row marked. */
export function CastTable({ report, picked }: { report: Report; picked: string | undefined }) {
  const span = seedSpan(report.personas.flatMap((result) => result.seeds.map((s) => s.seed)));
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-line-strong">
          <th scope="col" className={cn(HEAD, "text-left")}>
            <p>persona</p>
          </th>
          <th scope="col" className={cn(HEAD, "text-left")}>
            <p>{span}</p>
          </th>
          <th scope="col" className={cn(HEAD, "text-right")}>
            <p className="inline-flex items-center gap-(--space-2)">
              <CertaintyGlyph line="deterministic" />
              route open
            </p>
          </th>
          <th scope="col" className={cn(HEAD, "text-right")}>
            <p className="inline-flex items-center gap-(--space-2)">
              <CertaintyGlyph line="hypothesis" />
              got through
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
      <tbody>
        {report.personas.map((result) => (
          <CastRow
            key={result.profileId}
            taskId={report.taskId}
            result={result}
            picked={result.profileId === picked}
          />
        ))}
      </tbody>
    </table>
  );
}
