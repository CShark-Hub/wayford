import { expect, test } from "vitest";
import { packageName } from "./index.js";

test("agent exports its name", () => {
  expect(packageName()).toBe("@wayford/agent");
});
