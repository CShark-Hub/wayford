/**
 * The Cast (`docs/DESIGN.md`, "Screens"; `docs/design/screens/cast.html`): the bundled personas as
 * a lineup over a capability matrix, in fixture order.
 *
 * The screen is one column-major grid, so a persona's column is one element. A lead column holds
 * the screen's label and its one line, then each matrix row's label and the rule it feeds. Each
 * persona is a `<section>` spanning every row through a subgrid: its tile on top (avatar, name,
 * description clamped to three lines, device), then a `<dl>` of its eight dimensions, read through
 * `castDimensions` as the CastCard reads them. Every column shares the grid's row tracks, so the
 * rows line up across the matrix.
 *
 * Each column is one link to the Lens on its persona. The tile is a `<Link>` whose `::after` is
 * stretched over the column, so a click anywhere in it opens `/lens?persona=<id>`, and the column
 * draws the hover ground and the focus ring for it. The link is named by the persona's name and
 * "open in the Lens", and described by the description. The tile itself is raised above the
 * stretch: hovering it opens the persona's CastCard beside it, and hovering the matrix does not.
 *
 * The personas are bundled, so the screen fetches nothing and has no loading, empty or fault state.
 */
import { createRoute, Link } from "@tanstack/react-router";
import type { Profile } from "@wayford/core";
import { cn } from "cn";
import { HoverCard } from "radix-ui";
import { useState } from "react";
import { slotOf, slotStyle } from "../avatar/slots.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { castDimensions, DIMENSION_ROWS } from "../cast/dimensions.js";
import { CastCard, ControlTag, DimensionLabel, DimensionValue } from "../components/cast-card.js";
import { CertaintyGlyph } from "../components/certainty.js";
import { count } from "../components/outcome-words.js";
import { PersonaAvatar } from "../components/persona-avatar.js";
import { rootRoute } from "../shell.js";

// The reference's grid: a 168 px lead column, then one column per persona with no gap between, so
// the row lines run unbroken; the lineup row, then a row of at least 40 px per dimension. The
// counts come in as variables, since a class is fixed at build time.
const GRID =
  "grid grid-cols-[--spacing(42)_repeat(var(--personas),minmax(0,1fr))] grid-rows-[auto_repeat(var(--rows),minmax(--spacing(10),auto))]";

/**
 * A matrix row's line: a `line` hairline under every row, a `line-strong` one over the first,
 * drawn per cell so the lead column and every persona's column draw the same rule.
 */
function rowLine(row: number): string {
  return cn("border-b border-line", row === 0 && "border-t border-t-line-strong");
}

/**
 * One persona's column: the tile, a link to the Lens stretched over the whole column, and the
 * persona's eight dimensions under it. The column takes `surface` while the link is hovered and
 * draws the focus ring while it has keyboard focus; the link draws neither itself.
 */
