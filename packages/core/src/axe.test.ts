import { describe, expect, test } from "vitest";
import { AxeScan, AxeUrl } from "./axe.js";
import { axeScanFixture, axeScanFixtures } from "./fixtures/index.js";

describe("axeScanFixtures", () => {
  test("parse, and hold /deliveries with color-contrast and /settings/data, at the defaults", () => {
    expect(AxeScan.array().parse(axeScanFixtures)).toEqual(axeScanFixtures);
    expect(axeScanFixtures.map((fixture) => fixture.url)).toEqual([
      "http://localhost:5174/deliveries?contrast=2&fontPx=16&targetPx=36",
      "http://localhost:5174/settings/data?contrast=2&fontPx=16&targetPx=36",
    ]);
    const deliveries = axeScanFixtures[0];
    expect(deliveries?.violations.map((violation) => violation.ruleId)).toContain("color-contrast");
  });

  test("axeScanFixture finds a scan by its path", () => {
    expect(axeScanFixture("/settings/data")).toBe(axeScanFixtures[1]);
    expect(() => axeScanFixture("/settings")).toThrow("No axe scan fixture for /settings");
  });
});

describe("AxeUrl", () => {
  test.each([
    [
      "a target-app page with the app's query",
      "http://localhost:5174/settings/data?contrast=2&fontPx=16&targetPx=36",
    ],
    ["a hash, which names another page on a hash-routed app", "https://example.com/#/orders"],
    ["any site's root", "https://example.com/"],
  ])("a whole URL is a key: %s", (_, url) => {
    expect(AxeUrl.safeParse(url).success).toBe(true);
    expect(AxeScan.safeParse({ ...axeScanFixture("/deliveries"), url }).success).toBe(true);
  });

  // The same path on two sites is two pages (ADR 0003, D5), and one page has one key.
  test.each([
    ["a path alone", "/deliveries?contrast=2&fontPx=16&targetPx=36"],
    ["a protocol-relative URL", "//localhost:5174/deliveries?contrast=2&fontPx=16&targetPx=36"],
    ["ftp:", "ftp://example.com/"],
    ["file:", "file:///etc/passwd"],
    // `HttpUrl`'s rule: a host is a dotted name, an address or `localhost`.
    ["a single-label host", "http://intranet/"],
    ["a user and a password", "http://user:pw@localhost:5174/deliveries"],
    ["a user", "https://user@example.com/"],
    [
      "a spelling new URL changes",
      "HTTP://LOCALHOST:5174/deliveries?contrast=2&fontPx=16&targetPx=36",
    ],
    ["no trailing slash on the root", "https://example.com"],
    ["the scheme's default port", "https://example.com:443/"],
    ["no URL at all", "deliveries"],
  ])("%s is refused", (_, url) => {
    expect(AxeUrl.safeParse(url).success).toBe(false);
    expect(AxeScan.safeParse({ ...axeScanFixture("/deliveries"), url }).success).toBe(false);
  });

  test("each refusal says why, once: HttpUrl's own, then the user, then the spelling", () => {
    const why = (url: string) => AxeUrl.safeParse(url).error?.issues.map((issue) => issue.message);
    expect(why("/deliveries")).toEqual(["Invalid URL"]);
    expect(why("FTP://user@example.com")).toEqual(["Invalid URL"]);
    expect(why("https://user@example.com/")).toEqual(["a page URL names no user and no password"]);
    expect(why("https://example.com")).toEqual([
      "a page URL is spelled as new URL spells it: https://example.com/",
    ]);
  });
});
