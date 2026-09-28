import { describe, expect, test } from "vitest";
import {
  profileFixture,
  runEventFixtures,
  runResultFixture,
  taskFixtures,
} from "./fixtures/index.js";
import {
  DICE_RULES,
  DiceRoll,
  diceFires,
  type FinishedOutcome,
  RUN_EVENT_TYPES,
  RUN_OUTCOMES,
  RunEvent,
  RunResult,
  RunStep,
  runResultFromEvents,
} from "./run.js";

describe("RunResult and RunEvent schemas", () => {
  test("the fixtures validate", () => {
    expect(RunResult.safeParse(runResultFixture).success).toBe(true);
    expect(RunEvent.array().safeParse(runEventFixtures).success).toBe(true);
  });

  test("RunEvent is a closed union: an unknown type is rejected", () => {
    expect(
      RunEvent.safeParse({
        type: "stepSkipped",
        runId: "run_x",
        stepIndex: 0,
        timestamp: "2026-09-22T10:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  test("every event carries runId, stepIndex and timestamp", () => {
    for (const event of runEventFixtures) {
      expect(typeof event.runId).toBe("string");
      expect(Number.isInteger(event.stepIndex)).toBe(true);
      expect(() => new Date(event.timestamp).toISOString()).not.toThrow();
    }
  });

  test("runFailed's outcome is error, distinct from gave_up", () => {
    // gave_up is a finished outcome; runFailed does not accept it.
    expect(
      RunEvent.safeParse({
        type: "runFailed",
        runId: "run_x",
        stepIndex: 0,
        timestamp: "2026-09-22T10:00:00.000Z",
        error: "target closed the page",
        durationMs: 10,
        cost: { tokensIn: 0, tokensOut: 0, usd: 0 },
      }).success,
    ).toBe(true);
    expect(RUN_OUTCOMES).toContain("error");
    expect(RUN_OUTCOMES).toContain("gave_up");
  });

  test("runFinished accepts only a finished outcome, never error", () => {
    const base = {
      type: "runFinished" as const,
      runId: "run_x",
      stepIndex: 0,
      timestamp: "2026-09-22T10:00:00.000Z",
      durationMs: 10,
      cost: { tokensIn: 0, tokensOut: 0, usd: 0 },
    };
    expect(RunEvent.safeParse({ ...base, outcome: "gave_up" }).success).toBe(true);
    expect(RunEvent.safeParse({ ...base, outcome: "error" }).success).toBe(false);
  });

  test("an extra key on an event is rejected", () => {
    expect(
      RunEvent.safeParse({
        type: "narration",
        runId: "run_x",
        stepIndex: 0,
        timestamp: "2026-09-22T10:00:00.000Z",
        text: "hi",
        mood: "cheerful",
      }).success,
    ).toBe(false);
  });

  test("a run has no runIndex: its id is its number (issue #94)", () => {
    const started = runEventFixtures[0];
    if (started?.type !== "runStarted")
      throw new Error("the fixture stream must open with runStarted");
    expect(RunEvent.safeParse({ ...started, runIndex: 1 }).success).toBe(false);
    expect(RunResult.safeParse({ ...runResultFixture, runIndex: 1 }).success).toBe(false);
  });

  test("actorSampling is optional on runStarted and RunResult: a Jev run sends none", () => {
    const started = runEventFixtures[0];
    if (started?.type !== "runStarted")
      throw new Error("the fixture stream must open with runStarted");
    expect(started.actorSampling).toBeDefined();
    expect(runResultFixture.actorSampling).toBeDefined();
    const { actorSampling: _eventSampling, ...startedWithout } = started;
    const { actorSampling: _resultSampling, ...resultWithout } = runResultFixture;
    expect(RunEvent.safeParse(startedWithout).success).toBe(true);
    expect(RunResult.safeParse(resultWithout).success).toBe(true);
  });

  test("actorSampling is a temperature in [0, 2] and, when sent, a provider seed below 2^31", () => {
    const started = runEventFixtures[0];
    if (started?.type !== "runStarted")
      throw new Error("the fixture stream must open with runStarted");
    const accepts = (actorSampling: object) =>
      RunEvent.safeParse({ ...started, actorSampling }).success;
    expect(accepts({ temperature: 0 })).toBe(true);
    expect(accepts({ temperature: 2, providerSeed: 0 })).toBe(true);
    expect(accepts({ temperature: 0.7, providerSeed: 2 ** 31 - 1 })).toBe(true);
    for (const temperature of [-0.1, 2.1]) expect(accepts({ temperature })).toBe(false);
    // Some providers type seed as a signed 32-bit integer, so the cap is 2^31 - 1, not a Seed's.
    for (const providerSeed of [-1, 1.5, 2 ** 31]) {
      expect(accepts({ temperature: 0.7, providerSeed })).toBe(false);
    }
    expect(accepts({ providerSeed: 7 })).toBe(false);
    expect(accepts({ temperature: 0.7, topP: 0.9 })).toBe(false);
    const tooBig = { temperature: 0.7, providerSeed: 2 ** 31 };
    expect(RunResult.safeParse({ ...runResultFixture, actorSampling: tooBig }).success).toBe(false);
  });

  test("modelIds names the Actor's model and no role that runs outside the run", () => {
    const started = runEventFixtures[0];
    if (started?.type !== "runStarted")
      throw new Error("the fixture stream must open with runStarted");
    const accepts = (modelIds: object) => [
      RunEvent.safeParse({ ...started, modelIds }).success,
      RunResult.safeParse({ ...runResultFixture, modelIds }).success,
    ];
    expect(accepts({ actor: "gpt-4o-mini" })).toEqual([true, true]);
    // The Extractor, Scout and the Analyst run outside a run, so a run would invent their models.
    for (const role of ["extractor", "scout", "analyst"]) {
      expect(accepts({ actor: "gpt-4o-mini", [role]: "gpt-4o" })).toEqual([false, false]);
    }
    expect(accepts({})).toEqual([false, false]);
  });

  test("urlBefore is the observed page, so an http(s) URL like the observation's", () => {
    const step = runResultFixture.steps[0];
    if (!step) throw new Error("the fixture run must have a first step");
    expect(RunStep.safeParse(step).success).toBe(true);
    expect(RunStep.safeParse({ ...step, urlBefore: "about:blank" }).success).toBe(false);
  });

  test("urlAfter keeps where the action landed, even a page that is not http(s)", () => {
    // What page.url() reads after a back from the first page, and after a link to a dead host.
    const i = runEventFixtures.findIndex((e) => e.type === "actionPerformed");
    const performed = runEventFixtures[i];
    if (performed?.type !== "actionPerformed") {
      throw new Error("the fixture stream must perform an action");
    }
    for (const urlAfter of ["about:blank", "chrome-error://chromewebdata/"]) {
      const landed = { ...performed, urlAfter };
      expect(RunEvent.safeParse(landed).success).toBe(true);
      const result = runResultFromEvents(runEventFixtures.map((e, j) => (j === i ? landed : e)));
      const step = result.steps.find((s) => s.stepIndex === performed.stepIndex);
      expect(step?.urlAfter).toBe(urlAfter);
    }
  });

  test("startUrl is required on runStarted and on RunResult", () => {
    const started = runEventFixtures[0];
    if (started?.type !== "runStarted")
      throw new Error("the fixture stream must open with runStarted");
    const { startUrl: _eventUrl, ...startedWithout } = started;
    const { startUrl: _resultUrl, ...resultWithout } = runResultFixture;
    expect(RunEvent.safeParse(startedWithout).success).toBe(false);
    expect(RunResult.safeParse(resultWithout).success).toBe(false);
  });

  test("startUrl must be an http(s) URL", () => {
    const started = runEventFixtures[0];
    if (started?.type !== "runStarted")
      throw new Error("the fixture stream must open with runStarted");
    expect(RunEvent.safeParse({ ...started, startUrl: "localhost:5174" }).success).toBe(false);
    expect(RunEvent.safeParse({ ...started, startUrl: "http:///account" }).success).toBe(false);
    expect(RunResult.safeParse({ ...runResultFixture, startUrl: "localhost:5174" }).success).toBe(
      false,
    );
  });

  test("an actionPlanned in the old shape (action + diceRoll) is rejected", () => {
    expect(
      RunEvent.safeParse({
        type: "actionPlanned",
        runId: "run_x",
        stepIndex: 0,
        timestamp: "2026-09-22T10:00:00.000Z",
        action: { type: "click", ref: "e2" },
        diceRoll: 0.62,
        cost: { tokensIn: 0, tokensOut: 0, usd: 0 },
      }).success,
    ).toBe(false);
  });

  test("RunStep accepts an incomplete step and rejects a silent partial", () => {
    const step = runResultFixture.steps[0];
    if (!step) throw new Error("the fixture run must have a first step");
    const {
      proposedAction: _proposed,
      performedAction: _performed,
      dice: _dice,
      urlAfter: _urlAfter,
      ...partial
    } = step;
    expect(RunStep.safeParse({ ...partial, incomplete: true }).success).toBe(true);
    expect(RunStep.safeParse(partial).success).toBe(false);
    expect(RunStep.safeParse({ ...partial, incomplete: false }).success).toBe(false);
  });

  test("an incomplete step carries the three audit fields together or not at all", () => {
    const step = runResultFixture.steps[2];
    if (!step || "incomplete" in step) throw new Error("fixture step 2 must be complete");
    const { urlAfter: _urlAfter, ...planned } = step;
    expect(RunStep.safeParse({ ...planned, incomplete: true }).success).toBe(true);
    for (const key of ["proposedAction", "performedAction", "dice"] as const) {
      const { [key]: _dropped, ...missingOne } = planned;
      expect(RunStep.safeParse({ ...missingOne, incomplete: true }).success).toBe(false);
    }
    // The dice audit still holds on an incomplete step.
    const rewritten = { ...planned, dice: [], incomplete: true };
    expect(RunStep.safeParse(rewritten).success).toBe(false);
  });

  test("RunResult allows an incomplete step only last, and only on error or budget_exceeded", () => {
    const makeIncomplete = (i: number) =>
      runResultFixture.steps.map((s, j) => {
        if (j !== i) return s;
        const {
          proposedAction: _proposed,
          performedAction: _performed,
          dice: _dice,
          urlAfter: _urlAfter,
          ...partial
        } = s;
        return { ...partial, incomplete: true };
      });
    const last = runResultFixture.steps.length - 1;

    const notLast = RunResult.safeParse({
      ...runResultFixture,
      outcome: "error",
      steps: makeIncomplete(0),
    });
    expect(notLast.success).toBe(false);
    expect(notLast.error?.issues[0]?.path).toEqual(["steps", 0]);

    const lastSteps = makeIncomplete(last);
    expect(RunResult.safeParse({ ...runResultFixture, steps: lastSteps }).success).toBe(false);
    for (const outcome of ["error", "budget_exceeded"] as const) {
      expect(RunResult.safeParse({ ...runResultFixture, outcome, steps: lastSteps }).success).toBe(
        true,
      );
    }

    const unplanned = runResultFixture.steps.map((s, j) => {
      if (j !== last) return s;
      const { proposedAction: _proposed, performedAction: _performed, dice: _dice, ...partial } = s;
      return { ...partial, incomplete: true };
    });
    const landedUnplanned = RunResult.safeParse({
      ...runResultFixture,
      outcome: "error",
      steps: unplanned,
    });
    expect(landedUnplanned.success).toBe(false);
    expect(landedUnplanned.error?.issues[0]?.message).toMatch(/never planned/);
  });

  test("giveUp still emits actionPerformed", () => {
    const planned = runEventFixtures.find(
      (e) => e.type === "actionPlanned" && e.performedAction.type === "giveUp",
    );
    if (!planned) throw new Error("the fixture stream must give up");
    expect(
      runEventFixtures.some(
        (e) => e.type === "actionPerformed" && e.stepIndex === planned.stepIndex,
      ),
    ).toBe(true);
    const lastStep = runResultFromEvents(runEventFixtures).steps.at(-1);
    expect(lastStep && "incomplete" in lastStep).toBe(false);
    expect(lastStep?.performedAction?.type).toBe("giveUp");
  });
});

describe("behaviour dice audit", () => {
  const baseStep = runResultFixture.steps[2] as RunStep;
  const plannedEvent = (fields: object) => ({
    type: "actionPlanned",
    runId: "run_x",
    stepIndex: 2,
    timestamp: "2026-09-22T10:00:00.000Z",
    cost: { tokensIn: 0, tokensOut: 0, usd: 0 },
    ...fields,
  });
  const b1Fired = { rule: "B1", p: 0.8, rolled: 0.62, fired: true };
  const b1Unfired = { rule: "B1", p: 0.8, rolled: 0.91, fired: false };
  const b4Fired = { rule: "B4", p: 0.4, rolled: 0.1, fired: true };

  test("the firing rule is rolled < p, strictly", () => {
    expect(diceFires(0.8, 0.62)).toBe(true);
    expect(diceFires(0.8, 0.8)).toBe(false);
    expect(diceFires(0, 0)).toBe(false);
    expect(diceFires(1, 0.999)).toBe(true);
  });

  test("a roll's fired flag must agree with its numbers", () => {
    expect(DiceRoll.safeParse(b1Fired).success).toBe(true);
    expect(DiceRoll.safeParse({ ...b1Fired, fired: false }).success).toBe(false);
    expect(DiceRoll.safeParse({ ...b1Unfired, fired: true }).success).toBe(false);
    expect(DiceRoll.safeParse({ ...b1Fired, rolled: 1.5 }).success).toBe(false);
    // rolled is drawn in [0, 1), so a p 1 rule always fires.
    expect(DiceRoll.safeParse({ ...b1Fired, p: 1, rolled: 1, fired: false }).success).toBe(false);
  });

  test("only the behaviour dice rules can roll", () => {
    expect(DICE_RULES).toEqual(["B1", "B2", "B4"]);
    for (const rule of ["B1", "B2", "B4"]) {
      expect(DiceRoll.safeParse({ ...b1Fired, rule }).success).toBe(true);
    }
    for (const rule of ["B3", "P1"]) {
      expect(DiceRoll.safeParse({ ...b1Fired, rule }).success).toBe(false);
    }
  });

  test("B1 and B4 can both be recorded on one click", () => {
    const audit = {
      proposedAction: { type: "click", ref: "e2" },
      performedAction: { type: "doubleClick", ref: "e3" },
      dice: [b1Fired, b4Fired],
    };
    expect(RunStep.safeParse({ ...baseStep, ...audit }).success).toBe(true);
    expect(RunEvent.safeParse(plannedEvent(audit)).success).toBe(true);
  });

  test("B2 is representable: a scroll performed in place of a giveUp", () => {
    const audit = {
      proposedAction: { type: "giveUp" },
      performedAction: { type: "scroll", direction: "down" },
      dice: [{ rule: "B2", p: 0.3, rolled: 0.1, fired: true }],
    };
    expect(RunStep.safeParse({ ...baseStep, ...audit }).success).toBe(true);
    expect(RunEvent.safeParse(plannedEvent(audit)).success).toBe(true);
  });

  test("without a fired roll the performed action is the proposed one", () => {
    const rewrite = {
      proposedAction: { type: "click", ref: "e2" },
      performedAction: { type: "doubleClick", ref: "e2" },
    };
    for (const dice of [[], [b1Unfired]]) {
      expect(RunStep.safeParse({ ...baseStep, ...rewrite, dice }).success).toBe(false);
      expect(RunEvent.safeParse(plannedEvent({ ...rewrite, dice })).success).toBe(false);
    }
    // A fired roll may still leave the action as proposed (B4 landing on the same target).
    const same = {
      proposedAction: { type: "click", ref: "e2" },
      performedAction: { type: "click", ref: "e2" },
      dice: [{ ...b4Fired }],
    };
    expect(RunStep.safeParse({ ...baseStep, ...same }).success).toBe(true);
  });

  test("a roll must fit the rule: B1 and B4 on a click, fired B1 doubles, fired B2 scrolls", () => {
    const wrong = [
      {
        proposedAction: { type: "scroll", direction: "down" },
        performedAction: { type: "giveUp" },
        dice: [b1Fired],
      },
      {
        proposedAction: { type: "click", ref: "e2" },
        performedAction: { type: "type", ref: "e9", text: "hi" },
        dice: [b1Fired],
      },
      {
        proposedAction: { type: "giveUp" },
        performedAction: { type: "back" },
        dice: [{ rule: "B2", p: 0.3, rolled: 0.1, fired: true }],
      },
      {
        proposedAction: { type: "back" },
        performedAction: { type: "back" },
        dice: [{ ...b4Fired, fired: false, rolled: 0.9 }],
      },
    ];
    for (const audit of wrong) {
      expect(RunStep.safeParse({ ...baseStep, ...audit }).success).toBe(false);
      expect(RunEvent.safeParse(plannedEvent(audit)).success).toBe(false);
    }
  });

  test("a rule rolls at most once per action", () => {
    const twice = {
      proposedAction: { type: "click", ref: "e2" },
      performedAction: { type: "doubleClick", ref: "e2" },
      dice: [b1Fired, b1Fired],
    };
    expect(RunStep.safeParse({ ...baseStep, ...twice }).success).toBe(false);
  });

  test("the fixture's dice agree with Vera's profile", () => {
    const vera = profileFixture("prof_vera");
    for (const step of runResultFixture.steps) {
      if ("incomplete" in step) throw new Error("the fixture run has no incomplete step");
      const b1 = step.dice.filter((d) => d.rule === "B1");
      if (step.proposedAction.type === "click") {
        expect(b1).toHaveLength(1);
        expect(b1[0]?.p).toBe(vera.behaviour.doubleClick);
      } else {
        expect(b1).toHaveLength(0);
      }
    }
    const [step0, , step2] = runResultFixture.steps;
    expect(step0?.performedAction).toEqual({ type: "click", ref: "e3" });
    expect(step0?.dice?.[0]?.fired).toBe(false);
    expect(step2?.proposedAction).toEqual({ type: "click", ref: "e2" });
    expect(step2?.performedAction).toEqual({ type: "doubleClick", ref: "e2" });
    expect(step2?.dice?.[0]).toEqual({ rule: "B1", p: 0.8, rolled: 0.62, fired: true });
  });

  test("the reducer carries the audit from the event to the step", () => {
    const planned = runEventFixtures.find((e) => e.type === "actionPlanned" && e.stepIndex === 2);
    if (planned?.type !== "actionPlanned") throw new Error("step 2 must have an actionPlanned");
    const step = runResultFromEvents(runEventFixtures).steps[2];
    expect(step?.proposedAction).toEqual(planned.proposedAction);
    expect(step?.performedAction).toEqual(planned.performedAction);
    expect(step?.dice).toEqual(planned.dice);
  });
});

describe("the fixture run", () => {
  test("has at least four steps and gives up", () => {
    expect(runResultFixture.steps.length).toBeGreaterThanOrEqual(4);
    expect(runResultFixture.outcome).toBe("gave_up");
  });

  test("the stored steps keep the full evidence, hidden elements and all", () => {
    // Step 1 saw an element the filter removed; the Actor never did.
    const step = runResultFixture.steps[1];
    if (!step) throw new Error("the fixture run must have a second step");
    const invisible = step.fullObservation.elements.filter((e) => e.state === "invisible");
    expect(invisible.length).toBeGreaterThan(0);
    expect(step.actorObservationText).not.toContain(invisible[0]?.name ?? "");
  });

  test("the start URL is the goto URL, all three target parameters included", () => {
    expect(runResultFixture.startUrl).toBe(
      "http://localhost:5174/?contrast=2&fontPx=16&targetPx=36",
    );
    // Not a task's bare start URL: the harness appends the run's parameters.
    expect(taskFixtures.map((t) => t.startUrl)).not.toContain(runResultFixture.startUrl);
  });

  test("serializes to JSON well under 200 KB", () => {
    const bytes = Buffer.byteLength(JSON.stringify(runResultFixture), "utf8");
    expect(bytes).toBeLessThan(200_000);
  });
});

describe("runResultFromEvents", () => {
  test("replaying the fixture events yields the fixture result", () => {
    expect(runResultFromEvents(runEventFixtures)).toEqual(runResultFixture);
  });

  test("is pure: replaying twice yields equal, independent results", () => {
    const a = runResultFromEvents(runEventFixtures);
    const b = runResultFromEvents(runEventFixtures);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  test("recomputes each step's Actor-facing text from the evidence", () => {
    // The reducer never trusts a text off the wire; it projects the full
    // observation itself, so the stored text cannot drift from the filter.
    const result = runResultFromEvents(runEventFixtures);
    for (const step of result.steps) {
      expect(step.actorObservationText).toContain(`URL: ${step.fullObservation.url}`);
    }
  });

  test("carries startUrl from runStarted, not from the first observation", () => {
    const started = runEventFixtures[0];
    if (started?.type !== "runStarted")
      throw new Error("the fixture stream must open with runStarted");
    const result = runResultFromEvents(runEventFixtures);
    expect(result.startUrl).toBe(started.startUrl);
    // The first observation's URL is page.url(), with the parameters stripped.
    expect(result.startUrl).not.toBe(result.steps[0]?.urlBefore);
  });

  test("carries actorSampling from runStarted, and leaves it out when runStarted has none", () => {
    const started = runEventFixtures[0];
    if (started?.type !== "runStarted")
      throw new Error("the fixture stream must open with runStarted");
    expect(started.actorSampling).toBeDefined();
    expect(runResultFromEvents(runEventFixtures).actorSampling).toEqual(started.actorSampling);
    // A Jev run sends no sampling settings: its record has no key, not an undefined one.
    const { actorSampling: _sampling, ...jevStart } = started;
    const jevRun = runResultFromEvents([jevStart, ...runEventFixtures.slice(1)]);
    expect(jevRun).not.toHaveProperty("actorSampling");
  });

  test("a stream must open with runStarted", () => {
    const withoutStart = runEventFixtures.slice(1);
    expect(() => runResultFromEvents(withoutStart)).toThrow(/runStarted/);
  });

  test("a stream must end with a terminal event", () => {
    const withoutEnd = runEventFixtures.filter(
      (e) => e.type !== "runFinished" && e.type !== "runFailed",
    );
    expect(() => runResultFromEvents(withoutEnd)).toThrow(/runFinished or runFailed/);
  });

  test("a runFailed stream reduces to outcome error", () => {
    const started = runEventFixtures[0];
    if (started?.type !== "runStarted")
      throw new Error("the fixture stream must open with runStarted");
    const failed: RunEvent[] = [
      started,
      {
        type: "runFailed",
        runId: "run_vera-hard-1",
        stepIndex: 0,
        timestamp: "2026-09-22T10:00:01.000Z",
        error: "browser context crashed",
        durationMs: 900,
        cost: { tokensIn: 10, tokensOut: 0, usd: 0.0001 },
      },
    ];
    const result = runResultFromEvents(failed);
    expect(result.outcome).toBe("error");
    expect(result.steps).toHaveLength(0);
    expect(result.startUrl).toBe(started.startUrl);
  });

  test("RUN_EVENT_TYPES lists exactly the union members", () => {
    // Read off the union itself, so a kind added to one and not the other fails here. The web
    // subscribes by this list, so an unlisted kind would never reach it.
    const members = RunEvent.options.map((option) => option.shape.type.value);
    expect([...RUN_EVENT_TYPES].sort()).toEqual(members.sort());
  });
});

describe("step times and cost", () => {
  const timestampOf = (type: RunEvent["type"], stepIndex: number): string => {
    const event = runEventFixtures.find((e) => e.type === type && e.stepIndex === stepIndex);
    if (!event) throw new Error(`the fixture stream has no ${type} at step ${stepIndex}`);
    return event.timestamp;
  };

  test("a step starts at its stepObserved and ends at its actionPerformed", () => {
    // Every event of a step has its own timestamp, so taking the wrong one fails.
    const { steps } = runResultFromEvents(runEventFixtures);
    expect(steps).toHaveLength(4);
    for (const step of steps) {
      expect(step.startedAt).toBe(timestampOf("stepObserved", step.stepIndex));
      expect(step.endedAt).toBe(timestampOf("actionPerformed", step.stepIndex));
    }
  });

  test("a step's cost is its actionPlanned's", () => {
    const { steps } = runResultFromEvents(runEventFixtures);
    for (const step of steps) {
      const planned = runEventFixtures.find(
        (e) => e.type === "actionPlanned" && e.stepIndex === step.stepIndex,
      );
      if (planned?.type !== "actionPlanned") {
        throw new Error(`the fixture stream must plan an action at step ${step.stepIndex}`);
      }
      expect(step.cost).toEqual(planned.cost);
    }
    // The four costs differ, so a step carrying another step's cost fails too.
    expect(new Set(steps.map((s) => JSON.stringify(s.cost))).size).toBe(steps.length);
  });

  test("a stored step needs ISO start and end times, and a complete step its cost", () => {
    const step = runResultFixture.steps[0];
    if (!step || "incomplete" in step) throw new Error("fixture step 0 must be complete");
    for (const key of ["startedAt", "endedAt", "cost"] as const) {
      const { [key]: _dropped, ...without } = step;
      expect(RunStep.safeParse(without).success, key).toBe(false);
    }
    for (const key of ["startedAt", "endedAt"] as const) {
      expect(RunStep.safeParse({ ...step, [key]: "2026-09-22T10:00:01Z" }).success, key).toBe(true);
      expect(RunStep.safeParse({ ...step, [key]: "2026-09-22 10:00:01" }).success, key).toBe(false);
    }
  });

  test("actionPlanned must carry a cost", () => {
    const planned = runEventFixtures.find((e) => e.type === "actionPlanned");
    if (planned?.type !== "actionPlanned") {
      throw new Error("the fixture stream must plan an action");
    }
    expect(RunEvent.safeParse(planned).success).toBe(true);
    const { cost: _cost, ...without } = planned;
    expect(RunEvent.safeParse(without).success).toBe(false);
  });

  test("the fixture run's step costs add up to its total", () => {
    // A property of this fixture, not a contract rule: the calls of a step the
    // run stopped in before planning its action are billed in the run's total
    // only, so a real run's total can exceed the sum of its steps.
    const sum = (key: keyof RunResult["cost"]) =>
      runResultFixture.steps.reduce((total, step) => total + (step.cost?.[key] ?? 0), 0);
    expect(sum("tokensIn")).toBe(runResultFixture.cost.tokensIn);
    expect(sum("tokensOut")).toBe(runResultFixture.cost.tokensOut);
    expect(sum("usd")).toBeCloseTo(runResultFixture.cost.usd, 10);
  });

  test("an element keeps one roll for the whole run", () => {
    // Perception is resolved once per element per run (docs/RULES.md, "The roll").
    const rolls = new Map<string, number>();
    for (const step of runResultFixture.steps) {
      for (const element of step.fullObservation.elements) {
        for (const decision of element.decisions) {
          if (decision.stage !== "perception" || decision.rolled === undefined) continue;
          const seen = rolls.get(element.key);
          if (seen !== undefined) expect(decision.rolled, element.key).toBe(seen);
          rolls.set(element.key, decision.rolled);
        }
      }
    }
    expect(rolls.size).toBeGreaterThan(0);
  });
});

describe("a run that stops mid-step", () => {
  const started = runEventFixtures[0];
  if (started?.type !== "runStarted")
    throw new Error("the fixture stream must open with runStarted");
  const stepEvents = (i: number) =>
    runEventFixtures.filter(
      (e) =>
        e.stepIndex === i &&
        e.type !== "runStarted" &&
        e.type !== "runFinished" &&
        e.type !== "runFailed",
    );
  const observed = (i: number) => stepEvents(i).filter((e) => e.type === "stepObserved");
  const upToPlanned = (i: number) => stepEvents(i).filter((e) => e.type !== "actionPerformed");
  const ending = {
    runId: "run_vera-hard-1",
    timestamp: "2026-09-22T10:00:20.000Z",
    durationMs: 20000,
    cost: { tokensIn: 10, tokensOut: 0, usd: 0.0001 },
  };
  const failedAt = (i: number): RunEvent => ({
    ...ending,
    type: "runFailed",
    stepIndex: i,
    error: "llm timeout",
  });
  const finishedAt = (i: number, outcome: FinishedOutcome): RunEvent => ({
    ...ending,
    type: "runFinished",
    stepIndex: i,
    outcome,
  });

  test("runFailed after stepObserved stores the last step as incomplete", () => {
    const result = runResultFromEvents([started, ...observed(0), failedAt(0)]);
    expect(result.outcome).toBe("error");
    expect(result.steps).toHaveLength(1);
    const step = result.steps[0];
    if (!step || !("incomplete" in step)) throw new Error("step 0 must be incomplete");
    expect(step.incomplete).toBe(true);
    expect(step.proposedAction).toBeUndefined();
    expect(step.performedAction).toBeUndefined();
    expect(step.dice).toBeUndefined();
    expect(step.urlAfter).toBeUndefined();
    expect(step.urlBefore).toBe(step.fullObservation.url);
    expect(step.actorObservationText).toContain(`URL: ${step.fullObservation.url}`);
  });

  test("budget_exceeded after stepObserved stores the last step as incomplete", () => {
    const result = runResultFromEvents([
      started,
      ...stepEvents(0),
      ...observed(1),
      finishedAt(1, "budget_exceeded"),
    ]);
    expect(result.outcome).toBe("budget_exceeded");
    expect(result.steps).toHaveLength(2);
    const [first, last] = result.steps;
    expect(first && "incomplete" in first).toBe(false);
    if (!last || !("incomplete" in last)) throw new Error("step 1 must be incomplete");
    expect(last.performedAction).toBeUndefined();
  });

  test("an action planned but never performed is kept on the incomplete step", () => {
    const planned = stepEvents(2).find((e) => e.type === "actionPlanned");
    if (planned?.type !== "actionPlanned" || planned.dice.length === 0) {
      throw new Error("fixture step 2 must plan an action with a dice roll");
    }
    const result = runResultFromEvents([
      started,
      ...stepEvents(0),
      ...stepEvents(1),
      ...upToPlanned(2),
      failedAt(2),
    ]);
    const step = result.steps.at(-1);
    if (!step || !("incomplete" in step)) throw new Error("step 2 must be incomplete");
    expect(step.proposedAction).toEqual(planned.proposedAction);
    expect(step.performedAction).toEqual(planned.performedAction);
    expect(step.dice).toEqual(planned.dice);
    expect(step.urlAfter).toBeUndefined();
  });

  test("an incomplete step that is not the last one throws", () => {
    expect(() =>
      runResultFromEvents([started, ...observed(0), ...stepEvents(1), failedAt(1)]),
    ).toThrow(/step 0 is incomplete but is not the last step/);
  });

  test.each(["gave_up", "success"] as const)(
    "an incomplete last step under %s throws",
    (outcome) => {
      expect(() => runResultFromEvents([started, ...observed(0), finishedAt(0, outcome)])).toThrow(
        /is incomplete but the run ended/,
      );
    },
  );

  test("a complete last step under runFailed stays complete", () => {
    const events = [...runEventFixtures.filter((e) => e.type !== "runFinished"), failedAt(3)];
    const result = runResultFromEvents(events);
    expect(result.outcome).toBe("error");
    expect(result.steps).toHaveLength(4);
    for (const step of result.steps) expect("incomplete" in step).toBe(false);
  });

  test("a step without an observation still throws, even last under runFailed", () => {
    const narration = stepEvents(0).filter((e) => e.type === "narration");
    expect(() => runResultFromEvents([started, ...narration, failedAt(0)])).toThrow(
      /missing an observation/,
    );
  });

  test("an action performed but never planned throws, even last under runFailed", () => {
    const noPlan = stepEvents(0).filter((e) => e.type !== "actionPlanned");
    expect(() => runResultFromEvents([started, ...noPlan, failedAt(0)])).toThrow(
      /step 0 performed an action it never planned/,
    );
  });

  test("an incomplete step ends when the run stopped, and has a cost only if it was planned", () => {
    const [observation] = observed(0);
    if (!observation) throw new Error("the fixture stream must observe step 0");
    const failed = failedAt(0);
    const unplanned = runResultFromEvents([started, observation, failed]).steps[0];
    if (!unplanned || !("incomplete" in unplanned)) throw new Error("step 0 must be incomplete");
    expect(unplanned.startedAt).toBe(observation.timestamp);
    expect(unplanned.endedAt).toBe(failed.timestamp);
    // runResultFromEvents parses what it returns, so RunResult accepts a step with no cost.
    expect(unplanned).not.toHaveProperty("cost");
    for (const key of ["startedAt", "endedAt"] as const) {
      const { [key]: _dropped, ...without } = unplanned;
      expect(RunStep.safeParse(without).success, key).toBe(false);
    }

    const planned = upToPlanned(1).find((e) => e.type === "actionPlanned");
    if (planned?.type !== "actionPlanned") throw new Error("fixture step 1 must plan an action");
    const cut = finishedAt(1, "budget_exceeded");
    const events = [started, ...stepEvents(0), ...upToPlanned(1), cut];
    const last = runResultFromEvents(events).steps.at(-1);
    if (!last || !("incomplete" in last)) throw new Error("step 1 must be incomplete");
    expect(last.endedAt).toBe(cut.timestamp);
    expect(last.cost).toEqual(planned.cost);
  });
});

describe("a stream that is not exactly one run", () => {
  // Each stream is the fixture stream with one event added, copied or changed.
  // The ones that throw would fold but for the single rule they break.
  const indexOf = (type: RunEvent["type"], stepIndex: number): number => {
    const i = runEventFixtures.findIndex((e) => e.type === type && e.stepIndex === stepIndex);
    if (i < 0) throw new Error(`the fixture stream has no ${type} at step ${stepIndex}`);
    return i;
  };
  const eventAt = (i: number): RunEvent => {
    const event = runEventFixtures[i];
    if (!event) throw new Error(`the fixture stream has no event ${i}`);
    return event;
  };
  const replacedAt = (i: number, event: RunEvent): RunEvent[] =>
    runEventFixtures.map((e, j) => (j === i ? event : e));
  const insertedAfter = (i: number, ...extra: RunEvent[]): RunEvent[] => [
    ...runEventFixtures.slice(0, i + 1),
    ...extra,
    ...runEventFixtures.slice(i + 1),
  ];
  const failed: RunEvent = {
    type: "runFailed",
    runId: "run_vera-hard-1",
    stepIndex: 3,
    timestamp: "2026-09-22T10:00:13.000Z",
    error: "browser context crashed",
    durationMs: 13000,
    cost: { tokensIn: 5120, tokensOut: 880, usd: 0.0143 },
  };

  test.each([
    "stepObserved",
    "actionPlanned",
    "actionPerformed",
    "narration",
    "runFinished",
  ] as const)("%s from another run throws", (type) => {
    const i = runEventFixtures.findIndex((e) => e.type === type);
    const foreign = { ...eventAt(i), runId: "run_other-1" };
    expect(() => runResultFromEvents(replacedAt(i, foreign))).toThrow(
      /belongs to run_other-1, not run_vera-hard-1/,
    );
  });

  test("another run's event names both runs, even after the end", () => {
    // Step 3's actionPerformed again, after runFinished: it breaks the end and
    // duplicate rules too, but the runId check comes first.
    const foreign = { ...eventAt(indexOf("actionPerformed", 3)), runId: "run_other-1" };
    expect(() => runResultFromEvents([...runEventFixtures, foreign])).toThrow(
      /belongs to run_other-1, not run_vera-hard-1/,
    );
  });

  test("narration after runFinished throws instead of joining the last step", () => {
    const late: RunEvent = {
      type: "narration",
      runId: "run_vera-hard-1",
      stepIndex: 3,
      timestamp: "2026-09-22T10:00:13.000Z",
      text: "Maybe one more look.",
    };
    expect(() => runResultFromEvents([...runEventFixtures, late])).toThrow(
      /narration at step 3 comes after runFinished/,
    );
  });

  test("a step observed after runFailed throws instead of becoming its incomplete last step", () => {
    const observed = eventAt(indexOf("stepObserved", 3));
    if (observed.type !== "stepObserved") throw new Error("the fixture stream must observe step 3");
    // Re-indexed whole, the observation too, so only its place in the stream is wrong.
    const next: RunEvent = {
      ...observed,
      stepIndex: 4,
      timestamp: "2026-09-22T10:00:14.000Z",
      observation: { ...observed.observation, stepIndex: 4 },
    };
    const unfinished = runEventFixtures.filter((e) => e.type !== "runFinished");
    expect(() => runResultFromEvents([...unfinished, failed, next])).toThrow(
      /stepObserved at step 4 comes after runFailed/,
    );
  });

  test("a second end throws", () => {
    expect(() => runResultFromEvents([...runEventFixtures, failed])).toThrow(
      /runFailed at step 3 comes after runFinished/,
    );
  });

  test("a stepObserved holding another step's observation throws", () => {
    const i = indexOf("stepObserved", 1);
    const observed = eventAt(i);
    if (observed.type !== "stepObserved") throw new Error("the fixture stream must observe step 1");
    const mismatched = { ...observed, observation: { ...observed.observation, stepIndex: 2 } };
    expect(() => runResultFromEvents(replacedAt(i, mismatched))).toThrow(
      /step 1 holds the observation of step 2/,
    );
  });

  test.each(["stepObserved", "actionPlanned", "actionPerformed"] as const)(
    "a second %s in one step throws, even an exact copy",
    (type) => {
      const i = indexOf(type, 1);
      expect(() => runResultFromEvents(insertedAfter(i, eventAt(i)))).toThrow(
        new RegExp(`step 1 has a second ${type}`),
      );
    },
  );

  test("narration may repeat in one step and is appended in order", () => {
    const i = indexOf("narration", 1);
    const said = eventAt(i);
    if (said.type !== "narration") throw new Error("the fixture stream must narrate step 1");
    const result = runResultFromEvents(insertedAfter(i, { ...said, text: "Still looking." }));
    expect(result.steps[1]?.narration).toBe(`${said.text}\nStill looking.`);
  });
});
