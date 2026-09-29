/**
 * The browser-safety box of `tasks/s1-01-perceive.md`: the `./perceive` entry reaches its own
 * modules and `@wayford/core`, and nothing else. The web preview (`s3-01`) runs `perceive` in the
 * browser, so the preview applies the same code the Actor's observation comes from
 * (`docs/PLAN.md`, F2 AC3). A Node built-in, the Node-only `@wayford/core/fixtures` or Playwright
 * would break it there (`docs/STACK.md`, "Package import rules").
 *
 * This is the import half of the guard. `tsconfig.perceive.json` is the type-level half: it checks
 * the same entry with no Node and no DOM types.
 *
 * The walk starts from the file `package.json` maps `./perceive` to, so it follows the real
 * export. This test runs in Node and reads files; only what the entry reaches is held to the rule.
 */
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// ---------------------------------------------------------------------------
// The walker
// ---------------------------------------------------------------------------

/** The one package the entry may import by name, exactly, with no subpath. */
const ALLOWED_PACKAGE = "@wayford/core";

/** Whitespace and comments, which may stand between `from` or `import` and a specifier. */
const GAP = String.raw`(?:\s|/\*[\s\S]*?\*/|//[^\n]*(?:\n|$))*`;

/** `import … from "x"`, `export … from "x"` and `import "x"`, type-only ones included. */
const STATIC_SPECIFIER = new RegExp(String.raw`\b(?:from|import)${GAP}(["'])([^"'\r\n]*)\1`, "g");

/**
 * A dynamic `import(…)`. The specifier is captured only when the first argument is one plain
 * string (`\x60` is the backtick); anything else leaves group 2 unset.
 */
const DYNAMIC_IMPORT = new RegExp(
  String.raw`\bimport${GAP}\(${GAP}(?:(["'\x60])([^"'\x60\r\n]*)\1${GAP}(?=[,)]))?`,
  "g",
);

/** What the walk read, and what the entry may not reach. */
interface Walk {
  /** Every module the walk read, sorted. */
  files: string[];
  /** One line per specifier the entry may not reach, `<file>: <specifier>`, sorted. */
  forbidden: string[];
}

/**
 * Walk the modules reachable from `entry` and list every specifier the entry may not reach.
 *
 * `read` gives a module's source by path, or `undefined` when there is none, so the same walk
 * runs on the package's files and on sources held in memory. Paths are POSIX, relative to one
 * root.
 *
 * - A relative specifier (`./`, `../`) is followed, each file once. A `.js` specifier names the
 *   `.ts` source beside it, as TypeScript resolves it. One the walk cannot find is listed, so the
 *   walk never stops short in silence.
 * - Any other specifier is listed unless it is exactly `@wayford/core`. The walk does not go into
 *   core: the box allows that package as a whole. `zod` is reached through core, never directly.
 * - A dynamic `import()` of anything but one plain string is listed: it could load anything.
 * - Comments are not stripped, so a specifier written in a comment is listed too. That false
 *   positive is the safe side: a stripper that misreads a string or a regex literal as a comment
 *   could hide a real import.
 */
function walkImports(entry: string, read: (path: string) => string | undefined): Walk {
  const files = new Set<string>();
  const forbidden: string[] = [];
  const visit = (file: string, source: string): void => {
    files.add(file);
    for (const specifier of specifiers(source)) {
      if (specifier === undefined) {
        forbidden.push(`${file}: import() of a computed specifier`);
      } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
        const target = resolveRelative(file, specifier, read);
        if (target === undefined) forbidden.push(`${file}: ${specifier} (not found)`);
        else if (!files.has(target.path)) visit(target.path, target.source);
      } else if (specifier !== ALLOWED_PACKAGE) {
        forbidden.push(`${file}: ${specifier}`);
      }
    }
  };
  const source = read(entry);
  if (source === undefined) forbidden.push(`${entry}: the entry is not there`);
  else visit(entry, source);
  return { files: [...files].sort(), forbidden: forbidden.sort() };
}

/** Every specifier in a module's source. A computed dynamic `import()` gives `undefined`. */
function specifiers(source: string): (string | undefined)[] {
  const found: (string | undefined)[] = [];
  for (const match of source.matchAll(STATIC_SPECIFIER)) found.push(match[2] ?? "");
  for (const match of source.matchAll(DYNAMIC_IMPORT)) {
    const [, quote, specifier] = match;
    const computed = specifier === undefined || (quote === "`" && specifier.includes("${"));
    found.push(computed ? undefined : specifier);
  }
  return found;
}

/** The module a relative specifier names from `from`, with its source, or `undefined`. */
function resolveRelative(
  from: string,
  specifier: string,
  read: (path: string) => string | undefined,
): { path: string; source: string } | undefined {
  const path = posix.join(posix.dirname(from), specifier);
  const candidates = path.endsWith(".js") ? [`${path.slice(0, -3)}.ts`, path] : [path];
  for (const candidate of candidates) {
    const source = read(candidate);
    if (source !== undefined) return { path: candidate, source };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The package
// ---------------------------------------------------------------------------

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));

