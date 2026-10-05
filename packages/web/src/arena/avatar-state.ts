/**
 * The state a persona's avatar shows in the arena, as a pure function of its run's events so far
 * (`docs/PLAN.md` F6 AC2). No clock and no guess: the same events always give the same state.
 *
 * First match wins:
 *
 * 1. The run ended. `runFinished` with `success` is done, with `gave_up` or `budget_exceeded` gave
 *    up. `runFailed` is error, never gave up: the tool falling over is not the persona giving up.
 * 2. Stuck: the last `STUCK_STEPS` judged steps all left the page as it was.
 * 3. Moving: at least one action ran.
 * 4. Idle.
 *
 * A step left the page as it was when the next step's observation is the same page as its own
 * (every field of `FullObservation` but `stepIndex` and `screenshotPath`, compared as canonical
 * JSON) and the step typed nothing: typing changes a field's value, which an observation does not
 * carry, so a `type` action counts as a change. A wasted step typed nothing, so it left the page as
 * it was whenever the next observation matches. A step is judged once the next step's observation
 * has arrived, and not before: until then nothing says what it changed. The latest judged step is
 * the newest step with a following observation, and stuck needs it and the `STUCK_STEPS - 1` steps
 * before it, in a row.
 *
 * Stuck claims only that the persona's last 2 steps changed nothing the filter could see on the
 * page. Not that the persona is lost, nor that it will stay: the next observation that differs
 * takes it back to moving. The tile's line says what was counted, so the reader can judge.
 */
import type { FullObservation, RunEvent } from "@wayford/core";
import type { AvatarState } from "../avatar/state.js";

/** Judged steps in a row that left the page as it was make a persona stuck. */
export const STUCK_STEPS = 2;

/** What the avatar shows: its state, and where a stuck persona stayed. */
export type AvatarView = {
  state: AvatarState;
  /** The page a stuck persona stayed on, as `placeName` names it; `undefined` when not stuck. */
  stuckOn: string | undefined;
};

/** The avatar after `events`, the run's events so far in stream order, folded once. */
export function avatarView(events: readonly RunEvent[]): AvatarView {
  const end = events.findLast(
    (event) => event.type === "runFinished" || event.type === "runFailed",
  );
  if (end?.type === "runFailed") return { state: "error", stuckOn: undefined };
  if (end?.type === "runFinished") {
    return { state: end.outcome === "success" ? "done" : "gaveUp", stuckOn: undefined };
  }
  const stayedOn = stuckUrl(events);
  if (stayedOn !== undefined) return { state: "stuck", stuckOn: placeName(stayedOn) };
  const moved = events.some((event) => event.type === "actionPerformed");
  return { state: moved ? "moving" : "idle", stuckOn: undefined };
}

/** The state after `events`: `avatarView`'s, without the place. */
export function avatarState(events: readonly RunEvent[]): AvatarState {
  return avatarView(events).state;
}

/**
 * A page as the tile names it: its path. The place comes from an observation, whose `url` core holds
 * to an http(s) address, so the browser's error page or a blank page never reaches here.
 */
export function placeName(url: string): string {
  return new URL(url).pathname;
}

/**
 * The URL of the page the last `STUCK_STEPS` judged steps all left as it was, or `undefined` when
 * they did not, or when fewer steps than that have been judged.
 */
function stuckUrl(events: readonly RunEvent[]): string | undefined {
  const observed = new Map<number, FullObservation>();
  const typed = new Set<number>();
  for (const event of events) {
    if (event.type === "stepObserved") observed.set(event.stepIndex, event.observation);
    if (event.type === "actionPlanned" && event.performedAction.type === "type") {
      typed.add(event.stepIndex);
    }
  }
  if (observed.size === 0) return undefined;
  // The newest step with a following observation: the one before the newest observed.
  const latest = Math.max(...observed.keys()) - 1;
  for (let step = latest; step > latest - STUCK_STEPS; step -= 1) {
    const own = observed.get(step);
    const next = observed.get(step + 1);
    if (own === undefined || next === undefined || typed.has(step)) return undefined;
    if (pageOf(own) !== pageOf(next)) return undefined;
  }
  return observed.get(latest + 1)?.url;
}

/** What an observation saw of the page: all of it but the step it was taken at and its picture. */
function pageOf({ stepIndex: _step, screenshotPath: _picture, ...page }: FullObservation): string {
  return canonicalJson(page);
}

/** `value` as JSON with every object's keys sorted, so equal values give one string. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : 1)))
      : inner,
  );
}
