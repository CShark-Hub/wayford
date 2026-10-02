/**
 * The run detail's URL contract and the two readings its replay needs from a stored run.
 *
 * Every step number here is a `stepIndex`, never an array position: `?step=N`, the return of
 * `observedFrom` and the `:index` of the screenshot route. A step is found by its
 * `stepIndex`, because `RunResult` does not promise the indices run 0 to n-1 without a gap.
 */
import { type Action, type RunStep, StepIndex } from "@wayford/core";
import { z } from "zod";

/**
 * The run detail's search params, validated. `step` is the `stepIndex` of the step replayed. It
 * ends in `.catch(undefined)`, so a broken link opens the first step instead of an error screen,
 * as `PreviewSearch` does.
 */
export const RunDetailSearch = z.object({ step: StepIndex.optional().catch(undefined) });
export type RunDetailSearch = z.infer<typeof RunDetailSearch>;

/**
 * The step whose action left the page step `stepIndex` observed: the latest earlier step that is
 * not wasted, since a wasted step ran nothing and left the page as it was. None when no such step
 * exists (step 0, or wasted steps from the start): the step observed the start page. A step's own
 * `screenshotPath` is taken after its action landed, so the returned step's screenshot, when it
 * kept one, shows the observed page.
 */
export function observedFrom(steps: readonly RunStep[], stepIndex: number): RunStep | undefined {
  return steps
    .filter((step) => step.stepIndex < stepIndex)
    .toSorted((a, b) => b.stepIndex - a.stepIndex)
    .find((step) => !("wasted" in step));
}

/**
 * One line per action, an exhaustive switch over all seven `ACTION_TYPES`: `click e3`,
 * `doubleClick e2`, `type e4 "text"`, `scroll down`, `back`, `wait 500 ms`, `giveUp`. Typed text is
 * written as a JSON string, so quotes and line breaks in it stay visible.
 */
export function describeAction(action: Action): string {
  switch (action.type) {
    case "click":
      return `click ${action.ref}`;
    case "doubleClick":
      return `doubleClick ${action.ref}`;
    case "type":
      return `type ${action.ref} ${JSON.stringify(action.text)}`;
    case "scroll":
      return `scroll ${action.direction}`;
    case "back":
      return "back";
    case "wait":
      return `wait ${action.ms} ms`;
    case "giveUp":
      return "giveUp";
  }
}
