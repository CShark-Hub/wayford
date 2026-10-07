import { createRequire } from "node:module";
import { dirname } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { parse } from "yaml";

/**
 * A YAML file becomes a JSON module at build time, parsed with the `yaml` package core's own
 * loader uses. The page gets plain data, which it still validates, and ships no YAML parser.
 */
function yamlAsData(): Plugin {
  return {
    name: "wayford:yaml-as-data",
    transform(source, id) {
      if (!id.endsWith(".yaml")) return null;
      return { code: `export default ${JSON.stringify(parse(source))};`, map: null };
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), yamlAsData()],
  resolve: {
    alias: {
      // The directory of `@wayford/core/fixtures`, for the globs in
      // src/bundled-fixtures.ts. It is resolved by package name, so the path
      // comes from core's `exports`; written as `../core` it would leave the
      // package by a relative path, which docs/STACK.md bans.
      "@core-fixtures": dirname(createRequire(import.meta.url).resolve("@wayford/core/fixtures")),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // The page reaches io as `/api/...` on its own origin, so there is no CORS
    // to configure and EventSource needs no credentials mode. Ports: docs/STACK.md.
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        // io refuses any `Host` but its own (ADR 0003, D7), so the proxy sends
        // io's, `localhost:3000`, not the page's `localhost:5173`.
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
