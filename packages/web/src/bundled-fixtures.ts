/**
 * The core fixtures the browser needs: the personas and the measured page. `@wayford/core/fixtures`
 * reads its files from disk with `node:fs`, so it is Node only and the page cannot import it. Here
 * Vite reads the same files at build time, through the `@core-fixtures` alias in `vite.config.ts`:
 * its YAML plugin turns each persona into plain data, and its own JSON import does the same for the
 * measurement. Each is validated here as core's loader does it, so the page gets the same fixtures
 * and needs no Node polyfill and no YAML parser.
 */
import { PageMeasurement, Profile } from "@wayford/core";
import type { ZodType } from "zod";

/** `source` as `schema` reads it, or an `Error` naming the file and the schema, as core's loader. */
function parsed<T>(schema: ZodType<T>, name: string, path: string, source: unknown): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Fixture ${path} does not match the ${name} schema:\n${result.error}`);
  }
  return result.data;
}

/** The data of each persona file, keyed by its path. */
const profileSources = import.meta.glob<unknown>("@core-fixtures/profiles/*.yaml", {
  import: "default",
  eager: true,
});

/** The persona fixtures, alphabetical by file name like `profileFixtures`. */
export const bundledProfiles: Profile[] = Object.entries(profileSources)
  // The files share one directory, so path order is file-name order. `<`
  // compares code units, as core's bare `.sort()` does, and two keys of one
  // object are never equal.
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([path, source]) => parsed(Profile, "Profile", path, source));

/** The data of `measurement.json`, keyed by its path. A glob of one path finds it or nothing. */
const measurementSources = import.meta.glob<unknown>("@core-fixtures/measurement.json", {
  import: "default",
  eager: true,
});

function readMeasurement(): PageMeasurement {
  const [entry] = Object.entries(measurementSources);
  if (entry === undefined) throw new Error("No measurement fixture at @core-fixtures");
  const [path, source] = entry;
  return parsed(PageMeasurement, "PageMeasurement", path, source);
}

/**
 * `measurementFixture` for the browser: the target app's `/deliveries` at its default parameters,
 * 1280 × 720, as the collector measured it. The preview perceives this page until s3-05 brings
 * the live one.
 */
export const bundledMeasurement: PageMeasurement = readMeasurement();
