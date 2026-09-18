import "dotenv/config";
import { loadConfig } from "./config.js";

export { loadConfig } from "./config.js";

/** Placeholder until m0-07 lands the Hono server. */
export function packageName(): string {
  return "@wayford/io";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  console.log(`${packageName()} configured for port ${cfg.PORT}. Server arrives in m0-07.`);
}
