import { expect, test } from "vitest";
import { packageName } from "./index.js";

test("core exports its name", () => {
  expect(packageName()).toBe("@wayford/core");
});
