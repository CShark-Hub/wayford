/**
 * Rule V1 (`docs/RULES.md`): a run's context is real Playwright device emulation chosen from
 * `profile.device`, with the viewport, touch, mobile flag and user agent of a named descriptor.
 *
 * All three descriptors are Chromium, because vision emulation (P6) goes through CDP, and a Chrome
 * user agent is what the page then sees. Pixel 7 is a current phone, 412 px wide. The Galaxy Tab S4
 * is 712 px wide, above the target app's collapsed nav (640 px and under), so a tablet stays
 * distinct from a phone; the Tab S9's 640 px would not.
 */
import type { DeviceKind } from "@wayford/core";
import { devices } from "playwright";

const DEVICES = {
  desktop: "Desktop Chrome",
  tablet: "Galaxy Tab S4",
  mobile: "Pixel 7",
} as const satisfies Record<DeviceKind, string>;

/** A descriptor as `browser.newContext` takes it: the browser type is the caller's launch. */
export type DeviceContextOptions = Omit<(typeof devices)[string], "defaultBrowserType">;

/**
 * The Playwright descriptor for a device kind: viewport, screen when it has one, user agent,
 * scale, isMobile, hasTouch. Exported so a device can be emulated without a run.
 */
export function deviceContextOptions(kind: DeviceKind): DeviceContextOptions {
  const { defaultBrowserType: _, ...options } = devices[DEVICES[kind]];
  return options;
}
