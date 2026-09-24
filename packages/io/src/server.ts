/**
 * The io process: read the config, listen. Everything worth testing lives in
 * `app.ts`, so this file does nothing on import that a test would want.
 * `pnpm dev` runs it under `tsx watch`.
 */
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfigFromEnvFile } from "./config.js";

const config = loadConfigFromEnvFile();

// localhost, like the two Vite servers: the API has no auth and is not for the network.
serve({ fetch: createApp().fetch, port: config.PORT, hostname: "localhost" }, (info) => {
  console.log(`io listening on http://localhost:${info.port}`);
});
