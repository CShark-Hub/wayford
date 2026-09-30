/**
 * The persona fixtures for the browser. `@wayford/core/fixtures` reads its
 * files from disk with `node:fs`, so it is Node only and the page cannot import
 * it. Here Vite reads the same YAML files at build time, through the
 * `@core-fixtures` alias in `vite.config.ts`, and its YAML plugin turns each
 * one into plain data, which is validated here as core's loader does it. The
 * page gets the same profiles, and needs no Node polyfill and no YAML parser.
 *
 * s3-01 adds the measurement fixture here the same way: a glob of
 * `@core-fixtures/measurement.json`, parsed with `PageMeasurement`.
 */
import { Profile } from "@wayford/core";

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
  .map(([path, source]) => {
    const parsed = Profile.safeParse(source);
    if (!parsed.success) {
      throw new Error(`Fixture ${path} does not match the Profile schema:\n${parsed.error}`);
    }
    return parsed.data;
  });
