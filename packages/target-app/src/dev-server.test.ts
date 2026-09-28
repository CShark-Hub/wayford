import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PAGES } from "./pages.js";

// Starts the real dev server from `vite.config.ts` and checks the claims in README "Pages".
const root = fileURLToPath(new URL("..", import.meta.url));
const titleOf = (file: string): string =>
  /<title>[^<]*<\/title>/.exec(readFileSync(`${root}${file}`, "utf8"))?.[0] ?? "";

let server: ViteDevServer | undefined;
let base = "";

beforeAll(async () => {
  // Port 0: never collides with a running `pnpm dev` on 5174 (strictPort in vite.config.ts).
  server = await createServer({
    root,
    configFile: `${root}vite.config.ts`,
    logLevel: "silent",
    server: { port: 0, strictPort: false, hmr: false, watch: null },
  });
  await server.listen();
  base = server.resolvedUrls?.local[0] ?? "";
  if (base === "") throw new Error("the dev server reported no local URL");
});

afterAll(async () => {
  await server?.close();
});

const get = (path: string): Promise<Response> => fetch(new URL(path, base));

describe("dev server", () => {
  test.each(PAGES)("$path serves $file", async ({ path, file }) => {
    const response = await get(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    const body = await response.text();
    expect(titleOf(file)).not.toBe("");
    expect(body).toContain(titleOf(file));
    expect(body).toContain("/src/main.ts");
  });

  test.each(["/?contrast=3", "/deliveries?contrast=3&fontPx=20&targetPx=40"])(
    "%s, a contract path with parameters, is 200",
    async (path) => {
      expect((await get(path)).status).toBe(200);
    },
  );

  test("the files themselves are served too: /deliveries/archive.html is the archive page", async () => {
    const response = await get("/deliveries/archive.html");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(titleOf("deliveries/archive.html"));
  });

  test.each(["/nope", "/account/nope", "/account/", "/deliveries/?contrast=3", "/archive"])(
    "%s is 404 with an empty body, never the home page",
    async (path) => {
      const response = await get(path);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    },
  );

  test("/src/main.ts, the script every page loads, transforms", async () => {
    expect((await get("/src/main.ts")).status).toBe(200);
  });
});
