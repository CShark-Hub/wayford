/**
 * What a persona's avatar shows, decided before any SVG is drawn: `avatar.tsx` turns these parts
 * into markup. The function is pure, so the same profile gives the same parts, and the same SVG,
 * on every machine (`docs/PLAN.md` F1 AC4).
 *
 * Two kinds of part, kept apart:
 *
 * - Seed parts, the tuft, brows and pattern, come from `rng(profile.seed)` and nothing else. They
 *   tell the personas apart. No dimension moves them, so a persona keeps its face while the
 *   preview and the sweep move its thresholds. Its colours are not parts: the avatar reads them
 *   from its persona slot's CSS variables (`slots.ts`).
 * - Dimension parts, the glasses, the held device and the hourglass, follow the profile and never
 *   draw. They show what the profile is defined by, a contrast threshold, a device and a time
 *   budget, and never a job title or a diagnosis.
 */
import { type DeviceKind, type Profile, rng } from "@wayford/core";

/** What `avatar.tsx` draws. The seed parts come first, in the order they are drawn. */
export type AvatarParts = {
  tuft: "curl" | "spikes" | "wave" | "sprout";
  brows: "arch" | "bar" | "none";
  pattern: "plain" | "stripes" | "dots";
  /**
   * From `perception.contrast`: none without a threshold, thicker as it rises. The part keeps the
   * threshold it was drawn from, so the avatar's title names it without asking the profile again.
   */
  glasses: { threshold: number; strokeWidth: number } | null;
  /** From `device`. */
  held: "phone" | "tablet" | null;
  /** From `behaviour.budgetSeconds`: the share of sand in the hourglass's top bulb, 0 to 1. */
  patience: number;
};

// Tufts rather than hairstyles, and no skin tone, age or mood among the parts: a trait drawn at
// random that lands on the persona at the far end of the scale would read as a claim about that
// trait. A variant is picked by its index, so the order of each list is part of the record.
const TUFTS = ["curl", "spikes", "wave", "sprout"] as const;
const BROWS = ["arch", "bar", "none"] as const;
const PATTERNS = ["plain", "stripes", "dots"] as const;

/** The thickest glasses, reached at a contrast threshold of 10:1. */
const GLASSES_MAX_STROKE = 6;

/** The budget that fills the hourglass's top bulb. */
const PATIENCE_FULL_SECONDS = 300;

/** A desktop is not carried, so a desktop persona holds nothing. */
const HELD: Record<DeviceKind, AvatarParts["held"]> = {
  desktop: null,
  tablet: "tablet",
  mobile: "phone",
};

/** Every part of `profile`'s avatar. The same profile always gives the same parts. */
export function avatarParts(profile: Profile): AvatarParts {
  // The draw order is part of the record, like the `rng` algorithm itself: a discarded draw, then
  // tuft, brows, pattern. A later seed part is drawn after `pattern`, never inserted before it, so
  // every existing persona keeps its looks.
  const draw = rng(profile.seed);
  // The first draw picked the avatar's hue before persona slots took over its colours. It is
  // still taken and thrown away, so the draws after it, and every persona's tuft, brows and
  // pattern, stay what they were.
  draw();
  const tuft = variant(TUFTS, draw());
  const brows = variant(BROWS, draw());
  const pattern = variant(PATTERNS, draw());
  const { contrast } = profile.perception;
  return {
    tuft,
    brows,
    pattern,
    glasses: contrast
      ? {
          threshold: contrast.threshold,
          strokeWidth: round2(Math.min(GLASSES_MAX_STROKE, 1 + contrast.threshold / 2)),
        }
      : null,
    held: HELD[profile.device],
    patience: round2(Math.min(1, profile.behaviour.budgetSeconds / PATIENCE_FULL_SECONDS)),
  };
}

function variant<T>(list: readonly T[], drawn: number): T {
  const picked = list[Math.floor(drawn * list.length)];
  // `rng` draws in [0, 1), so only a bug reaches this.
  if (picked === undefined) throw new RangeError(`a draw is in [0, 1), got ${drawn}`);
  return picked;
}

/**
 * Two decimals, so a part carries short numbers into the SVG: 70 s gives 0.23, not 0.2333….
 * `avatar.tsx` rounds its computed coordinates with it too, so the whole avatar keeps one rule.
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