/** A file of this package by its POSIX path from the package root, or `undefined`. */
function readFromPackage(path: string): string | undefined {
  try {
    return readFileSync(join(PACKAGE_DIR, path), "utf8");
  } catch {
    return undefined;
  }
}

/** The file `package.json` maps `./perceive` to, as a POSIX path from the package root. */
function perceiveEntry(): string {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8")) as {
    exports?: Record<string, unknown>;
  };
  const target = manifest.exports?.["./perceive"];
  if (typeof target !== "string") {
    throw new Error("package.json must map ./perceive to one file, as a plain string");
  }
  return posix.normalize(target);
}

/** Sources held in memory, keyed by POSIX path. */
function inMemory(sources: Map<string, string>): (path: string) => string | undefined {
  return (path) => sources.get(path);
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

test("the ./perceive entry reaches only its own modules and @wayford/core", () => {
  const entry = perceiveEntry();
  const walk = walkImports(entry, readFromPackage);
  expect(walk.forbidden).toEqual([]);
  // The walk really walked: past the entry, into the modules `perceive` is built from. The set is
  // not pinned, so a later rule module behind the entry needs no edit here.
  expect(walk.files).toEqual(expect.arrayContaining([entry, "src/band.ts", "src/mask.ts"]));
  expect(walk.files.length).toBeGreaterThan(1);
});

test("the walker flags a Node built-in, a Node-only core entry and Playwright", () => {
  // The entry reaches each module through a different import form, so a form the walker missed
  // would leave that module unread and its line missing.
  const dirty = new Map([
    [
      "src/entry.ts",
      `import { hash } from "@wayford/core";
import { a } from "./a.js";
import "./b.js";
export type { C } from "./c.js";
export * from "./d.js";
export const e = () => import("./e.js");
import * as f from "./f.js";
export { g } from './g.js';
`,
    ],
    ["src/a.ts", `import { readFileSync } from "node:fs";\nexport const a = readFileSync;\n`],
    ["src/b.ts", `import { measurementFixture } from "@wayford/core/fixtures";\n`],
    ["src/c.ts", `import type { Page } from "playwright";\nexport type C = Page;\n`],
    ["src/d.ts", `export * from "fs";\n`],
    ["src/e.ts", `export const load = async () => await import("node:path");\n`],
    ["src/f.ts", `export const load = (name: string) => import(name);\n`],
    ["src/g.ts", `import { z } from "zod";\nexport const g = z.string();\n`],
  ]);
  const walk = walkImports("src/entry.ts", inMemory(dirty));
  expect(walk.files).toEqual([...dirty.keys()].sort());
  expect(walk.forbidden).toEqual([
    "src/a.ts: node:fs",
    "src/b.ts: @wayford/core/fixtures",
    "src/c.ts: playwright",
    "src/d.ts: fs",
    "src/e.ts: node:path",
    "src/f.ts: import() of a computed specifier",
    "src/g.ts: zod",
  ]);

  // Relative modules and `@wayford/core` only: a multi-line import list, `import type`, single
  // quotes, a module one directory down that imports back up, and a cycle.
  const clean = new Map([
    [
      "src/entry.ts",
      `import {
  type FullObservation,
  hash,
  worstState,
} from "@wayford/core";
import type { Profile } from '@wayford/core';
import { judge } from "./rules/judge.js";
export { mask } from "./mask.js";
`,
    ],
    ["src/rules/judge.ts", `import { mask } from "../mask.js";\nexport const judge = mask;\n`],
    [
      "src/mask.ts",
      `import { hash, type Seed } from "@wayford/core";\nimport type { judge } from "./rules/judge.js";\n`,
    ],
  ]);
  const cleanWalk = walkImports("src/entry.ts", inMemory(clean));
  expect(cleanWalk.forbidden).toEqual([]);
  expect(cleanWalk.files).toEqual(["src/entry.ts", "src/mask.ts", "src/rules/judge.ts"]);
});

test("the walker flags a relative import it cannot find", () => {
  const sources = new Map([
    ["src/entry.ts", `import { judge } from "./rules/judge.js";\n`],
    ["src/rules/judge.ts", `export { mask } from "../mask.js";\n`],
  ]);
  expect(walkImports("src/entry.ts", inMemory(sources)).forbidden).toEqual([
    "src/rules/judge.ts: ../mask.js (not found)",
  ]);
  // A missing entry is listed too: a walk that read nothing must not pass.
  expect(walkImports("src/gone.ts", inMemory(sources)).forbidden).toEqual([
    "src/gone.ts: the entry is not there",
  ]);
});
