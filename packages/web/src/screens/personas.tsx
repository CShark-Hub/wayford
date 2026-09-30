import { createRoute } from "@tanstack/react-router";
import {
  isUnsourced,
  METRIC_NAMES,
  type MetricName,
  type Profile,
  type ProvenanceId,
} from "@wayford/core";
import { cn } from "cn";
import { Avatar } from "../avatar/avatar.js";
import { personaColour } from "../avatar/parts.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { rootRoute } from "../shell.js";

/** A switched-on perception threshold, whichever metric it gates. */
type Threshold = NonNullable<Profile["perception"][MetricName]>;

/** How a card reads each threshold, keyed by the metric the filter measures. */
const READING: Record<MetricName, (threshold: number) => string> = {
  contrast: (threshold) => `Contrast ${threshold}:1`,
  fontPx: (threshold) => `Font size ${threshold} px`,
  targetPx: (threshold) => `Target size ${threshold} px`,
};

// The outline takes the text's colour: the theme's border colour, 1.3:1 on the card, is too faint
// for a dashed outline to read as one.
const BADGE =
  "rounded-md border border-muted-foreground px-1.5 font-mono text-xs text-muted-foreground";

/**
 * A threshold's source, as its id in `docs/RULES.md`. `folk` and `llm` cite nothing, and core asks
 * that a report say so, so their badge says it in words and dashes its outline.
 */
function ProvenanceBadge({ provenance }: { provenance: ProvenanceId }) {
  const unsourced = isUnsourced(provenance);
  return (
    <span className={cn(BADGE, unsourced && "border-dashed")}>
      {unsourced ? `${provenance} · no source` : provenance}
    </span>
  );
}

/** One threshold: its reading, the width of its band when it has one, and its source. */
function ThresholdRow({ metric, threshold }: { metric: MetricName; threshold: Threshold }) {
  const softness = threshold.softness ?? 0;
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-medium">{READING[metric](threshold.threshold)}</span>
      {softness > 0 ? <span className="text-muted-foreground">{`soft ${softness}`}</span> : null}
      <ProvenanceBadge provenance={threshold.provenance} />
    </li>
  );
}

/**
 * One persona: its avatar, its name and description, its device and time budget, and the perception
 * thresholds the filter applies for it, each with its source. The heading's id is built from the
 * profile's id, not from `useId`, so the card's markup, like the avatar's, depends on the profile
 * alone.
 */
export function PersonaCard({ profile }: { profile: Profile }) {
  const headingId = `persona-${profile.id}`;
  // In the order of the filter's metrics, which is the order of its rules, P1 to P4.
  const thresholds = METRIC_NAMES.flatMap((metric) => {
    const threshold = profile.perception[metric];
    return threshold ? [{ metric, threshold }] : [];
  });
  return (
    <article
      aria-labelledby={headingId}
      className="flex h-full flex-col gap-5 rounded-xl border border-t-4 bg-card p-6 text-card-foreground"
      // The persona's colour is the card's one accent, the thing that later crosses into the
      // report. Everything else on the card keeps to the theme.
      style={{ borderTopColor: personaColour(profile) }}
    >
      <Avatar profile={profile} className="mx-auto size-40" />
      <div className="flex flex-col gap-2">
        <h2 id={headingId} className="text-3xl font-bold tracking-tight">
          {profile.label}
        </h2>
        <p className="text-sm text-muted-foreground">{profile.description}</p>
      </div>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Device</dt>
          <dd className="font-medium">{profile.device}</dd>
        </div>
        {/* The number the avatar's hourglass is drawn from. */}
        <div>
          <dt className="text-muted-foreground">Budget</dt>
          <dd className="font-medium">{`${profile.behaviour.budgetSeconds} s`}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Thresholds</h3>
        {thresholds.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {thresholds.map(({ metric, threshold }) => (
              <ThresholdRow key={metric} metric={metric} threshold={threshold} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No perception threshold</p>
        )}
      </div>
    </article>
  );
}

/** The persona fixtures, bundled for the browser, as a grid of cards in fixture order. */
export function PersonasScreen() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Personas</h1>
        <p className="text-sm text-muted-foreground">
          Each persona is a set of limits on what the model sees and does, never a character it is
          told to play.
        </p>
      </header>
      <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {bundledProfiles.map((profile) => (
          <li key={profile.id}>
            <PersonaCard profile={profile} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export const personasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/personas",
  component: PersonasScreen,
});
