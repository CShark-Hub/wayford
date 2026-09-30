import { DEVICE_KINDS } from "@wayford/core";
import { devices } from "playwright";
import { expect, test } from "vitest";
import { deviceContextOptions } from "./device.js";

// The one invariant, not Playwright's table restated: the options are a whole Chromium descriptor
// minus its browser type. The Milo and Ada browser test proves the phone and desktop mappings end
// to end.
test.each(DEVICE_KINDS)("%s is a Chromium descriptor without its browser type", (kind) => {
  const options = deviceContextOptions(kind);
  expect(options).not.toHaveProperty("defaultBrowserType");
  expect(Object.values(devices)).toContainEqual({ ...options, defaultBrowserType: "chromium" });
});
