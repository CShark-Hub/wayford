import { describe, expect, test } from "vitest";
import { observationFixture } from "./fixtures/index.js";
import {
  type ActorElement,
  elementKey,
  FullObservation,
  Metrics,
  Observation,
  ObservedElement,
  renderObservationForModel,
  toActorObservation,
} from "./observation.js";
import { METRIC_NAMES } from "./primitives.js";

/** Words that must never reach the Actor. The prompt is identical for every persona. */
const BANNED = [
  "persona",
  "profile",
  "impair",
  "disab",
  "blind",
  "vision",
  "sight",
  "contrast",
  "threshold",
  "filter",
  "degraded",
  "invisible",
  "hidden",
  "rule",
  "seed",
  "wcag",
  "ada",
  "milo",
  "vera",
  "zoya",
];

const baseElement = {
  ref: "e1",
  key: "main//link:Archive",
  role: "link",
  name: "Archive",
  bbox: { x: 640, y: 412, width: 120, height: 18 },
  metrics: { contrast: 2.1, fontPx: 14, targetPx: 18 },
  state: "visible",
  decision: { rule: "P1", metric: "contrast", value: 2.1, threshold: 3 },
} as const;

describe("ObservedElement (evidence)", () => {
  test("the fixture validates and mixes all three states", () => {
    expect(FullObservation.safeParse(observationFixture).success).toBe(true);
    const states = new Set(observationFixture.elements.map((e) => e.state));
    expect([...states].sort()).toEqual(["degraded", "invisible", "visible"]);
  });

  test("metrics are exactly the names the filter measures", () => {
    expect(Object.keys(Metrics.shape).sort()).toEqual([...METRIC_NAMES].sort());
  });

  test("a degraded element must say what the Actor read instead", () => {
    const degraded = {
      ...baseElement,
      state: "degraded",
      decision: { ...baseElement.decision, rolled: 0.37 },
    };
    expect(ObservedElement.safeParse(degraded).success).toBe(false);
    expect(ObservedElement.safeParse({ ...degraded, maskedName: "Ar▒▒ive" }).success).toBe(true);
  });

  test("an element that is not visible must say which rule decided", () => {
    const { decision: _decision, ref: _ref, ...undecided } = baseElement;
    expect(ObservedElement.safeParse({ ...undecided, state: "invisible" }).success).toBe(false);
    expect(
      ObservedElement.safeParse({
        ...undecided,
        state: "invisible",
        decision: baseElement.decision,
      }).success,
    ).toBe(true);
  });

  test("a visible element with no threshold behind it needs no decision", () => {
    const { decision: _decision, ...plain } = baseElement;
    expect(ObservedElement.safeParse(plain).success).toBe(true);
  });

  test("an invisible element has no ref, a shown element must have one", () => {
    const { ref: _ref, ...noRef } = baseElement;
    expect(ObservedElement.safeParse(noRef).success).toBe(false);
    expect(ObservedElement.safeParse({ ...baseElement, state: "invisible" }).success).toBe(false);
    expect(ObservedElement.safeParse({ ...noRef, state: "invisible" }).success).toBe(true);
  });

  test("the rolled value is a probability", () => {
    const rolled = { ...baseElement, decision: { ...baseElement.decision, rolled: 1.2 } };
    expect(ObservedElement.safeParse(rolled).success).toBe(false);
  });

  test("only a degraded element carries a masked name", () => {
    expect(ObservedElement.safeParse({ ...baseElement, maskedName: "Ar▒▒ive" }).success).toBe(
      false,
    );
  });
});

describe("FullObservation (the evidence record)", () => {
  function withRefs(refs: (string | undefined)[]): unknown {
    const elements = observationFixture.elements.map((element, i) => {
      const { ref: _ref, ...rest } = element;
      return refs[i] === undefined ? rest : { ...rest, ref: refs[i] };
    });
    return { ...observationFixture, elements };
  }

  const shown = observationFixture.elements.map((e) => e.ref);

  test("the fixture numbers its shown elements e1..eN in order", () => {
    expect(FullObservation.safeParse(withRefs(shown)).success).toBe(true);
  });

  test("a gap in the shown refs is rejected, because a gap reveals a removal", () => {
    const gapped = shown.map((ref) => (ref === "e6" ? "e7" : ref));
    const result = FullObservation.safeParse(withRefs(gapped));
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("e6");
  });

  test("refs out of encounter order are rejected", () => {
    const swapped = shown.map((ref) => (ref === "e1" ? "e2" : ref === "e2" ? "e1" : ref));
    expect(FullObservation.safeParse(withRefs(swapped)).success).toBe(false);
  });

  test("a duplicate ref is rejected", () => {
    const duplicated = shown.map((ref) => (ref === "e6" ? "e5" : ref));
    expect(FullObservation.safeParse(withRefs(duplicated)).success).toBe(false);
  });
});

