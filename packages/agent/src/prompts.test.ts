import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, onTestFinished, test, vi } from "vitest";
import { readPrompt } from "./prompts.js";

test("a prompt file checked out with CRLF reaches the model as it does from an LF checkout", async () => {
  // No checkout holds CRLF any more, CI's included, so every prompt file is served here with CRLF,
  // as a clone checked out before `.gitattributes` holds it (`core.autocrlf`).
  vi.resetModules();
  vi.doMock("node:fs", async (importOriginal) => {
    const fs = await importOriginal<typeof import("node:fs")>();
    const readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
      const read = fs.readFileSync(...args);
      return typeof read === "string" ? read.replace(/\r?\n/g, "\r\n") : read;
    }) as typeof fs.readFileSync;
    // The default export too, so `import fs from "node:fs"` reads with CRLF as well.
    const crlf = { ...fs, readFileSync };
    return { ...crlf, default: crlf };
  });
  onTestFinished(() => {
    vi.doUnmock("node:fs");
    vi.resetModules();
  });
  const crlf = await import("./prompts.js");

  const files = readdirSync(fileURLToPath(new URL("../prompts/", import.meta.url)));
  expect(files).toContain("actor-turn.md");
  for (const file of files) {
    expect(crlf.readPrompt(file).text, file).not.toContain("\r");
    expect(crlf.readPrompt(file), file).toStrictEqual(readPrompt(file));
  }
});
