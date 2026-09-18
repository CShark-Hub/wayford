import { expect, test } from "vitest";
import { packageName } from "./index.js";

test("filter exports its name and sees core", () => {
  expect(packageName()).toBe("@wayford/filter (on @wayford/core)");
});
