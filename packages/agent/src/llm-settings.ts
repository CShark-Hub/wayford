/**
 * The LLM adapter's settings: one endpoint, one key, and a model, temperature and reasoning
 * effort per role (`docs/PLAN.md`, "AI access"). The caller hands in the environment, so the
 * adapter never reads it itself and a test never picks up a developer's `.env`.
 *
 * The role defaults are the "While we build" column of the team's model ladder ("Wayford —
 * Model ladder for AI testing", Tomasz Nowakowski, 2026-09-25): a fresh `.env` needs only the
 * key, and escalating a role to a stronger model is one line of config.
 */
import { LLM_ROLES, WayfordError } from "@wayford/core";
import { z } from "zod";

// OpenRouter's documented `reasoning.effort` values, all sent as they are.
const Effort = z.enum(["max", "xhigh", "high", "medium", "low", "minimal", "none"]);
type Effort = z.infer<typeof Effort>;

export type RoleSettings = {
  model: string;
  /** In [0, 2], `Sampling`'s range. Sent on every request, so the run records what was sent. */
  temperature: number;
  /** Absent: the request carries no `reasoning` field and the model uses its own. */
  effort?: Effort;
};

/** Hosts allowed plain `http`, so a local Ollama works. Anything else gets the key only over https. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// `abort: true` stops an invalid URL here, so the refine never calls `new URL` on it.
const LlmBaseUrl = z.url({ protocol: /^https?$/, abort: true }).refine((value) => {
  const { protocol, hostname } = new URL(value);
  return protocol === "https:" || LOOPBACK_HOSTS.has(hostname);
}, "must use https; plain http is allowed only for localhost, 127.0.0.1 and [::1]");

/** Every role's default model: the ladder's pick for all four while we build. */
const LADDER_MODEL = "openai/gpt-6-luna";

// `default` is spelled out rather than left empty, because an empty value means "unset, take
// the ladder's effort". It is for an endpoint without the field, such as Ollama or direct OpenAI.
const EffortSetting = z.enum([...Effort.options, "default"]);

/**
 * Temperature 1 on every role: the ladder's model is an OpenAI reasoning model, which can reject
 * any other value. That is config, not a provider branch in code.
 */
function roleSettings(ladderEffort: Effort) {
  return z
    .object({
      model: z.string().default(LADDER_MODEL),
      temperature: z.coerce.number().min(0).max(2).default(1),
      effort: EffortSetting.default(ladderEffort),
    })
    .transform(
      ({ effort, ...rest }): RoleSettings =>
        // Omitted rather than `undefined`, which `exactOptionalPropertyTypes` does not allow.
        effort === "default" ? rest : { ...rest, effort },
    );
}

const Settings = z.object({
  baseUrl: LlmBaseUrl.default("https://openrouter.ai/api/v1"),
  apiKey: z
    .string({ error: "missing; put the OpenRouter key in the root .env" })
    // A key with a line break or another control character makes `fetch` reject the header,
    // and its error quotes the header whole, key included. So it is refused here, unechoed.
    .regex(/^[\x21-\x7E]+$/, "must be one line of printable characters, with no spaces"),
  roles: z.object({
    extractor: roleSettings("high"),
    scout: roleSettings("max"),
    actor: roleSettings("high"),
    analyst: roleSettings("max"),
  }),
});

export type LlmSettings = z.output<typeof Settings>;

/** `actor`, `effort` → `LLM_ACTOR_EFFORT`. One spelling, to read a variable and to name it. */
function roleVariable(...parts: string[]): string {
  return `LLM_${parts.join("_").toUpperCase()}`;
}

/** The variable behind a parse issue, so each line names what to fix in `.env`. */
function variableAt(path: readonly PropertyKey[]): string {
  if (path[0] === "baseUrl") return "LLM_BASE_URL";
  if (path[0] === "apiKey") return "LLM_API_KEY";
  // A role's issue sits at ["roles", role, field].
  return roleVariable(...path.slice(1).map(String));
}

/**
 * Validate the LLM settings once at boot. Fails with every offending variable named on its own
 * line, as io's `loadConfig` does, and never with a value: one of them is the key.
 */
export function parseLlmSettings(env: Record<string, string | undefined>): LlmSettings {
  // An empty value counts as unset and takes the default, as in io's config.
  const read = (name: string) => env[name] || undefined;
  const parsed = Settings.safeParse({
    baseUrl: read("LLM_BASE_URL"),
    apiKey: read("LLM_API_KEY"),
    roles: Object.fromEntries(
      LLM_ROLES.map((role) => [
        role,
        {
          model: read(roleVariable(role, "model")),
          temperature: read(roleVariable(role, "temperature")),
          effort: read(roleVariable(role, "effort")),
        },
      ]),
    ),
  });
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${variableAt(i.path)}: ${i.message}`);
    throw new WayfordError("invalid_llm_settings", `Invalid LLM settings:\n${lines.join("\n")}`);
  }
  return parsed.data;
}
