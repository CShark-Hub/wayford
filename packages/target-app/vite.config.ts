import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { PAGES } from "./src/pages.js";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  // Multi-page: `/account` serves `account.html`, and an unknown path is a 404, never home.
  appType: "mpa",
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
  build: {
    rollupOptions: {
      input: Object.fromEntries(PAGES.map((page) => [page.file, `${root}${page.file}`])),
    },
  },
});
