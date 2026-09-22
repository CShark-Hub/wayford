import { describe, expect, test } from "vitest";
import { ACTION_TYPES, Action, ElementRef } from "./action.js";
import { actionFixtures } from "./fixtures/index.js";

describe("Action schema", () => {
  test("every action type has exactly one fixture and it validates", () => {
    expect(actionFixtures.map((a) => a.type).sort()).toEqual([...ACTION_TYPES].sort());
    for (const fixture of actionFixtures) {
      expect(Action.safeParse(fixture).success).toBe(true);
    }
  });

  test("an unknown action type is rejected", () => {
    expect(Action.safeParse({ type: "hover", ref: "e1" }).success).toBe(false);
  });

  test("click and type point at a ref", () => {
    expect(Action.safeParse({ type: "click" }).success).toBe(false);
    expect(Action.safeParse({ type: "doubleClick" }).success).toBe(false);
    expect(Action.safeParse({ type: "type", text: "hello" }).success).toBe(false);
    expect(Action.safeParse({ type: "type", ref: "e2" }).success).toBe(false);
    expect(Action.safeParse({ type: "type", ref: "e2", text: "hello" }).success).toBe(true);
  });

  test("a ref is a short handle, never a selector or a name", () => {
    expect(ElementRef.safeParse("e1").success).toBe(true);
    expect(ElementRef.safeParse("e42").success).toBe(true);
    expect(ElementRef.safeParse("42").success).toBe(false);
    expect(ElementRef.safeParse("#archive-link").success).toBe(false);
    expect(ElementRef.safeParse("Archive").success).toBe(false);
  });

  test("scroll goes up or down only", () => {
    expect(Action.safeParse({ type: "scroll", direction: "down" }).success).toBe(true);
    expect(Action.safeParse({ type: "scroll", direction: "left" }).success).toBe(false);
    expect(Action.safeParse({ type: "scroll" }).success).toBe(false);
  });

  test("wait is a positive whole number of milliseconds", () => {
    expect(Action.safeParse({ type: "wait", ms: 500 }).success).toBe(true);
    expect(Action.safeParse({ type: "wait", ms: 0 }).success).toBe(false);
    expect(Action.safeParse({ type: "wait", ms: 1.5 }).success).toBe(false);
  });

  test("back and giveUp carry no payload", () => {
    expect(Action.safeParse({ type: "back" }).success).toBe(true);
    expect(Action.safeParse({ type: "giveUp" }).success).toBe(true);
    expect(Action.safeParse({ type: "giveUp", reason: "lost" }).success).toBe(false);
  });

  test("an extra key on any action is rejected", () => {
    expect(Action.safeParse({ type: "click", ref: "e1", selector: "a" }).success).toBe(false);
  });
});
