import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  ACTION_TYPES,
  Action,
  ActorResponse,
  checkActionRef,
  ElementRef,
  MAX_WAIT_MS,
} from "./action.js";
import { actionFixtures, observationFixture } from "./fixtures/index.js";
import { toActorObservation } from "./observation.js";

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
    expect(Action.safeParse({ type: "wait", ms: MAX_WAIT_MS }).success).toBe(true);
    expect(Action.safeParse({ type: "wait", ms: MAX_WAIT_MS + 1 }).success).toBe(false);
    expect(Action.safeParse({ type: "wait", ms: 1e9 }).success).toBe(false);
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

describe("ActorResponse schema", () => {
  const click = { type: "click", ref: "e1" };

  test("a narration and an action parse", () => {
    const answer = { narration: "I look for the account menu.", action: click };
    expect(ActorResponse.safeParse(answer).success).toBe(true);
  });

  test("both keys are required and nothing else is allowed", () => {
    expect(ActorResponse.safeParse({ action: click }).success).toBe(false);
    expect(ActorResponse.safeParse({ narration: "hm" }).success).toBe(false);
    expect(ActorResponse.safeParse(click).success).toBe(false);
    expect(ActorResponse.safeParse({ narration: "hm", action: click, thoughts: "x" }).success).toBe(
      false,
    );
  });

  test("its JSON Schema is rooted in a strict object", () => {
    const schema = z.toJSONSchema(ActorResponse) as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect([...(schema.required as string[])].sort()).toEqual(["action", "narration"]);
    expect(Object.keys(schema.properties as object).sort()).toEqual(["action", "narration"]);
    expect(schema).not.toHaveProperty("oneOf");
    expect(schema).not.toHaveProperty("anyOf");
  });

  test("the wait cap reaches the JSON Schema", () => {
    type Variant = { properties: { type: { const: string }; ms?: { maximum?: number } } };
    const schema = z.toJSONSchema(ActorResponse) as unknown as {
      properties: { action: { oneOf?: Variant[]; anyOf?: Variant[] } };
    };
    const variants = schema.properties.action.oneOf ?? schema.properties.action.anyOf ?? [];
    const wait = variants.find((variant) => variant.properties.type.const === "wait");
    expect(wait?.properties.ms?.maximum).toBe(MAX_WAIT_MS);
  });
});

describe("checkActionRef", () => {
  const shown = { elements: [{ ref: "e1" }, { ref: "e2" }, { ref: "e3" }] };
  const empty = { elements: [] };

  test("a ref the observation shows passes", () => {
    expect(checkActionRef({ type: "click", ref: "e1" }, shown)).toEqual({ ok: true });
    expect(checkActionRef({ type: "type", ref: "e3", text: "hi" }, shown)).toEqual({ ok: true });
  });

  test("a ref the observation lacks is a typed failure carrying only that ref", () => {
    expect(checkActionRef({ type: "click", ref: "e99" }, shown)).toEqual({
      ok: false,
      reason: "unknown_ref",
      ref: "e99",
    });
    expect(checkActionRef({ type: "doubleClick", ref: "e4" }, shown)).toEqual({
      ok: false,
      reason: "unknown_ref",
      ref: "e4",
    });
    expect(checkActionRef({ type: "click", ref: "e1" }, empty).ok).toBe(false);
  });

  test("an action without a ref always passes", () => {
    const refless: Action[] = [
      { type: "scroll", direction: "down" },
      { type: "back" },
      { type: "wait", ms: 500 },
      { type: "giveUp" },
    ];
    for (const action of refless) {
      expect(checkActionRef(action, empty)).toEqual({ ok: true });
    }
  });

  test("every ref of an Actor observation passes", () => {
    const observation = toActorObservation(observationFixture);
    expect(observation.elements.length).toBeGreaterThan(0);
    for (const element of observation.elements) {
      expect(checkActionRef({ type: "click", ref: element.ref }, observation)).toEqual({
        ok: true,
      });
    }
  });

  test("the full observation is rejected by the type checker", () => {
    // @ts-expect-error a full observation has elements without a ref; check against what the Actor saw
    checkActionRef({ type: "click", ref: "e1" }, observationFixture);
  });
});
