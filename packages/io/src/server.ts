/**
 * The io process: read the config, build the `Llm`, listen. Everything worth
 * testing lives in `app.ts`, so this file does nothing on import that a test
 * would want. `pnpm dev` runs it under `tsx watch`.
 */
import { serve } from "@hono/node-server";
import { createLlm, parseLlmSettings } from "@wayford/agent";
import pino from "pino";
import { createApp } from "./app.js";
import { loadConfigFromEnvFile } from "./config.js";

const config = loadConfigFromEnvFile();
// The root `.env` is already merged into `process.env` here, so its key is read too.
const llm = createLlm(parseLlmSettings(process.env), { logger: pino({ level: config.LOG_LEVEL }) });

// localhost, like the two Vite servers: the API has no auth and is not for the network.
serve({ fetch: createApp({ llm }).fetch, port: config.PORT, hostname: "localhost" }, (info) => {
  console.log(`io listening on http://localhost:${info.port}`);
});
