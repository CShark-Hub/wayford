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
import { Profile } from "../profile.js";

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

/** The three personas of `docs/RULES.md`, alphabetical by file name. */
export const profileFixtures: Profile[] = readProfiles();

export function profileFixture(id: string): Profile {
  const found = profileFixtures.find((p) => p.id === id);
  if (!found) throw new Error(`No profile fixture ${id}`);
  return found;
}
