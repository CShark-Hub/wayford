import { WayfordError } from "@wayford/core";
import { taskFixture } from "@wayford/core/fixtures";
import { describe, expect, test } from "vitest";
import { startUrlFor, TARGET_APP_DEFAULTS, TargetAppParams } from "./start-url.js";

/** The start URL for a task that starts at `startUrl`. */
function startUrlAt(startUrl: string, params: TargetAppParams = TARGET_APP_DEFAULTS): string {
  return startUrlFor({ startUrl }, params);
}

/** The error `startUrlFor` throws for `params`, checked to be the boundary's typed one. */
function paramsError(params: TargetAppParams): WayfordError {
  try {
    startUrlAt("http://localhost:5174/", params);
  } catch (error) {
    expect(error).toBeInstanceOf(WayfordError);
    expect((error as WayfordError).code).toBe("invalid_target_app_params");
    return error as WayfordError;
  }
  throw new Error("startUrlFor accepted parameters it should reject");
}

describe("startUrlFor", () => {
  test("the defaults on a fixture task give the task's acceptance URL, exactly", () => {
    expect(startUrlFor(taskFixture("task_past-order"), TARGET_APP_DEFAULTS)).toBe(
      "http://localhost:5174/?contrast=2&fontPx=16&targetPx=36",
    );
  });

  test("the path is kept", () => {
    expect(startUrlAt("http://localhost:5174/deliveries")).toBe(
      "http://localhost:5174/deliveries?contrast=2&fontPx=16&targetPx=36",
    );
  });

  test("a parameter already on the URL is replaced, a duplicate too, and all three land last in order", () => {
    const url = startUrlAt("http://localhost:5174/?targetPx=10&contrast=9&page=2&contrast=5", {
      contrast: 4.5,
      fontPx: 16,
      targetPx: 36,
    });
    expect(url).toBe("http://localhost:5174/?page=2&contrast=4.5&fontPx=16&targetPx=36");
  });

  test("any other query parameter and the hash are kept", () => {
    const url = new URL(startUrlAt("http://localhost:5174/deliveries?sort=date&q=a%20b#archive"));
    // Compared parsed, because `URLSearchParams` may re-encode the rest of the query (`%20` as `+`).
    expect([...url.searchParams]).toStrictEqual([
      ["sort", "date"],
      ["q", "a b"],
      ["contrast", "2"],
      ["fontPx", "16"],
      ["targetPx", "36"],
    ]);
    expect(url.pathname).toBe("/deliveries");
    expect(url.hash).toBe("#archive");
  });

  test.each([
    ["contrast", 0.99],
    ["contrast", 21.01],
    ["fontPx", 5],
    ["fontPx", 73],
    ["targetPx", 7],
    ["targetPx", 97],
  ] as const)("%s = %d is refused, since the app would clamp it silently", (name, value) => {
    const error = paramsError({ ...TARGET_APP_DEFAULTS, [name]: value });
    expect(error.message).toContain(name);
    expect(error.cause).toBeDefined();
  });
});

describe("TargetAppParams", () => {
  test("the ends of the README's ranges are inside them", () => {
    for (const params of [
      { contrast: 1, fontPx: 6, targetPx: 8 },
      { contrast: 21, fontPx: 72, targetPx: 96 },
    ]) {
      expect(TargetAppParams.safeParse(params).success).toBe(true);
    }
  });
});
