/**
 * `targetAppPage` and `pageUrlParam` (`docs/specs/2026-10-07-s4-09-io-any-url.md`, "The page"):
 * how a target-app page's URL is spelled, and which `url=` values are one page's key and which are
 * refused.
 */
import { describe, expect, test } from "vitest";
import { pageUrlParam, targetAppPage } from "./page-ref.js";

test("targetAppPage spells the page with the app's query, as a run's start URL is spelled", () => {
  expect(
    targetAppPage("http://localhost:5174", "/deliveries", "?contrast=2&fontPx=16&targetPx=36"),
  ).toStrictEqual({
    url: "http://localhost:5174/deliveries?contrast=2&fontPx=16&targetPx=36",
    onTargetApp: true,
  });
});

describe("pageUrlParam", () => {
  test("a URL is spelled as new URL(…).href spells it, so two spellings of one page share a key", () => {
    expect(pageUrlParam.parse("https://example.com")).toBe("https://example.com/");
    expect(pageUrlParam.parse("HTTPS://Example.COM:443/")).toBe("https://example.com/");
  });

  test("the query and the hash are kept, and the value is trimmed", () => {
    expect(pageUrlParam.parse("https://example.com/a?b=1&c=2#top")).toBe(
      "https://example.com/a?b=1&c=2#top",
    );
    expect(pageUrlParam.parse("  http://127.0.0.1:8080/page \n")).toBe(
      "http://127.0.0.1:8080/page",
    );
  });

  test("anything but http: and https:, a user or a password, or no URL at all is refused", () => {
    for (const raw of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<p>x</p>",
      "ftp://x/",
      "http://user:pw@example.com/",
      "http://user@example.com/",
      "not a url",
      "/deliveries",
      "",
    ]) {
      const parsed = pageUrlParam.safeParse(raw);
      expect(parsed.success, raw).toBe(false);
    }
  });

  test("each refusal says why", () => {
    const why = (raw: string) =>
      pageUrlParam.safeParse(raw).error?.issues.map((issue) => issue.message);
    expect(why("not a url")).toEqual(["url must be a whole URL, such as https://example.com/"]);
    // Core's `AxeUrl` from here on.
    expect(why("file:///etc/passwd")).toEqual(["Invalid URL"]);
    expect(why("http://user:pw@example.com/")).toEqual([
      "a page URL names no user and no password",
    ]);
  });
});
