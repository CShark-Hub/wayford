import { z } from "zod";

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().min(1).default("file:./wayford.sqlite"),
  LLM_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  LLM_API_KEY: z.string().default(""),
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
