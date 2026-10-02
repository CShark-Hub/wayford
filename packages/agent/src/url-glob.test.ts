import { WayfordError } from "@wayford/core";
import { describe, expect, test } from "vitest";
import { globToRegExp } from "./url-glob.js";

// The dialect itself is pinned row for row against Playwright's own matcher, in the parity table
// of `success.browser.test.ts`, which runs `globToRegExp` on every row. Here: what that table
// cannot hold, where url-glob differs from Playwright on purpose, and the globs it refuses.

/** The error `globToRegExp` throws for `glob`, checked to be the boundary's typed one. */
function globError(glob: string): WayfordError {
  try {
    globToRegExp(glob);
  } catch (error) {
    expect(error).toBeInstanceOf(WayfordError);
    expect((error as WayfordError).code).toBe("invalid_url_glob");
    return error as WayfordError;
  }
  throw new Error(`globToRegExp accepted ${JSON.stringify(glob)}, which it should reject`);
}

describe("a compiled glob", () => {
  test("a glob is compared as written, where Playwright would read it as a URL first", () => {
    // Playwright's `page.waitForURL` accepts all three. It resolves a glob that does not start
    // with `*` with the URL parser, which adds the slash after a bare origin and lowercases the
    // scheme and the host, and it takes an empty string for no condition at all. These stay out
    // of the parity table.
    expect(globToRegExp("http://localhost:5174").test("http://localhost:5174/")).toBe(false);
    const upper = "HTTP://LOCALHOST:5174/account/address";
    expect(globToRegExp(upper).test("http://localhost:5174/account/address")).toBe(false);
    expect(globToRegExp("").test("http://localhost:5174/")).toBe(false);
  });
});

describe("globToRegExp", () => {
  test("one expression gives the same answer every time, so a glob can be compiled once", () => {
    // A `g` or `y` flag would make `test` resume after its last match and answer false here.
    const expression = globToRegExp("**/account/address");
    const url = "http://localhost:5174/account/address";
    expect([expression.test(url), expression.test(url)]).toStrictEqual([true, true]);
  });

  test.each([
    [
      "**/{a,{b,c}}",
      'the "{" at character 7 opens inside another pair of braces, and braces cannot nest',
    ],
    ["**/a,b}", 'the "}" at character 7 closes no "{"'],
    ["**/{a,b", 'the "{" at character 4 is never closed'],
  ])("%s throws, naming the brace that does not pair", (glob, problem) => {
    const error = globError(glob);
    expect(error.message).toBe(
      `Invalid URL glob ${JSON.stringify(glob)}: ${problem}. Escape a literal brace with a backslash.`,
    );
  });
});
