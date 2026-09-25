import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // The page reaches io as `/api/...` on its own origin, so there is no CORS
    // to configure and EventSource needs no credentials mode. Ports: docs/STACK.md.
    proxy: {
      "/api": { target: "http://localhost:3000", rewrite: (path) => path.replace(/^\/api/, "") },
    },
  },
});
