/**
 * Fixtures are the shared vocabulary: one full, valid example per schema, read
 * from the same YAML files the profile builder writes. Every package imports
 * these instead of hand-rolling a persona in a test.
 *
 * The files are read from disk at import time, so this module is Node only and
 * lives behind its own entry point, `@wayford/core/fixtures`, instead of the
 * barrel: `web` bundles the barrel for the browser, and `filter` and `agent`
 * typecheck it without node types, so a `node:fs` import in it breaks them.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { ZodType } from "zod";
import { Action } from "../action.js";
import { Finding } from "../finding.js";
import { PageMeasurement } from "../measurement.js";
import { FullObservation } from "../observation.js";
import { Profile } from "../profile.js";
import { RunEvent, RunResult } from "../run.js";
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
 * filter saw it for an illustrative profile, not one of the persona fixtures:
 * a 3:1 soft contrast threshold, a 16 px hard font cut and an attention cap of
 * 6. The archive link degraded, two elements removed by perception (one of
 * them failing two rules), three cut by attention, five below the fold, the
 * rest visible.
 */
export const observationFixture: FullObservation = readJson("observation.json", FullObservation);

/**
 * The `/deliveries` page of the target app at default parameters
 * (`?contrast=2&fontPx=16&targetPx=36`), 1280 × 720, scroll 0, before the
 * filter decided anything. Measured by hand on 2026-09-29 in Playwright's
 * Chromium after `load`, with the bundled Inter loaded. Contrast is rounded to
 * 3 decimals; boxes are as measured. `s1-02` replaces the numbers with
 * collector output.
 *
 * A text block's contrast and font size are those of the element that draws
 * its text: for a nav `li`, its link. Everything is inside the 720 px
 * viewport.
 *
 * Not measured, and why, for `s1-02` to keep or overturn:
 * - the `display: none` Menu button: a hidden element is not measured;
 * - the two `label`s, as separate text blocks. A label has no ARIA role for
 *   `AriaRole` or `getByRole`, so there is nothing to key it on. Each checkbox
 *   carries the contrast and font size of its label's text instead, so P1 and
 *   P3 still reach that text. This is a deviation from `docs/RULES.md`, "What
 *   is measured", open in #117;
 * - the footer's bare text: it is not a heading, paragraph, list item or label.
 */
export const measurementFixture: PageMeasurement = readJson("measurement.json", PageMeasurement);

/** The two goals of the target app, easy first. See `tasks/m0-06-target-app.md`. */
export const taskFixtures: Task[] = readJson("tasks.json", Task.array());

export function taskFixture(id: string): Task {
  const found = taskFixtures.find((t) => t.id === id);
  if (!found) throw new Error(`No task fixture ${id}`);
  return found;
}

/** One per member of `FINDING_TYPES`, in that order, all about the hard goal. */
export const findingFixtures: Finding[] = readJson("findings.json", Finding.array());

/**
 * One recorded run of the persona with a 3:1 soft contrast threshold against
 * the hard goal (`/deliveries/archive`, `m0-04`): four steps that never reach
 * the archive because its link stays degraded, ending in `gave_up`.
 */
export const runResultFixture: RunResult = readJson("run-result.json", RunResult);

/**
 * The same run as a live stream. `runResultFromEvents(runEventFixtures)` folds
 * to `runResultFixture`; that equality is the ring-and-dashboard contract.
 */
export const runEventFixtures: RunEvent[] = readJson("run-events.json", RunEvent.array());
