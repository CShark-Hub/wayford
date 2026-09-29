/**
 * The band arithmetic of `docs/RULES.md`, "Thresholds, bands and the roll": one measured value
 * against one profile threshold. P1, P3 and P4 all decide through `judgeCut`, so the arithmetic
 * is written once and read against RULES once.
 *
 * - "`>=` passes: a value exactly on the threshold is visible." A rule the element passes is not
 *   recorded, so a pass gives no outcome at all.
 * - A hard cut (`softness` absent or 0) never degrades: below the threshold is `invisible`.
 * - A soft cut's band runs from its floor, `threshold × (1 − softness)`, up to the threshold.
 *   Below the floor is `invisible`. In the band, at
 *   `position = (value − floor) / (threshold − floor)`, the element is `degraded` when
 *   `rolled < position`, otherwise `invisible`.
 *
 * The roll comes in as a function, not a number. `rolled` is `hash(run seed, element key)`, one
 * per element per run and shared by all its soft rules, so `perceive` draws it once per element,
 * and only when a soft rule fails. A pass or a hard cut never asks for it.
 *
 * "Every soft perception decision stores it": a soft failure always returns `rolled`, below the
 * floor too, where the roll decides nothing. A hard cut returns none, since it never drew one.
 */

/** What one failed rule gives an element: the state that rule alone gives, and its roll. */
export interface CutOutcome {
  state: "degraded" | "invisible";
  /** The element's roll, on every soft failure. Absent on a hard cut. */
  rolled?: number;
}

/**
 * Judge a measured value against a threshold. `undefined` when the value passes, so no decision
 * is recorded. A `ContrastThreshold` or `PixelThreshold` from the profile is passed as it is.
 */
export function judgeCut(
  value: number,
  cut: { threshold: number; softness?: number | undefined },
  roll: () => number,
): CutOutcome | undefined {
  const { threshold, softness } = cut;
  if (value >= threshold) return undefined;
  if (softness === undefined || softness === 0) return { state: "invisible" };
  const rolled = roll();
  const floor = threshold * (1 - softness);
  if (value < floor) return { state: "invisible", rolled };
  const position = (value - floor) / (threshold - floor);
  return { state: rolled < position ? "degraded" : "invisible", rolled };
}
