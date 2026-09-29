/**
 * `pnpm --filter @wayford/filter bench:perceive`: time `perceive` on `measurementFixture` and print
 * the average of 100 calls against the 5 ms budget (`tasks/s1-01-perceive.md`).
 *
 * A script, not a unit test, "so shared CI runners cannot make it flaky": it prints `within` or
 * `over` and exits 0 whatever the number. The budget is for a developer laptop.
 *
 * 20 warm-up calls come first, so the average is of optimised code rather than the first compile.
 * Call `i` uses persona `i % 4` (Ada, Milo, Vera, Zoya) and run seed `i + 1`, so the timed calls
 * cover seeds 1 to 100 and each persona 25 times. Their shown elements are summed and printed, so
 * every timed result is used and no call can be optimised away.
 */
import { measurementFixture, profileFixture } from "@wayford/core/fixtures";
import { perceive } from "../src/perceive.js";

const WARM_UP_CALLS = 20;
const TIMED_CALLS = 100;
const BUDGET_MS = 5;

const personas = ["prof_ada", "prof_milo", "prof_vera", "prof_zoya"].map(profileFixture);

/** Call `i`: persona `i % 4`, run seed `i + 1`. Returns how many elements it showed. */
function call(i: number): number {
  const profile = personas[i % personas.length];
  if (profile === undefined) throw new Error(`no persona for call ${i}`);
  const observation = perceive(measurementFixture, profile, i + 1);
  return observation.elements.filter((element) => element.ref !== undefined).length;
}

for (let i = 0; i < WARM_UP_CALLS; i += 1) call(i);

let shown = 0;
const start = performance.now();
for (let i = 0; i < TIMED_CALLS; i += 1) shown += call(i);
const average = (performance.now() - start) / TIMED_CALLS;

const verdict = average <= BUDGET_MS ? "within" : "over";
console.log(
  `perceive on measurementFixture: ${TIMED_CALLS} calls, average ${average.toFixed(3)} ms ` +
    `(budget ${BUDGET_MS} ms, ${verdict}), ${shown} elements shown`,
);
