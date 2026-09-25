import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { profileFixtures } from "@wayford/core/fixtures";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { migrateDatabase, openDatabase, sqliteFilePath } from "./database.js";
import { profiles } from "./schema.js";

// Four levels up from packages/io/src/db: the directory that holds `.env`.
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

describe("sqliteFilePath", () => {
  test("a relative path resolves from the repository root, where .env lives", () => {
    expect(sqliteFilePath("file:./wayford.sqlite")).toBe(join(repoRoot, "wayford.sqlite"));
    expect(sqliteFilePath("file:data/x.sqlite")).toBe(join(repoRoot, "data", "x.sqlite"));
  });

  test("an absolute path is kept as it is", () => {
    const file = join(tmpdir(), "absolute.sqlite");
    expect(sqliteFilePath(`file:${file}`)).toBe(file);
  });

  test("a file:// URL becomes its path, drive letter and all", () => {
    const file = join(tmpdir(), "url.sqlite");
    expect(sqliteFilePath(pathToFileURL(file).href)).toBe(file);
  });

  test(":memory: stays in memory", () => {
    expect(sqliteFilePath(":memory:")).toBe(":memory:");
  });
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wayford-db-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const [vera] = profileFixtures.filter((p) => p.id === "prof_vera");
if (!vera) throw new Error("the profile fixtures must include prof_vera");
const row = { id: vera.id, label: vera.label, document: vera };

test("migrating creates the SQLite file a file: URL names", () => {
  const file = join(dir, "wayford.sqlite");
  migrateDatabase(`file:${file}`);
  expect(existsSync(file)).toBe(true);
});

test("the migrated profiles table stores a Profile and returns it unchanged", () => {
  const url = `file:${join(dir, "wayford.sqlite")}`;
  migrateDatabase(url);
  const db = openDatabase(url);
  try {
    db.insert(profiles).values(row).run();
    expect(db.select().from(profiles).all()).toEqual([row]);
  } finally {
    db.$client.close();
  }
});

test("migrating an up-to-date database again keeps its data", () => {
  const url = `file:${join(dir, "wayford.sqlite")}`;
  migrateDatabase(url);
  const db = openDatabase(url);
  try {
    db.insert(profiles).values(row).run();
    migrateDatabase(url);
    expect(db.select().from(profiles).all()).toEqual([row]);
  } finally {
    db.$client.close();
  }
});
