import { expect, test } from "vitest";
import { packageName } from "./index.js";

test("target-app exports its name", () => {
  expect(packageName()).toBe("@wayford/target-app");
});
