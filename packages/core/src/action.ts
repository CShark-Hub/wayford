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

export const Action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), ref: ElementRef }).strict(),
  z.object({ type: z.literal("doubleClick"), ref: ElementRef }).strict(),
  z.object({ type: z.literal("type"), ref: ElementRef, text: z.string() }).strict(),
  z.object({ type: z.literal("scroll"), direction: z.enum(["up", "down"]) }).strict(),
  z.object({ type: z.literal("back") }).strict(),
  z.object({ type: z.literal("wait"), ms: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("giveUp") }).strict(),
]);
export type Action = z.infer<typeof Action>;
