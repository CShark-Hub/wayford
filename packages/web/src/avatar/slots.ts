/**
 * A persona owns a slot, not a colour (`docs/DESIGN.md`, "Persona slots"). Each slot names three
 * tokens in `index.css`: `--persona-<slot>`, the fill; `-ink`, its name set in colour; `-soft`, the
 * tint behind its avatar. The tokens hold the colours and change with the theme; this file only
 * decides which slot a profile takes.
 *
 * The five fixtures are pinned by profile id, so a persona keeps its colour on every screen and in
 * every report. Any other profile takes the neutral fallback.
 */
import type { CSSProperties } from "react";

/** The five pinned slots, in `docs/DESIGN.md`'s order: Ada's, Vera's, Kai's, Milo's, Zoya's. */
const PERSONA_SLOTS = ["graphite", "cobalt", "raspberry", "jade", "violet"] as const;

/** A pinned slot, or the fallback any other profile takes. */
export type PersonaSlot = (typeof PERSONA_SLOTS)[number] | "fallback";

/** The fixtures' slots by profile id. A Map, so an id such as `constructor` finds nothing. */
const PINNED = new Map<string, PersonaSlot>([
  ["prof_ada", "graphite"],
  ["prof_vera", "cobalt"],
  ["prof_kai", "raspberry"],
  ["prof_milo", "jade"],
  ["prof_zoya", "violet"],
]);

/** The fixtures' slots by profile id; any other id takes "fallback". */
export function slotOf(profileId: string): PersonaSlot {
  return PINNED.get(profileId) ?? "fallback";
}

/** `var(--persona-<slot>)`, `var(--persona-<slot>-ink)` or `var(--persona-<slot>-soft)`. */
function slotColour(slot: PersonaSlot, tone: "fill" | "ink" | "soft" = "fill"): string {
  return tone === "fill" ? `var(--persona-${slot})` : `var(--persona-${slot}-${tone})`;
}

/** A profile's slot colour, by id: what a screen paints a persona's border, bar or accent with. */
export function profileColour(profileId: string): string {
  return slotColour(slotOf(profileId));
}

/**
 * `--p`, `--p-ink` and `--p-soft` for an inline style, as `components.css`'s `.wf-p-*` classes set
 * them. Whatever sits inside reads the slot through these three, the avatar among them.
 */
export function slotStyle(slot: PersonaSlot): CSSProperties {
  return {
    "--p": slotColour(slot),
    "--p-ink": slotColour(slot, "ink"),
    "--p-soft": slotColour(slot, "soft"),
  };
}
