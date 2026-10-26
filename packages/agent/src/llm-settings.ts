/**
 * The LLM adapter's settings: one endpoint, one key, and a model, temperature, reasoning effort
 * and timeout per role (`docs/PLAN.md`, "AI access"). The caller hands in the environment, so the
 * adapter never reads it itself and a test never picks up a developer's `.env`.
 *
 * The role defaults are the "While we build" column of the team's model ladder ("Wayford —
 * Model ladder for AI testing", Tomasz Nowakowski, 2026-09-25): a fresh `.env` needs only the
 * key, and escalating a role to a stronger model is one line of config.
 *
 * Beside the roles: which backend picks the Actor's actions, and Jev's pinned model id
 * (`docs/adr/0001-jev-actor-backend.md`).
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
  /** The bound on one attempt of a call, in ms. */
  timeoutMs: number;
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
 * The Actor's and Scout's bound on one attempt, unset. Calibration measured a median of about 2.6
 * to 3.4 s of model time per step on Luna at effort `high` (`tasks/s2-11-calibration-run.md`), so
 * 60 s is about twenty times that; Scout, at `max`, took about a minute for six attempts of two or
 * three steps (`tasks/s2-04-scout.md`). The adapter retries one timeout a round for these two
 * roles, so one step can wait about four times this bound plus backoffs: twice in the answer
 * round and twice in the repair round (`docs/adr/0005-llm-timeout-retry.md`, "Wall time"). That
 * and the step cap bound a run's wall time, now that B3 reads the simulated clock
 * (`docs/RULES.md`, "B3 in detail").
 */
const WALK_TIMEOUT_MS = 60_000;
// The Extractor's and Analyst's, unset: `max` effort on an Analyst-sized prompt can think for
// minutes, and a shorter limit cuts real calls.
const REASON_TIMEOUT_MS = 300_000;
// Node fires a longer timer, `AbortSignal.timeout`'s included, after 1 ms, which would abort
// every call at once.
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Temperature 1 on every role: the ladder's model is an OpenAI reasoning model, which can reject
 * any other value. That is config, not a provider branch in code.
 */
function roleSettings(ladderEffort: Effort, defaultTimeoutMs: number) {
  return z
    .object({
      model: z.string().default(LADDER_MODEL),
      temperature: z.coerce.number().min(0).max(2).default(1),
      effort: EffortSetting.default(ladderEffort),
      timeoutMs: z.coerce.number().int().positive().max(MAX_TIMER_MS).default(defaultTimeoutMs),
    })
    .transform(
      ({ effort, ...rest }): RoleSettings =>
        // Omitted rather than `undefined`, which `exactOptionalPropertyTypes` does not allow.
        effort === "default" ? rest : { ...rest, effort },
    );
}

/**
 * A Jev id that floats: `jev-latest` or the router, bare or under a prefix, such as the
 * `typesafe/` the System One API puts on a bare id, or OpenRouter's `~typesafe/` alias. Each
 * changes the model under a tuned run (ADR 0001).
 */
const FLOATING_JEV_ID = /(^|\/)jev-(latest|router)$/;

const JevModel = z
  .string()
  .refine(
    (id) => !FLOATING_JEV_ID.test(id),
    "must name a pinned Jev version such as typesafe/jev-1.13; an alias or the router changes the model under a tuned run (docs/adr/0001-jev-actor-backend.md)",
  );

/**
 * The backends that can pick the Actor's actions: `LLM_ACTOR_BACKEND`'s values, and the by-hand
 * commands' `--backend` (`docs/adr/0001-jev-actor-backend.md`).
 */
export const ActorBackendName = z.enum(["llm", "jev"]);
export type ActorBackendName = z.infer<typeof ActorBackendName>;

const Settings = z.object({
  baseUrl: LlmBaseUrl.default("https://openrouter.ai/api/v1"),
  apiKey: z
    .string({ error: "missing; put the OpenRouter key in the root .env" })
    // A key with a line break or another control character makes `fetch` reject the header,
    // and its error quotes the header whole, key included. So it is refused here, unechoed.
    .regex(/^[\x21-\x7E]+$/, "must be one line of printable characters, with no spaces"),
  roles: z.object({
    extractor: roleSettings("high", REASON_TIMEOUT_MS),
    scout: roleSettings("max", WALK_TIMEOUT_MS),
    actor: roleSettings("high", WALK_TIMEOUT_MS),
    analyst: roleSettings("max", REASON_TIMEOUT_MS),
  }),
  /** What picks the Actor's actions. A run set uses one, and nothing falls back to the other. */
  actorBackend: ActorBackendName.default("llm"),
  /** The model `decide` sends every question to, whatever role asks. */
  jevModel: JevModel.default("typesafe/jev-1.13"),
});

export type LlmSettings = z.output<typeof Settings>;

/**
 * `actor`, `effort` → `LLM_ACTOR_EFFORT`, and `actor`, `timeoutMs` → `LLM_ACTOR_TIMEOUT_MS`. One
 * spelling, to read a variable and to name it.
 */
function roleVariable(...parts: string[]): string {
  const words = parts.map((part) => part.replace(/(?<=[a-z])(?=[A-Z])/g, "_"));
  return `LLM_${words.join("_").toUpperCase()}`;
}

/**
 * The variable behind every setting outside the roles. One spelling, to read a variable and to
 * name it; a new setting without one fails to compile.
 */
const VARIABLES = {
  baseUrl: "LLM_BASE_URL",
  apiKey: "LLM_API_KEY",
  actorBackend: "LLM_ACTOR_BACKEND",
  jevModel: "LLM_JEV_MODEL",
} as const satisfies Record<Exclude<keyof LlmSettings, "roles">, string>;

/** The variable behind a parse issue, so each line names what to fix in `.env`. */
function variableAt(path: readonly PropertyKey[]): string {
  // A role's issue sits at ["roles", role, field].
  if (path[0] === "roles") return roleVariable(...path.slice(1).map(String));
  return VARIABLES[path[0] as keyof typeof VARIABLES];
}

/**
 * Validate the LLM settings once at boot. Fails with every offending variable named on its own
 * line, as io's `loadConfig` does, and never with a value: one of them is the key.
 */
export function parseLlmSettings(env: Record<string, string | undefined>): LlmSettings {
  // An empty value counts as unset and takes the default, as in io's config.
  const read = (name: string) => env[name] || undefined;
  const parsed = Settings.safeParse({
    ...Object.fromEntries(Object.entries(VARIABLES).map(([field, name]) => [field, read(name)])),
    roles: Object.fromEntries(
      LLM_ROLES.map((role) => [
        role,
        {
          model: read(roleVariable(role, "model")),
          temperature: read(roleVariable(role, "temperature")),
          effort: read(roleVariable(role, "effort")),
          timeoutMs: read(roleVariable(role, "timeoutMs")),
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
