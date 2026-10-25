/**
 * The Extractor: a user story in, a `Task` out whose goal says what the person wants and not how
 * to get there (`AGENTS.md`, "A task must not contain the solution"). The model proposes a goal
 * and the screen names it removed; `Task` decides, with core's path-word and stripped-path checks.
 *
 * The model sees the prompt and the story, never `startUrl` or `success`: a success pattern is
 * full of screen names (`deliveries/archive`) the goal must not pick up, and a run is never
 * graded by what a model wrote.
 *
 * A goal `Task` refuses gets one repair round here, carrying its error. That round is separate
 * from the adapter's, which repairs an answer that misses `ExtractorAnswer`'s shape inside one
 * `complete`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ChatMessage, Llm } from "@wayford/agent";
import {
  HttpUrl,
  newId,
  pathWordsIn,
  SuccessCondition,
  strippedPathsIn,
  Task,
} from "@wayford/core";
import { z } from "zod";

/** The body of `POST /tasks`, built from core's schemas. */
export const TaskRequest = z
  .object({
    story: z.string().trim().min(1).max(2000),
    startUrl: HttpUrl,
    success: SuccessCondition,
  })
  .strict();
export type TaskRequest = z.infer<typeof TaskRequest>;

export type Extraction =
  | { ok: true; task: Task; rewritten: boolean }
  | { ok: false; error: string; goal: string; survived: string[] };

/** The prompt template, a file so a test can read what the model is told. */
export const EXTRACTOR_PROMPT_FILE = fileURLToPath(
  new URL("./extractor-prompt.md", import.meta.url),
);

// Read once, at module load, so a missing file fails at boot and not on the first request. Each
// CRLF is read as LF, so a clone checked out before `.gitattributes`, still holding CRLF
// (`core.autocrlf`), sends the bytes an LF one does.
const PROMPT = readFileSync(EXTRACTOR_PROMPT_FILE, "utf8").replaceAll("\r\n", "\n");

// A screen name listed with the word for what it is ("Archive tab") is checked by its name, so a
// goal keeping a bare "Archive" still fails. The first real run listed exactly that.
const TRAILING_UI_NOUN = /\s+(?:tab|menu|page|button|link|section|screen)s?$/iu;

// No keyword beyond types and `required`, so every strict `json_schema` mode takes it.
const ExtractorAnswer = z.object({ goal: z.string(), strippedPaths: z.array(z.string()) }).strict();
type ExtractorAnswer = z.infer<typeof ExtractorAnswer>;

export async function extractTask(llm: Llm, request: TaskRequest): Promise<Extraction> {
  const { story, startUrl, success } = request;
  // Minted once, so a repaired answer keeps the same id.
  const id = newId("task");
  const messages: ChatMessage[] = [
    { role: "system", content: PROMPT },
    { role: "user", content: story },
  ];

  const ask = async (sent: ChatMessage[]) =>
    (await llm.complete({ role: "extractor", messages: sent, schema: ExtractorAnswer })).value;

  const assemble = (answer: ExtractorAnswer) => ({
    id,
    goal: answer.goal,
    startUrl,
    success,
    sourceStory: story,
    // Trimmed, with empty entries dropped, so a stray "" is no reason to refuse.
    strippedPaths: answer.strippedPaths
      .map((path) => path.trim().replace(TRAILING_UI_NOUN, ""))
      .filter((path) => path !== ""),
  });

  const accept = (task: Task): Extraction => ({ ok: true, task, rewritten: task.goal !== story });

  const first = await ask(messages);
  const firstCheck = Task.safeParse(assemble(first));
  if (firstCheck.success) return accept(firstCheck.data);

  const repairText = `Your answer did not pass the task check:\n${z.prettifyError(firstCheck.error)}\nRewrite the goal so it says only what the person wants, and answer again with only the JSON object.`;
  const second = await ask([
    ...messages,
    { role: "assistant", content: JSON.stringify(first) },
    { role: "user", content: repairText },
  ]);
  const secondCandidate = assemble(second);
  const secondCheck = Task.safeParse(secondCandidate);
  if (secondCheck.success) return accept(secondCheck.data);

  const goal = second.goal.trim();
  return {
    ok: false,
    error: `The goal failed the task check after one repair round:\n${z.prettifyError(secondCheck.error)}`,
    goal,
    survived: withoutCaseDuplicates([
      ...pathWordsIn(goal),
      ...strippedPathsIn(goal, secondCandidate.strippedPaths),
    ]),
  };
}

/** "settings" and "Settings" once, in the first spelling. */
function withoutCaseDuplicates(terms: readonly string[]): string[] {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
