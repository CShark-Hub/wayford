/**
 * One persona's spec sheet (`docs/DESIGN.md`, "CastCard"; `docs/design/components.html`), and the
 * one cell both it and the Cast's matrix draw a dimension with, `DimensionValue`. Both read the
 * profile through `castDimensions`, so the card and the matrix never disagree.
 *
 * Every text sits in a `<p>` or a heading, so `check:self`, which measures headings, paragraphs
 * and list items, measures it. The gauge and the pips are drawings beside a value that says the
 * number, so they are hidden from a screen reader.
 */
import { constraintCount, type Profile } from "@wayford/core";
import { cn } from "cn";
import { slotOf, slotStyle } from "../avatar/slots.js";
import { castDimensions, type Dimension, PATTERN_COUNT } from "../cast/dimensions.js";
import { PersonaAvatar } from "./persona-avatar.js";
import { ProvenanceTag, Tag } from "./tag.js";

/**
 * Where a threshold sits on its ruler, drawn as `cast.html`'s `.mg`: a 4 px track on sunken paper
 * along the cell's foot, the persona's fill (`--p`) to the share, and the `signal` post at it.
 */
function MiniGauge({ share }: { share: number }) {
  const at = `${share * 100}%`;
  return (
    <span
      aria-hidden="true"
      data-slot="mini-gauge"
      className="absolute inset-x-0 bottom-0.5 h-1 rounded-xs bg-paper-sunken"
    >
      <span
        data-slot="mini-gauge-fill"
        className="absolute inset-y-0 left-0 rounded-xs bg-(--p)"
        style={{ width: at }}
      />
      <span
        data-slot="mini-gauge-post"
        className="absolute -top-0.75 h-2.5 w-(--stroke-post) -translate-x-1/2 rounded-xs bg-signal"
        style={{ left: at }}
      />
    </span>
  );
}

/** The 12 patterns as marks, the first `known` filled in the persona's slot, the rest hollow. */
function Pips({ known }: { known: number }) {
  return (
    <span aria-hidden="true" className="inline-flex gap-0.5">
      {Array.from({ length: PATTERN_COUNT }, (_, pip) => {
        // One reading for the mark and its `data-pattern`, so what a test reads is what is drawn.
        const knows = pip < known;
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the pips are identical marks, so their place is their identity
            key={pip}
            data-pattern={knows ? "known" : "unknown"}
            className={cn(
              "h-4 w-1.5 rounded-xs",
              knows ? "bg-(--p)" : "bg-paper-sunken ring-1 ring-line-strong ring-inset",
            )}
          />
        );
      })}
    </span>
  );
}

/**
 * One dimension's cell, for the Cast's matrix and the CastCard's plate. Unset, it reads `—`, and
 * "not set" to a screen reader. Set, it reads its value in mono; a threshold adds its provenance
 * tag and its mini gauge, and K1 draws its 12 pips before the count. The tag explains its source in
 * a hint (#243).
 *
 * `card` is the CastCard's room: the tag says "· no source" for `folk` and `llm`, a soft threshold
 * shows its softness, and patterns read against 12. The matrix's narrow cell gets the bare id,
 * dotted when unsourced, and its legend says what dotted means.
 */
export function DimensionValue({
  dimension,
  card = false,
}: {
  dimension: Dimension;
  card?: boolean;
}) {
  const { value, provenance, gauge, softness, known } = dimension;
  if (value === undefined) {
    return (
      <p className="mono text-ink-3">
        <span aria-hidden="true">—</span>
        <span className="sr-only">not set</span>
      </p>
    );
  }
  return (
    // The foot padding leaves the gauge its room under the value, on every row alike.
    <div className="relative flex flex-wrap items-center gap-x-(--space-2) pt-1.5 pb-2.25">
      {known === undefined ? null : <Pips known={known} />}
      <p className={cn("mono text-ink", known !== undefined && "ms-auto")}>
        {known !== undefined && card ? `${value}/${PATTERN_COUNT}` : value}
      </p>
      {card && softness !== undefined ? (
        <p className="mono text-ink-3">{`soft ${softness}`}</p>
      ) : null}
      {provenance === undefined ? null : (
        // In the matrix, raised over the link the Cast stretches over the column (`z-1`), so the
        // tag takes the pointer: hovering it opens its hint, and a click on it opens no Lens.
        <p className={cn("ms-auto flex", !card && "relative z-2")}>
          <ProvenanceTag provenance={provenance} bare={!card} />
        </p>
      )}
      {gauge === undefined ? null : <MiniGauge share={gauge} />}
    </div>
  );
}

/** A dimension's label and the rule it feeds, as the matrix's lead column and the card's plate set it. */
export function DimensionLabel({ label, rule }: { label: string; rule: string }) {
  return (
    <>
      <p className="label text-ink">{label}</p>
      <p className="mono-label text-ink-3">{rule}</p>
    </>
  );
}

/**
 * The `control` tag, beside the name of the persona core counts no constraint for (`constraintCount`
 * reads the profile, never its id); nothing otherwise.
 */
export function ControlTag({ profile }: { profile: Profile }) {
  return constraintCount(profile) === 0 ? (
    <p className="flex">
      <Tag variant="plain">control</Tag>
    </p>
  ) : null;
}

/**
 * The persona's spec sheet, where a persona is shown alone: its avatar, name, full description and
 * device, then a plate of every dimension it is defined by, each with the rule it feeds. The
 * heading's id, `cast-card-<id>`, stays apart from the Cast column's own.
 */
export function CastCard({ profile }: { profile: Profile }) {
  const headingId = `cast-card-${profile.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className="grid w-112 gap-(--space-4) rounded-lg border border-line bg-surface p-(--space-5) shadow-(--shadow-raised)"
      // A hover card renders in a portal under `<body>`, outside the column that sets the slot,
      // and the gauges and pips fill from `--p`, so the card sets it itself.
      style={slotStyle(slotOf(profile.id))}
    >
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-(--space-4)">
        <PersonaAvatar profile={profile} className="size-24" />
        <div className="grid gap-(--space-2)">
          <div className="flex flex-wrap items-center gap-(--space-2)">
            <h2 id={headingId} className="display-l text-ink">
              {profile.label}
            </h2>
            <ControlTag profile={profile} />
          </div>
          <p className="body text-pretty text-ink-2">{profile.description}</p>
          <p className="mono-label text-ink-3">{profile.device}</p>
        </div>
      </header>
      <dl className="grid border-t border-line">
        {castDimensions(profile).map((dimension) => (
          <div
            key={dimension.key}
            className="grid min-h-10 grid-cols-[--spacing(34)_minmax(0,1fr)] items-center border-b border-line"
          >
            <dt className="flex items-center justify-between gap-(--space-2) pe-(--space-4)">
              <DimensionLabel label={dimension.label} rule={dimension.rule} />
            </dt>
            <dd>
              <DimensionValue dimension={dimension} card />
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
