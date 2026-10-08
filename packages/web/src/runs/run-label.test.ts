import { newId } from "@wayford/core";
import { describe, expect, test } from "vitest";
import { runLabel } from "./run-label.js";

describe("runLabel", () => {
  test("a minted run id reads as run … and its last six characters", () => {
    expect(runLabel("run_01m4bbcm8s1a0mcqac4v3fr6hk")).toBe("run …3fr6hk");
  });

  test("an id core's newId mints reads as its label", () => {
    // Ties the label's pattern to the minting: an id that changed shape would read whole again.
    expect(runLabel(newId("run"))).toMatch(/^run …[0-9a-z]{6}$/);
  });

  test("two runs minted in one race read apart, though their time parts match", () => {
    // The race's three runs from s3-16's started race: one time part, three random parts.
    const ada = runLabel("run_01m4d7mv898cngb6gq6fe05vjb");
    const kai = runLabel("run_01m4d7mv89sjsvt32qzw6gcrb2");
    const vera = runLabel("run_01m4d7mv89d0476zga6ewdkqjd");
    expect(new Set([ada, kai, vera]).size).toBe(3);
    for (const label of [ada, kai, vera]) expect(label).toHaveLength(11);
  });

  test.each([
    "run_vera-hard-1",
    "run_swp-vera-30-s1",
    "run_01m4bbcm8s1a0mcqac4v3fr6h",
    "run_01M4BBCM8S1A0MCQAC4V3FR6HK",
  ])("%s, not minted by newId, reads whole", (id) => {
    expect(runLabel(id)).toBe(id);
  });
});
