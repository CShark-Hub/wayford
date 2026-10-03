/**
 * "The Actor has no access to Scout's output" (`AGENTS.md`), as a test (`docs/PLAN.md` F4 AC3,
 * `tasks/s2-04-scout.md`). The Actor and Scout both live in this package, where the per-package
 * Biome rules cannot tell them apart and see direct imports only (`docs/STACK.md`, "Package
 * import rules"), so this walk is the guard.
 *
 * It starts from every module of the package that is not Scout's own, by file name: the barrel,
 * which io loads to run the Actor, the loop and its backends, and every by-hand command. So a new
 * module, s2-06's Jev backend or a new command, is covered without an edit. It follows every
 * relative import, and `@wayford/agent` itself through the package's `exports`, so
 * `@wayford/agent/scout`, Scout's entry, is followed like a relative import. Any other package is
 * not walked: none of them may import agent.
 *
 * A module it reaches fails the test when its file name says Scout, or when its source names
 * ground truth: the directory Scout writes, `runs/ground-truth/`, or core's `GroundTruth`, which
 * only a reader of Scout's output needs. Comments are read too, which errs on the safe side.
 *
 * The walker is filter's (`packages/filter/src/perceive-imports.test.ts`), copied: test code
 * cannot be imported across packages.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// ---------------------------------------------------------------------------
// The walker
// ---------------------------------------------------------------------------

/** A Scout module, by its file name. */
const SCOUT_MODULE = /scout/i;

/** Ground truth named in a source: `ground-truth`, `GroundTruth`, `groundTruth`, "ground truth". */
const GROUND_TRUTH = /ground[\s_-]?truth/i;

/** The package's own name, which a module may import itself by. */
const SELF = "@wayford/agent";

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

/** What the walk read, and what the Actor may not reach. */
interface Walk {
  /** Every module the walk read, sorted. */
  files: string[];
  /** One line per finding, `<file>: <why>`, sorted. */
  forbidden: string[];
}

/**
 * Walk the modules reachable from `entry` and list every Scout module and every mention of ground
 * truth among them.
 *
 * `read` gives a module's source by path, or `undefined` when there is none, so the same walk runs
 * on the package's files and on sources held in memory. `exports` is the package's own map, as
 * `package.json` has it (`"."`, `"./fake"` and `"./scout"`). Paths are POSIX, relative to the
 * package root.
 *
 * - A relative specifier is followed, each file once. A `.js` specifier names the `.ts` source
 *   beside it, as TypeScript resolves it. One the walk cannot find is listed, so the walk never
 *   stops short in silence; so is a subpath of the package that `exports` lacks.
 * - A dynamic `import()` of anything but one plain string is listed: it could load anything.
 */
