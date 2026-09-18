import { expect, test } from "vitest";
import { App } from "./index.js";

test("web exports the App component", () => {
  expect(typeof App).toBe("function");
});
