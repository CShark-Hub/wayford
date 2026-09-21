/**
 * A `Task` says what the user wants, never how to get it. That distinction is
 * the measurement: a task carrying a route through the interface measures
 * instruction-following, and the run then says nothing about wayfinding
 * (`AGENTS.md`, "A task must not contain the solution").
 *
 * So `goal` is the one field the schema polices, and success is never "the
 * Actor said it worked" — it is one of three conditions the runner checks
 * against the page (`docs/PLAN.md` F3 AC2).
 */
import { z } from "zod";
import { TaskId } from "./primitives.js";

// ---------------------------------------------------------------------------
// Path words
// ---------------------------------------------------------------------------

/**
 * The path words of `docs/PLAN.md` F3 AC1. Each one names a piece of interface
 * or a step through it, so a goal containing one is describing the solution.
 *
 * Frozen here rather than in the Extractor (M1, `io`) so that the component
 * stripping these and the schema refusing them cannot drift apart. Screen names
 * are the other half of F3 AC1 and cannot be enumerated: those the Extractor
 * finds per application and records in `strippedPaths`.
 */
export const PATH_WORDS = ["button", "click", "menu", "settings", "tab", "->", "→"] as const;

export type PathWord = (typeof PATH_WORDS)[number];

/**
 * Matched on word boundaries with the common suffixes, so "clicking" trips and
 * "table" does not. Arrows are punctuation and are matched literally.
 */
const PATH_WORD_MATCHERS: readonly (readonly [PathWord, RegExp])[] = PATH_WORDS.map((word) => {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = /^[a-z]+$/.test(word) ? `\\b${escaped}(?:s|es|ed|ing)?\\b` : escaped;
  return [word, new RegExp(pattern, "iu")] as const;
});

/** Which path words a sentence carries. Empty means it states an intent. */
export function pathWordsIn(sentence: string): PathWord[] {
  return PATH_WORD_MATCHERS.filter(([, matcher]) => matcher.test(sentence)).map(([word]) => word);
}

/**
 * The user-facing sentence, in the user's terms. Rejecting path words here
 * rather than only in the Extractor means a task that measures the wrong thing
 * cannot be stored, typed into the builder or posted to the API.
 */
export const Goal = z
  .string()
  .min(1)
  .superRefine((sentence, ctx) => {
    const found = pathWordsIn(sentence);
    if (found.length === 0) return;
    ctx.addIssue({
      code: "custom",
      message: `a goal states an intent, not a route through the interface; remove ${found.join(", ")}`,
    });
  });

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export const HttpMethod = z.enum(HTTP_METHODS);
export type HttpMethod = z.infer<typeof HttpMethod>;

/**
 * Closed on purpose. A fourth member taking free text would let a run be graded
 * by asking a model whether it went well, which is the failure mode the Scout
 * and this union exist to rule out.
 */
export const SuccessCondition = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("urlMatches"),
      /** Glob in the Playwright `page.waitForURL` dialect. See `fixtures/tasks.json`. */
      pattern: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("selectorPresent"),
      /** CSS selector, evaluated on the page the run ended on. */
      selector: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("requestObserved"),
      method: HttpMethod,
      urlPattern: z.string().min(1),
    })
    .strict(),
]);
export type SuccessCondition = z.infer<typeof SuccessCondition>;

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const Task = z
  .object({
    id: TaskId,
    goal: Goal,
    /**
     * Where every run of this task starts, so two personas begin level.
     * Restricted to what Playwright can navigate to: bare `z.url()` accepts
     * `localhost:5174`, reading the host as a scheme.
     */
    startUrl: z.url({ protocol: /^https?$/ }),
    success: SuccessCondition,
    /**
     * The story the goal was extracted from, kept verbatim. It is full of screen
     * names and that is correct: it is the evidence for what was stripped, and
     * the only field of this schema the path-word rule does not apply to.
     */
    sourceStory: z.string().min(1).optional(),
    /** What the Extractor removed, so a reviewer can check it removed the right things. */
    strippedPaths: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type Task = z.infer<typeof Task>;