function walkImports(
  entry: string,
  read: (path: string) => string | undefined,
  exports: Readonly<Record<string, string>>,
): Walk {
  const files = new Set<string>();
  const forbidden: string[] = [];
  const visit = (file: string, source: string): void => {
    files.add(file);
    if (SCOUT_MODULE.test(posix.basename(file))) forbidden.push(`${file}: a Scout module`);
    if (GROUND_TRUTH.test(source)) forbidden.push(`${file}: names ground truth`);
    for (const specifier of specifiers(source)) {
      if (specifier === undefined) {
        forbidden.push(`${file}: import() of a computed specifier`);
        continue;
      }
      let target: { path: string; source: string } | undefined;
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        target = resolveFrom(posix.join(posix.dirname(file), specifier), read);
      } else if (specifier === SELF || specifier.startsWith(`${SELF}/`)) {
        const mapped = exports[`.${specifier.slice(SELF.length)}`];
        target = mapped === undefined ? undefined : resolveFrom(posix.normalize(mapped), read);
      } else {
        continue;
      }
      if (target === undefined) forbidden.push(`${file}: ${specifier} (not found)`);
      else if (!files.has(target.path)) visit(target.path, target.source);
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

/** The module at `path`, with its source, or `undefined`. A `.js` path names its `.ts` source. */
function resolveFrom(
  path: string,
  read: (path: string) => string | undefined,
): { path: string; source: string } | undefined {
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

/** `package.json`'s `exports`, every target a plain string. */
function packageExports(): Record<string, string> {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8")) as {
    exports?: Record<string, unknown>;
  };
  const exports: Record<string, string> = {};
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    if (typeof target !== "string") throw new Error(`package.json maps ${subpath} to a non-string`);
    exports[subpath] = target;
  }
  return exports;
}

/** Every module of the package that is not a test and not Scout's own. */
function entries(): string[] {
  return readdirSync(join(PACKAGE_DIR, "src"))
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .filter((name) => !SCOUT_MODULE.test(name))
    .map((name) => `src/${name}`)
    .sort();
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

test("no module outside Scout's reaches Scout or names ground truth (F4 AC3)", () => {
  const starts = entries();
  // The barrel io runs the Actor from, the loop, a backend and the by-hand commands.
  expect(starts).toEqual(
    expect.arrayContaining([
      "src/index.ts",
      "src/actor-loop.ts",
      "src/llm-actor.ts",
      "src/run-one.ts",
      "src/calibrate.ts",
    ]),
  );
  const exports = packageExports();

  const reached = new Set<string>();
  for (const entry of starts) {
    const walk = walkImports(entry, readFromPackage, exports);
    expect(walk.forbidden, `from ${entry}`).toEqual([]);
    for (const file of walk.files) reached.add(file);
  }
  // The walk really walked: past the entries, into the modules the loop is built from.
  expect([...reached]).toEqual(
    expect.arrayContaining(["src/act.ts", "src/llm.ts", "src/run-context.ts", "src/success.ts"]),
  );
});

test("the walker flags Scout behind an import, the package's own entries, the directory and the schema", () => {
  const exports = {
    ".": "./src/index.ts",
    "./fake": "./src/fake-llm.ts",
    "./scout": "./src/scout.ts",
  };
  const sources = new Map([
    [
      "src/actor-loop.ts",
      `import { a } from "./a.js";
import { runActor } from "@wayford/agent";
export const load = (name: string) => import(name);
`,
    ],
    ["src/a.ts", `import { scout } from "./scout.js";\nexport const a = scout;\n`],
    ["src/scout.ts", `export const scout = 1;\n`],
    ["src/index.ts", `export * from "./b.js";\n`],
    [
      "src/b.ts",
      `import { join } from "node:path";\nexport const b = join("runs", "ground-truth");\n`,
    ],
    [
      "src/c.ts",
      `import type { GroundTruth } from "@wayford/core";\nexport type C = GroundTruth;\n`,
    ],
    ["src/llm-actor.ts", `import type { C } from "./c.js";\nimport { gone } from "./gone.js";\n`],
    ["src/x.ts", `import "@wayford/agent/scout";\nimport "@wayford/agent/gone";\n`],
  ]);
  const read = (path: string) => sources.get(path);

  expect(walkImports("src/actor-loop.ts", read, exports).forbidden).toEqual([
    "src/actor-loop.ts: import() of a computed specifier",
    "src/b.ts: names ground truth",
    "src/scout.ts: a Scout module",
  ]);
  expect(walkImports("src/llm-actor.ts", read, exports).forbidden).toEqual([
    "src/c.ts: names ground truth",
    "src/llm-actor.ts: ./gone.js (not found)",
  ]);
  // Scout's own subpath is followed; a subpath the package does not export is listed.
  expect(walkImports("src/x.ts", read, exports).forbidden).toEqual([
    "src/scout.ts: a Scout module",
    "src/x.ts: @wayford/agent/gone (not found)",
  ]);
  expect(walkImports("src/gone.ts", read, exports).forbidden).toEqual([
    "src/gone.ts: the entry is not there",
  ]);
});
