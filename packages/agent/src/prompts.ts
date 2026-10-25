/**
 * The one module that reads `packages/agent/prompts/`: the plain prompt files the Actor's
 * backends send, so neither backend imports the other to share them (s2-06). The files hold no
 * comments, since every byte of them reaches a model.
 *
 * The turn text is built here too, once, so the LLM backend's user message and Jev's state are
 * the same bytes (ADR 0001 §2, "same input as the LLM, nothing more").
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ActorTurn } from "./actor-backend.js";

/** A prompt file's text, and its name for an error to point at. */
interface Template {
  file: string;
  text: string;
}

/** `{{name}}`, a placeholder in a prompt file. */
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * A prompt file, read once at load. Found from this file, as `models.ts` finds `models.yaml`,
 * because pnpm starts a script inside the package and vitest runs from the root. Each CRLF is read
 * as LF, so a clone checked out before `.gitattributes`, still holding CRLF (`core.autocrlf`), sends
 * the model the bytes an LF one does, and the text is trimmed, so the file's last newline does not
 * reach the model.
 */
export function readPrompt(file: string): Template {
  const path = fileURLToPath(new URL(`../prompts/${file}`, import.meta.url));
  return { file, text: readFileSync(path, "utf8").replaceAll("\r\n", "\n").trim() };
}

/**
 * The template with each placeholder replaced by its value, in one pass over the template alone.
 * A value is never scanned, so a goal, a history or a page that spells `{{history}}` reaches the
 * model as written. The replacement is a function, so a `$&` in a value is not read as a
 * replacement pattern either.
 *
 * A placeholder the values lack throws a plain `Error` naming it and its file: only an edit to a
 * prompt file can bring one in, and the model would read the bare placeholder as words of ours.
 */
export function fill(template: Template, values: Readonly<Record<string, string>>): string {
  return template.text.replace(PLACEHOLDER, (_placeholder, name: string) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (value === undefined) {
      const given = Object.keys(values).map((known) => `{{${known}}}`);
      throw new Error(
        `prompts/${template.file} has a placeholder {{${name}}} that nothing fills. It is given ${given.join(", ")}.`,
      );
    }
    return value;
  });
}

const TURN = readPrompt("actor-turn.md");

/**
 * The turn as one text: the goal, then the history, then the page, `actor-turn.md` filled. It is
 * the LLM's user message and, from s2-06, Jev's state, so both backends read the same bytes.
 */
export function turnText(turn: ActorTurn): string {
  return fill(TURN, { goal: turn.goal, history: turn.history, page: turn.observationText });
}
