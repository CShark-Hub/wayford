/**
 * The core fixtures the browser needs: the personas, the measured page and the goals.
 * `@wayford/core/fixtures` reads its files from disk with `node:fs`, so it is Node only and the
 * page cannot import it. Here Vite reads the same files at build time, through the `@core-fixtures`
 * alias in `vite.config.ts`: its YAML plugin turns each persona into plain data, and its own JSON
 * import does the same for the measurement and the tasks. Each is validated here as core's loader
 * does it, so the page gets the same fixtures and needs no Node polyfill and no YAML parser.
 */
import { PageMeasurement, Profile, Task } from "@wayford/core";
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

/**
 * The one file a glob of one path found, as `schema` reads it. Such a glob finds the file or
 * nothing, and nothing is an `Error` naming the fixture.
 */
function single<T>(sources: Record<string, unknown>, schema: ZodType<T>, name: string): T {
  const [entry] = Object.entries(sources);
  if (entry === undefined) throw new Error(`No ${name} fixture at @core-fixtures`);
  const [path, source] = entry;
  return parsed(schema, name, path, source);
}

/** The data of `measurement.json`, keyed by its path. */
const measurementSources = import.meta.glob<unknown>("@core-fixtures/measurement.json", {
  import: "default",
  eager: true,
});

/**
 * `measurementFixture` for the browser: the target app's `/deliveries` at its default parameters,
 * 1280 × 720, as the collector measured it. The preview perceives this page until s3-05 brings
 * the live one.
 */
export const bundledMeasurement: PageMeasurement = single(
  measurementSources,
  PageMeasurement,
  "PageMeasurement",
);

/** The data of `tasks.json`, keyed by its path. The file holds every task, as one array. */
const taskSources = import.meta.glob<unknown>("@core-fixtures/tasks.json", {
  import: "default",
  eager: true,
});

/**
 * `taskFixtures` for the browser: the target app's two goals, easy first, in file order. The
 * arena's goal presets come from it. The target app's `GOALS` is a copy of `tasks.json` in that
 * order (`packages/target-app/README.md`, "Goals"), so a preset is a goal the target app actually
 * has.
 */
export const bundledTasks: Task[] = single(taskSources, Task.array(), "Task[]");