describe("elementKey", () => {
  test("is built from role, name and landmark path only", () => {
    const key = elementKey({
      role: "link",
      name: "Archive",
      path: [{ role: "main" }, { role: "navigation", name: "Deliveries" }],
    });
    expect(key).toBe("main/navigation:Deliveries//link:Archive");
  });

  test("the same element gets the same key every time, a renamed one does not", () => {
    const a = elementKey({ role: "link", name: "Archive", path: [{ role: "main" }] });
    const b = elementKey({ role: "link", name: "Archive", path: [{ role: "main" }] });
    const c = elementKey({ role: "link", name: "Archives", path: [{ role: "main" }] });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test("every fixture key ends in the element's own role and name", () => {
    for (const element of observationFixture.elements) {
      expect(element.key.endsWith(`//${element.role}:${element.name}`)).toBe(true);
    }
  });
});

describe("Observation (what the Actor receives)", () => {
  const actor = toActorObservation(observationFixture);

  test("validates against the Actor-facing schema", () => {
    expect(Observation.safeParse(actor).success).toBe(true);
  });

  test("carries no invisible element", () => {
    expect(actor.elements.length).toBeLessThan(observationFixture.elements.length);
    for (const element of actor.elements) expect(element.state).not.toBe("invisible");
  });

  test("the schema refuses an invisible element at runtime", () => {
    const smuggled = {
      ...actor,
      elements: [
        ...actor.elements,
        { ref: "e99", role: "link", name: "Help", bbox: baseElement.bbox, state: "invisible" },
      ],
    };
    expect(Observation.safeParse(smuggled).success).toBe(false);
  });

  test("the type refuses an invisible element at compile time", () => {
    const element: ActorElement = {
      ref: "e1",
      role: "link",
      name: "Home",
      bbox: baseElement.bbox,
      // @ts-expect-error invisible is not an Actor-facing state
      state: "invisible",
    };
    expect(element.state).toBe("invisible");
  });

  test("carries no evidence fields: key, metrics, decision, maskedName", () => {
    for (const element of actor.elements) {
      expect(Object.keys(element).sort()).toEqual(["bbox", "name", "ref", "role", "state"]);
    }
    const withKey = { ...actor, elements: [{ ...actor.elements[0], key: "main//link:Home" }] };
    expect(Observation.safeParse(withKey).success).toBe(false);
  });

  test("a degraded element shows its masked name and nothing of the real one", () => {
    const degraded = observationFixture.elements.filter((e) => e.state === "degraded");
    expect(degraded.length).toBeGreaterThan(0);
    const serialised = JSON.stringify(actor);
    for (const element of degraded) {
      const shown = actor.elements.find((e) => e.ref === element.ref);
      expect(shown?.name).toBe(element.maskedName);
      expect(serialised).not.toContain(element.name);
    }
  });

  test("refs are contiguous, so a gap cannot reveal a removed element", () => {
    expect(actor.elements.map((e) => e.ref)).toEqual(actor.elements.map((_, i) => `e${i + 1}`));
  });

  test("keeps the counts the Actor is allowed to know", () => {
    expect(actor.hiddenCount).toBe(observationFixture.hiddenCount);
    expect(actor.belowFoldCount).toBe(observationFixture.belowFoldCount);
    expect(actor.url).toBe(observationFixture.url);
    expect(actor.stepIndex).toBe(observationFixture.stepIndex);
  });

  test("the fixture has no screenshot, because the Actor is text-first", () => {
    expect(observationFixture.screenshotPath).toBeUndefined();
  });
});

describe("renderObservationForModel", () => {
  const text = renderObservationForModel(toActorObservation(observationFixture));

  test("is the exact text the Actor sees", () => {
    expect(text).toMatchInlineSnapshot(`
      "Page: Deliveries
      URL: http://localhost:5174/deliveries
      Viewport: 1280 x 800
      [e1] link "Home" at 24,16
      [e2] link "Account" at 104,16
      [e3] link "Deliveries" at 192,16
      [e4] link "Settings" at 296,16
      [e5] heading "Your deliveries" at 120,96
      [e6] link "Ar▒▒ive" at 640,412, partly legible
      3 more elements not shown
      5 more below, scroll to see them"
    `);
  });

  test("contains no persona or impairment words", () => {
    const lower = text.toLowerCase();
    for (const word of BANNED) expect(lower).not.toContain(word);
  });

  test("names nothing the filter removed or masked", () => {
    for (const element of observationFixture.elements) {
      if (element.state === "visible") continue;
      expect(text).not.toContain(element.name);
    }
  });

  test("omits the count lines when there is nothing to count", () => {
    const nothingMore = {
      ...toActorObservation(observationFixture),
      hiddenCount: 0,
      belowFoldCount: 0,
    };
    expect(renderObservationForModel(nothingMore)).not.toContain("more");
  });

  test("is deterministic", () => {
    expect(renderObservationForModel(toActorObservation(observationFixture))).toBe(text);
  });
});
