/**
 * `Action` is everything the Actor may do. Stage 7 of the filter pipeline
 * (behaviour, `docs/RULES.md`) rewrites one action into another — a `click`
 * may become a `doubleClick`, a `scroll` may be injected before a `giveUp` —
 * so the union is closed on purpose: a dice rule can only pick from this list.
 *
 * Payloads are minimal. Anything the Actor wants to say about *why* goes into
 * the narration event, not into the action, so the action stays measurable.
 */
import { z } from "zod";

/**
 * The handle the model uses to point at an element: `e1`, `e2`, ... assigned
 * per observation. Never a selector and never a name, so the Actor cannot
 * address anything the filter did not show it.
 */
export const ElementRef = z.string().regex(/^e[1-9][0-9]*$/, "a ref looks like e12");
export type ElementRef = z.infer<typeof ElementRef>;

export const ACTION_TYPES = [
  "click",
  "doubleClick",
  "type",
  "scroll",
  "back",
  "wait",
  "giveUp",
] as const;

export const ActionType = z.enum(ACTION_TYPES);
export type ActionType = z.infer<typeof ActionType>;

/**
 * The longest single `wait` the Actor may ask for. Ten seconds is longer than
 * any honest pause for a page to settle, and a small fraction of any realistic
 * run budget, so one answer cannot spend it in a single step. An engine guard,
 * not a persona threshold: it has no source and never moves into a profile.
 */
export const MAX_WAIT_MS = 10_000;

export const Action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), ref: ElementRef }).strict(),
  z.object({ type: z.literal("doubleClick"), ref: ElementRef }).strict(),
  z.object({ type: z.literal("type"), ref: ElementRef, text: z.string() }).strict(),
  z.object({ type: z.literal("scroll"), direction: z.enum(["up", "down"]) }).strict(),
  z.object({ type: z.literal("back") }).strict(),
  z.object({ type: z.literal("wait"), ms: z.number().int().positive().max(MAX_WAIT_MS) }).strict(),
  z.object({ type: z.literal("giveUp") }).strict(),
]);
export type Action = z.infer<typeof Action>;

/**
 * What the model answers with at every step. An object at the root because
 * strict `json_schema` modes reject a union there. `narration` is the model's
 * own account, stored as the `narration` event (interpretation, not
 * measurement); `action` is what gets measured. Refinements and some keywords
 * do not survive every provider, so every answer is re-parsed with this schema.
 * `z.toJSONSchema` emits `oneOf` for the `action` union; strict modes that
 * accept only `anyOf` need the adapter to rewrite it, which is safe because
 * the `type` literals are disjoint.
 */
export const ActorResponse = z.object({ narration: z.string(), action: Action }).strict();
export type ActorResponse = z.infer<typeof ActorResponse>;

/**
 * Result of checking an action's ref against the observation the Actor was
 * given. The failure carries only the ref the model itself wrote; the retry
 * wording lives with the Actor prompt, not here.
 */
export type RefCheck = { ok: true } | { ok: false; reason: "unknown_ref"; ref: ElementRef };

/**
 * Does the element this action points at exist in the observation the Actor
 * saw? `ElementRef` checks the shape only, so a hallucinated `e99` parses. This
 * turns it into a typed failure the loop can answer with one retry, instead of
 * a Playwright error. Actions without a ref always pass.
 *
 * Every element must carry a ref, so a full observation (where filtered-out
 * elements have none) does not typecheck: the check is against what the Actor
 * was shown, never against what the filter hid.
 */
export function checkActionRef(
  action: Action,
  observation: { readonly elements: readonly { readonly ref: ElementRef }[] },
): RefCheck {
  if (!("ref" in action)) return { ok: true };
  if (observation.elements.some((element) => element.ref === action.ref)) return { ok: true };
  return { ok: false, reason: "unknown_ref", ref: action.ref };
}
