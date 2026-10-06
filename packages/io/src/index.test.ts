import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("dotenv");
  vi.doUnmock("dotenv/config");
  vi.doUnmock("@hono/node-server");
  vi.doUnmock("playwright");
  vi.resetModules();
});

// Loading io's whole module graph inside the test went past vitest's default 5 s timeout on a busy
// machine (issue #82). Hence 20 s: the test checks what importing does, not how fast it is.
test("importing @wayford/io reads no .env file and starts no server", async () => {
  const readEnvFile = vi.fn();
  const sideEffectImport = vi.fn();
  const serve = vi.fn();
  vi.resetModules();
  vi.doMock("dotenv", () => ({ config: readEnvFile, default: { config: readEnvFile } }));
  vi.doMock("dotenv/config", () => {
    sideEffectImport();
    return {};
  });
  vi.doMock("@hono/node-server", () => ({ serve }));
  const before = { ...process.env };
  const io = await import("./index.js");
  expect(readEnvFile).not.toHaveBeenCalled();
  expect(sideEffectImport).not.toHaveBeenCalled();
  expect(serve).not.toHaveBeenCalled();
  expect(process.env).toEqual(before);
  expect(typeof io.createApp).toBe("function");
}, 20_000);

// The barrel decision of s4-03 (`docs/specs/2026-10-02-s4-03-runs-api.md`, decision log): the
// walk behind a report's route facts (`analyst-routes.ts`), the runs' Chromium and agent's runtime
// stay out, so a consumer of `@wayford/io` never loads a browser library.
test("importing @wayford/io loads no playwright", async () => {
  const loaded = vi.fn();
  vi.resetModules();
  vi.doMock("playwright", () => {
    loaded();
    return {};
  });
  const io = await import("./index.js");
  expect(loaded).not.toHaveBeenCalled();
  expect(typeof io.createApp).toBe("function");
}, 20_000);

test("no source file loads .env as an import side effect", () => {
  const src = fileURLToPath(new URL(".", import.meta.url));
  const files = readdirSync(src, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort();
  const offenders = files.filter((f) =>
    /["']dotenv\/config["']/.test(readFileSync(join(src, f), "utf8")),
  );
  expect(files).toContain("index.ts");
  expect(offenders).toEqual([]);
});
