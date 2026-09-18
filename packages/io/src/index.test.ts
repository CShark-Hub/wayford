import { expect, test } from "vitest";
import { packageName } from "./index.js";

test("io exports its name", () => {
  expect(packageName()).toBe("@wayford/io");
});
