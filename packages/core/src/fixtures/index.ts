/**
 * Fixtures are the shared vocabulary: one full, valid example per schema, read
 * from the same YAML files the profile builder writes. Every package imports
 * these instead of hand-rolling a persona in a test.
 *
 * The files are read from disk at import time, so this module is Node only and
 * lives behind its own entry point, `@wayford/core/fixtures`, instead of the
 * barrel: `filter`, `agent`, `web` and `target-app` typecheck the barrel
 * without node types, and a `node:fs` import in it breaks all four.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { ZodType } from "zod";
import { Action } from "../action.js";
import { Finding } from "../finding.js";
import { FullObservation } from "../observation.js";
import { Profile } from "../profile.js";
import { Task } from "../task.js";

/** Directory holding the persona YAML files. */
export const profilesFixtureDir = fileURLToPath(new URL("./profiles/", import.meta.url));

function readProfiles(): Profile[] {
  return readdirSync(profilesFixtureDir)
    .filter((name) => name.endsWith(".yaml"))
    .sort()
    .map((name) => {
      const source = readFileSync(`${profilesFixtureDir}${name}`, "utf8");
      const parsed = Profile.safeParse(parse(source));
      if (!parsed.success) {
        throw new Error(`Fixture ${name} does not match the Profile schema:\n${parsed.error}`);
      }
      return parsed.data;
    });
}

/** The personas of `docs/RULES.md`, alphabetical by file name. */
export const profileFixtures: Profile[] = readProfiles();

export function profileFixture(id: string): Profile {
  const found = profileFixtures.find((p) => p.id === id);
  if (!found) throw new Error(`No profile fixture ${id}`);
  return found;
}

// ---------------------------------------------------------------------------
// JSON fixtures: everything that is not a profile (docs/STACK.md)
// ---------------------------------------------------------------------------

function readJson<T>(name: string, schema: ZodType<T>): T {
  const source = readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
  const parsed = schema.safeParse(JSON.parse(source));
  if (!parsed.success) {
    throw new Error(`Fixture ${name} does not match its schema:
${parsed.error}`);
  }
  return parsed.data;
}

/** One action per member of `ACTION_TYPES`, in that order. */
export const actionFixtures: Action[] = readJson("actions.json", Action.array());

/**
 * The `/deliveries` page of the target app (URL contract in `m0-04`) as the
 * filter saw it for a persona with a 3:1 soft contrast threshold: the archive
 * link degraded, two elements removed, the rest visible.
 */
export const observationFixture: FullObservation = readJson("observation.json", FullObservation);

/** The two goals of the target app, easy first. See `tasks/m0-06-target-app.md`. */
export const taskFixtures: Task[] = readJson("tasks.json", Task.array());

export function taskFixture(id: string): Task {
  const found = taskFixtures.find((t) => t.id === id);
  if (!found) throw new Error(`No task fixture ${id}`);
  return found;
}

/** One per member of `FINDING_TYPES`, in that order, all about the hard goal. */
export const findingFixtures: Finding[] = readJson("findings.json", Finding.array());
