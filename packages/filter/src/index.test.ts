import { expect, test } from "vitest";
import { measuredMetrics } from "./index.js";

test("filter measures the metrics a profile sets thresholds on", () => {
  expect(measuredMetrics()).toEqual(["contrast", "fontPx", "targetPx"]);
});
