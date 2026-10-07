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
import { HttpUrl, TaskId } from "./primitives.js";

// ---------------------------------------------------------------------------
// Path words
// ---------------------------------------------------------------------------

/**
 * The path words named by the acceptance criterion of
 * `tasks/m0-04-task-finding-schemas.md`. `docs/PLAN.md` F3 AC1 is the
 * requirement behind it, but it names categories — screen names, "click",
 * arrows — and not this list; the seven words are the task file's reading of
 * it. Each one names a piece of interface or a step through it, so a goal
 * containing one is describing the solution.
 *
 * Frozen here rather than in the Extractor (M1, `io`) so that the component
 * stripping these and the schema refusing them cannot drift apart. Screen names
 * are the other half of F3 AC1 and cannot be enumerated: those the Extractor
 * finds per application and records in `strippedPaths`, and `Task` below checks
 * the goal against them.
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
 * A screen name as it appears in a sentence. The boundary is only asserted on
 * the ends that are word characters, so "Account" does not match "accounting"
 * and "/deliveries" still matches at the start of a phrase.
 *
 * Exported: K2 builds its vocabulary matcher from this pattern's source
 * (`packages/filter/src/vocabulary.ts`), so both match a term the same way.
 */
export function wholeTerm(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lead = /^\w/u.test(term) ? "\\b" : "";
  const tail = /\w$/u.test(term) ? "\\b" : "";
  return new RegExp(`${lead}${escaped}${tail}`, "iu");
}

/** Which of the stripped screen names a sentence still carries, as whole terms. */
export function strippedPathsIn(sentence: string, strippedPaths: readonly string[]): string[] {
  return strippedPaths.filter((path) => wholeTerm(path).test(sentence));
}

/**
 * The user-facing sentence, in the user's terms. Rejecting path words here
 * rather than only in the Extractor means a task that measures the wrong thing
 * cannot be stored, typed into the builder or posted to the API.
 */
export const Goal = z
  .string()
  .trim()
  .min(1)
  .superRefine((sentence, ctx) => {
    const found = pathWordsIn(sentence);
    if (found.length === 0) return;
    ctx.addIssue({
      code: "custom",
      message: `a goal states an intent, not a route through the interface; remove ${found.join(", ")}`,
    });
  });
export type Goal = z.infer<typeof Goal>;

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
export const SuccessCondition = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("urlMatches"),
      /** Glob in the Playwright `page.waitForURL` dialect. See `fixtures/tasks.json`. */
      pattern: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("selectorPresent"),
      /** CSS selector, evaluated on the page the run ended on. */
      selector: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("requestObserved"),
      method: HttpMethod,
      urlPattern: z.string().trim().min(1),
    })
    .strict(),
]);
export type SuccessCondition = z.infer<typeof SuccessCondition>;

/**
 * How a pattern that can match a page's URL starts: with a star, which covers any scheme and
 * origin, or with the scheme of a page a run can observe. Case counts: the browser reports a
 * scheme in lower case, and the glob compares as written.
 */
const MATCHABLE_START = /^(?:\*|https?:\/\/)/;

/**
 * Whether a `urlMatches` pattern, or a `requestObserved` one, could ever match: it is compared with
 * a whole absolute URL, so it must start with `*`, `http://` or `https://`. Playwright resolves a
 * relative pattern such as `/account/address` against the context's `baseURL`; a run's contexts
 * set none, so the pattern would stay as written and never match. A glob that opens with a brace
 * is refused too, even when each of its alternatives starts with a star: the stars can always come
 * first, before the braces.
 *
 * One rule for the Actor loop, which refuses such a condition before the first step (agent's
 * `success.ts`), and the Race's start panel, which holds back its check. Not a refinement of
 * `SuccessCondition`, so a task stored with such a pattern keeps parsing.
 */
export function matchableUrlPattern(pattern: string): boolean {
  return MATCHABLE_START.test(pattern);
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const Task = z
  .object({
    id: TaskId,
    goal: Goal,
    /** Where every run of this task starts, so two personas begin level. */
    startUrl: HttpUrl,
    success: SuccessCondition,
    /**
     * The story the goal was extracted from, kept verbatim. It is full of screen
     * names and that is correct: it is the evidence for what was stripped, so
     * the path-word check deliberately does not run over it.
     */
    sourceStory: z.string().trim().min(1).optional(),
    /** What the Extractor removed, so a reviewer can check it removed the right things. */
    strippedPaths: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()
  .superRefine((task, ctx) => {
    // The generic seven words are only half of F3 AC1. The other half is screen
    // names, which cannot be enumerated in advance — but a task that says it
    // stripped one has just told us what it is, so the goal is checked against
    // the list it carries. Whole terms only: stripping "Account" must not
    // outlaw a goal about accounting.
    const kept = strippedPathsIn(task.goal, task.strippedPaths ?? []);
    if (kept.length === 0) return;
    ctx.addIssue({
      code: "custom",
      path: ["goal"],
      message: `a goal cannot name the screens it says were stripped from it; remove ${kept.join(", ")}`,
    });
  });
export type Task = z.infer<typeof Task>;
