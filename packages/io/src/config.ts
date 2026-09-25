import { fileURLToPath } from "node:url";
import { config as readEnvFile } from "dotenv";
import { z } from "zod";

/** Hosts allowed plain `http`, so a local Ollama works. Anything else gets the key only over https. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// `abort: true` stops an invalid URL here, so the refine never calls `new URL` on it.
const LlmBaseUrl = z.url({ protocol: /^https?$/, abort: true }).refine((value) => {
  const { protocol, hostname } = new URL(value);
  return protocol === "https:" || LOOPBACK_HOSTS.has(hostname);
}, "must use https; plain http is allowed only for localhost");

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().min(1).default("file:./wayford.sqlite"),
  LLM_BASE_URL: LlmBaseUrl.default("https://openrouter.ai/api/v1"),
  // Optional until the LLM adapter lands (tasks/s2-01-llm-adapter.md). s2-01
  // moves these settings to @wayford/agent, whose parser fails at boot when the
  // key is missing. Nothing in io reads the key today, so requiring it here would
  // break `pnpm dev` and every test without buying anything. An empty value, as
  // `.env.example` ships it, counts as unset.
  LLM_API_KEY: z
    .string()
    .optional()
    .transform((value) => value || undefined),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Validate the environment once at boot. Fails with every offending
 * variable named, never with `undefined` at runtime.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return parsed.data;
}

/**
 * The repository's `.env`, found from this file rather than the working
 * directory, because pnpm starts every script inside its own package.
 */
export const ENV_FILE = fileURLToPath(new URL("../../../.env", import.meta.url));

/**
 * For entry points: read an `.env` file into `env`, then validate. The file
 * only fills in what `env` leaves unset, and a missing file is no error, so a
 * real environment variable always wins. This is the only place `.env` is
 * read. Keep this module free of side effects on import: the db layer imports
 * it, and its tests must not pick up a developer's real `.env`.
 */
export function loadConfigFromEnvFile(
  path: string = ENV_FILE,
  env: Record<string, string | undefined> = process.env,
): Config {
  readEnvFile({ path, processEnv: env, quiet: true });
  return loadConfig(env);
}
