import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("dotenv");
  vi.doUnmock("dotenv/config");
  vi.resetModules();
});

test("importing @wayford/io reads no .env file and starts no server", async () => {
  const readEnvFile = vi.fn();
  const sideEffectImport = vi.fn();
  vi.resetModules();
  vi.doMock("dotenv", () => ({ config: readEnvFile, default: { config: readEnvFile } }));
  vi.doMock("dotenv/config", () => {
    sideEffectImport();
    return {};
  });
  const before = { ...process.env };
  const io = await import("./index.js");
  expect(readEnvFile).not.toHaveBeenCalled();
  expect(sideEffectImport).not.toHaveBeenCalled();
  expect(process.env).toEqual(before);
  expect(typeof io.createApp).toBe("function");
});

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
