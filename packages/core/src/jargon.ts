/**
 * A target app's jargon list, read by rule K2 (`docs/RULES.md`, stage 4): the
 * terms a team member would call shop jargon. A helper schema, not one of the
 * seven contracts. Both fixture loaders parse with it, Node's and web's.
 */
import { z } from "zod";

/**
 * Written by the team, so provenance `folk`. Each term is a word or a phrase,
 * matched whole and case-insensitively, so no two terms differ only in case.
 */
export const JargonList = z
  .object({
    provenance: z.literal("folk"),
    terms: z.array(z.string().refine((term) => term.trim() !== "", "a term is not blank")).min(1),
  })
  .strict()
  .refine(
    (list) => new Set(list.terms.map((term) => term.toLowerCase())).size === list.terms.length,
    {
      path: ["terms"],
      message: "terms are distinct, ignoring case",
    },
  );
export type JargonList = z.infer<typeof JargonList>;
