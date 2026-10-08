/**
 * B4, misclick (`docs/RULES.md` stage 7, "B4 in detail" and "Where a miss lands"): the chance that
 * a click on a control smaller than the persona's motor limit misses, from the effective-width
 * model, and the neighbour the miss lands on. Pure: `behave` draws the roll, and once it has fired
 * geometry alone decides where the click lands, so a seed reproduces it.
 */
import type { Bbox, ElementRef, FullObservation } from "@wayford/core";
import { actionPoint, type Point } from "./act.js";

/** k in p = erf(k) − erf(k · W / L): ISO 9241-9's 4.133 standard deviations, halved, over √2. */
const MISS_SCALE = 4.133 / (2 * Math.SQRT2);

/** How many terms of erf's series are summed: within a few ulps over [0, k], all `W < L` reaches. */
const ERF_TERMS = 40;

/** 2/√π, written out, so no engine's square root or π enters `p`. */
const TWO_OVER_SQRT_PI = 1.1283791670955126;

/**
 * erf by its Maclaurin series, as RULES' "The arithmetic" fixes it, so every engine computes the
 * same bits and a stored roll's `fired` replays. Not for x much above k, where 40 terms fall short.
 */
function erf(x: number): number {
  // The first summand, t_0 / 1, is x itself.
  const summands = [x];
  let term = x;
  for (let n = 1; n < ERF_TERMS; n += 1) {
    term = (term * (-x * x)) / n;
    summands.push(term / (2 * n + 1));
  }
  // The smallest first, so the large terms do not swallow them.
  return summands.reduceRight((sum, summand) => sum + summand, 0) * TWO_OVER_SQRT_PI;
}

/** erf(k), 0.961219: the hit rate at the limit, the 96% the effective width holds. */
const HIT_RATE_AT_LIMIT = erf(MISS_SCALE);

/**
 * B4's p for a target of `targetPx` under a motor limit of `limitPx`, `0 ≤ targetPx < limitPx`
 * (RULES' "B4 in detail"). `misclickOf` asks only below the limit, and core holds `targetPx` at 0
 * or more.
 */
export function missProbability(targetPx: number, limitPx: number): number {
  // Floored at 0: a target a unit or two in the last place under the limit can round the two sums
  // a unit apart the wrong way, and core's roll audit takes no negative p. A roll at p 0 is still
  // drawn and logged, and never fires.
  return Math.max(0, HIT_RATE_AT_LIMIT - erf((MISS_SCALE * targetPx) / limitPx));
}

/** What B4 resolves for a click: its p and the neighbour a miss lands on. */
export interface Misclick {
  p: number;
  neighbour: ElementRef;
}

/**
 * B4 for a click on `ref` in the step's evidence, the neighbour chosen as RULES' "Where a miss
 * lands" says: undefined when the rule does not apply, so the click takes no draw. That is when the
 * target has no measured `targetPx` (a text block), when its `targetPx` is at or above the limit,
 * and when no shown control is in reach.
 *
 * A ref the evidence lacks throws a plain `Error`, since only a bug gets one here: the loop checks
 * every answer's ref with `checkActionRef` before it rolls.
 */
export function misclickOf(
  ref: ElementRef,
  page: FullObservation,
  limitPx: number,
): Misclick | undefined {
  // Only a shown element carries a ref (`FullObservation`), so no invisible one is found here.
  const target = page.elements.find((element) => element.ref === ref);
  if (target === undefined) {
    throw new Error(`the click names ${ref}, which step ${page.stepIndex}'s evidence lacks`);
  }
  const targetPx = target.metrics.targetPx;
  if (targetPx === undefined || targetPx >= limitPx) return undefined;
  const aim = actionPoint(target.bbox, page.viewport);
  // Squared distances against the squared reach: the same order and the same reach as the
  // distances themselves, with no square root.
  const reach = limitPx * limitPx;
  let nearest: { ref: ElementRef; squared: number } | undefined;
  for (const element of page.elements) {
    if (element === target || element.ref === undefined) continue;
    if (element.metrics.targetPx === undefined) continue;
    if (holds(element.bbox, aim)) continue;
    if (holds(target.bbox, actionPoint(element.bbox, page.viewport))) continue;
    const squared = squaredDistance(element.bbox, aim);
    // Strictly nearer, so a tie keeps the earlier element.
    if (squared <= reach && (nearest === undefined || squared < nearest.squared)) {
      nearest = { ref: element.ref, squared };
    }
  }
  if (nearest === undefined) return undefined;
  return { p: missProbability(targetPx, limitPx), neighbour: nearest.ref };
}

/** Whether `box` holds `point`: on its left and top edges, not its right and bottom ones. */
function holds(box: Bbox, point: Point): boolean {
  return (
    box.x <= point.x &&
    point.x < box.x + box.width &&
    box.y <= point.y &&
    point.y < box.y + box.height
  );
}

/** The squared Euclidean distance from `point` to the nearest point of `box`. */
function squaredDistance(box: Bbox, point: Point): number {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
  return dx * dx + dy * dy;
}