function CastColumn({ profile }: { profile: Profile }) {
  const headingId = `cast-${profile.id}`;
  const lensId = `${headingId}-lens`;
  const descriptionId = `${headingId}-description`;
  // Held here, so keyboard focus on the link opens the card as hovering the tile does: the clamped
  // description is whole only in the card. Only keyboard focus: a mouse press focuses the link too,
  // and a middle click, which opens the Lens in a new tab, would leave the card open over the matrix.
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-labelledby={headingId}
      className="relative isolate row-span-full grid grid-rows-subgrid rounded-lg transition-colors has-[a:hover]:bg-surface has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-focus-ring has-[a:focus-visible]:outline-offset-2"
      style={slotStyle(slotOf(profile.id))}
    >
      {/* The root renders no element. It holds the card outside the link, so a click in the card,
          which React bubbles through the portal to its parents, never follows the link. */}
      <HoverCard.Root openDelay={500} open={open} onOpenChange={setOpen}>
        {/* The stretch is raised over the cells, whose values are positioned for their gauges and
            would otherwise take the pointer; `isolate` on the column keeps both layers inside it. */}
        <Link
          to="/lens"
          search={{ persona: profile.id }}
          aria-labelledby={`${headingId} ${lensId}`}
          aria-describedby={descriptionId}
          onFocus={(event) => {
            if (event.currentTarget.matches(":focus-visible")) setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          className="block p-(--space-3) after:absolute after:inset-0 after:z-1 after:rounded-lg focus-visible:outline-none"
        >
          {/* A `<div>`, not Radix's default `<a>`, which would nest a link in the link. Raised over
              the link's `::after`, so only the tile opens the card, never the matrix. */}
          <HoverCard.Trigger asChild>
            <div className="relative z-2 grid justify-items-start gap-1.5">
              <PersonaAvatar profile={profile} className="size-21" />
              <div className="mt-1.5 flex items-center gap-(--space-2)">
                <h2 id={headingId} className="display-l text-ink">
                  {profile.label}
                </h2>
                <ControlTag profile={profile} />
              </div>
              {/* Clamped on screen, whole in the DOM, so a screen reader reads all of it; the
                  hover card shows it whole too. */}
              <p id={descriptionId} className="body line-clamp-3 text-pretty text-ink-2">
                {profile.description}
              </p>
              <p className="mono-label text-ink-3">{profile.device}</p>
            </div>
          </HoverCard.Trigger>
          <span id={lensId} className="sr-only">
            open in the Lens
          </span>
        </Link>
        <HoverCard.Portal>
          <HoverCard.Content
            side="right"
            align="start"
            sideOffset={12}
            collisionPadding={16}
            className="z-(--z-overlay)"
          >
            <CastCard profile={profile} />
          </HoverCard.Content>
        </HoverCard.Portal>
      </HoverCard.Root>
      {/* Each cell a grid item of the column's subgrid, so it sits on its row's track. */}
      <dl className="contents">
        {castDimensions(profile).map((dimension, row) => (
          <div key={dimension.key} className={cn("flex items-center px-(--space-3)", rowLine(row))}>
            <dt className="sr-only">{`${dimension.label}, ${dimension.rule}`}</dt>
            <dd className="min-w-0 flex-1">
              <DimensionValue dimension={dimension} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * What the matrix's marks mean, as the reference's foot says it, `space-5` under the matrix, with
 * `llm` beside `folk`, since both draw the dotted tag. Each item is a `<p>`, so `check:self`
 * measures it.
 */
function Legend() {
  return (
    <footer className="flex flex-wrap items-center gap-x-(--space-5) gap-y-(--space-2) pt-(--space-5)">
      <p className="flex items-center gap-(--space-2) mono-label text-ink-2">
        <CertaintyGlyph line="measured" />
        sourced threshold
      </p>
      <p className="flex items-center gap-(--space-2) mono-label text-ink-2">
        <CertaintyGlyph line="soft" />
        folk / llm · no source
      </p>
      <p className="body text-ink-3">— not set</p>
      <p className="flex items-center gap-1.5 body text-ink-3">
        <span aria-hidden="true" className="h-3.5 w-(--stroke-post) rounded-xs bg-signal" />
        threshold
      </p>
      <p className="ms-auto mono-label text-ink-3">
        {`${count(bundledProfiles.length, "persona")} · fixtures · core/src/fixtures/profiles`}
      </p>
    </footer>
  );
}

/**
 * The bundled personas as a lineup over the capability matrix, then the matrix's legend. The page
 * column's top padding is `space-3`, not the other screens' `space-5`: each column's own `space-3`
 * around its tile makes up the rest, so the avatars sit `space-5` under the top bar, where the
 * reference draws them, and a hovered column's ground reaches `space-3` above them.
 */
export function PersonasScreen() {
  return (
    <div className="mx-auto max-w-(--content-max) px-(--space-6) pt-(--space-3)">
      <div
        className={GRID}
        style={{ "--personas": bundledProfiles.length, "--rows": DIMENSION_ROWS.length }}
      >
        <div className="row-span-full grid grid-rows-subgrid">
          {/* Set on the foot of the lineup row, level with the last line of the tiles. */}
          <div className="grid gap-(--space-2) self-end pb-(--space-4)">
            <h1 className="mono-label text-ink-2">01 · the cast</h1>
            <p className="body text-pretty text-ink-2">
              Each persona is a set of limits on what the model sees and does, never a character it
              is told to play.
            </p>
            {/* Only a threshold carries a source in the profile, so only those cells carry a tag.
                `docs/RULES.md` calls every other number folk, and the report's basis says so too
                (io's `provenanceOf`): said once here rather than left for an untagged cell to imply. */}
            <p className="body text-pretty text-ink-3">
              A threshold cites its source; every other number is folk.
            </p>
          </div>
          {DIMENSION_ROWS.map(({ key, label, rule }, row) => (
            <div
              key={key}
              className={cn(
                "flex items-center justify-between gap-(--space-2) pe-(--space-4)",
                rowLine(row),
              )}
            >
              <DimensionLabel label={label} rule={rule} />
            </div>
          ))}
        </div>
        {bundledProfiles.map((profile) => (
          <CastColumn key={profile.id} profile={profile} />
        ))}
      </div>
      <Legend />
    </div>
  );
}

export const personasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cast",
  component: PersonasScreen,
});
