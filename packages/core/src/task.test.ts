import { describe, expect, test } from "vitest";
import { taskFixture, taskFixtures } from "./fixtures/index.js";
import { Goal, PATH_WORDS, pathWordsIn, SuccessCondition, Task } from "./task.js";

function rawFixture(id: string): Record<string, unknown> {
  return JSON.parse(JSON.stringify(taskFixture(id)));
}

describe("path words", () => {
  test("the list is the one docs/PLAN.md F3 AC1 names", () => {
    expect([...PATH_WORDS].sort()).toEqual(
      ["->", "→", "button", "click", "menu", "settings", "tab"].sort(),
    );
  });

  test("a route through the interface is caught, whatever it is called", () => {
    expect(pathWordsIn("click Settings then pick the second tab")).toEqual([
      "click",
      "settings",
      "tab",
    ]);
    expect(pathWordsIn("Account -> Address")).toEqual(["->"]);
    expect(pathWordsIn("Account → Address")).toEqual(["→"]);
  });

  test("inflections are caught, words that merely start the same are not", () => {
    expect(pathWordsIn("clicking the buttons")).toEqual(["button", "click"]);
    expect(pathWordsIn("open the menus")).toEqual(["menu"]);
    expect(pathWordsIn("a table of established rates")).toEqual([]);
    expect(pathWordsIn("settling in")).toEqual([]);
  });

  test("an intent is left alone", () => {
    expect(pathWordsIn("you want to know where your next parcel is going")).toEqual([]);
  });
});

describe("Goal", () => {
  test("a goal that names a route is rejected, and says which word did it", () => {
    const result = Goal.safeParse("click Settings and choose the night rate");
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("click");
  });

  test("a goal that states an intent passes", () => {
    expect(Goal.safeParse("you want to pay less at night").success).toBe(true);
  });

  test("an empty goal is rejected", () => {
    expect(Goal.safeParse("").success).toBe(false);
  });
});

describe("SuccessCondition", () => {
  test("the three conditions of F3 AC2 parse", () => {
    expect(SuccessCondition.safeParse({ kind: "urlMatches", pattern: "**/x" }).success).toBe(true);
    expect(SuccessCondition.safeParse({ kind: "selectorPresent", selector: "#x" }).success).toBe(
      true,
    );
    expect(
      SuccessCondition.safeParse({ kind: "requestObserved", method: "GET", urlPattern: "**/x" })
        .success,
    ).toBe(true);
  });

  test("the union is closed, so a run cannot be graded by free text", () => {
    expect(SuccessCondition.safeParse({ kind: "actorSaysSo", note: "looked fine" }).success).toBe(
      false,
    );
    expect(SuccessCondition.safeParse({ kind: "urlMatches", pattern: "" }).success).toBe(false);
  });

  test("an unknown method is rejected", () => {
    expect(
      SuccessCondition.safeParse({ kind: "requestObserved", method: "FETCH", urlPattern: "**/x" })
        .success,
    ).toBe(false);
  });

  test("a member does not take extra keys", () => {
    expect(
      SuccessCondition.safeParse({ kind: "urlMatches", pattern: "**/x", selector: "#x" }).success,
    ).toBe(false);
  });
});

describe("Task schema", () => {
  test("a start url has to be one Playwright can navigate to", () => {
    const task = rawFixture("task_next-parcel");
    for (const bad of ["localhost:5174", "file:///tmp/index.html", "/account", ""]) {
      task.startUrl = bad;
      expect(Task.safeParse(task).success).toBe(false);
    }
    task.startUrl = "https://example.com/start";
    expect(Task.safeParse(task).success).toBe(true);
  });

  test("the path-word rule applies to the goal and to nothing else", () => {
    const task = rawFixture("task_next-parcel");
    task.sourceStory = "As a customer I want to click Account -> Address so that I can check it.";
    task.strippedPaths = ["Account", "Address", "the Deliveries tab"];
    expect(Task.safeParse(task).success).toBe(true);

    task.goal = "click through to the address";
    expect(Task.safeParse(task).success).toBe(false);
  });

  test("the story and what was stripped are both optional", () => {
    const task = rawFixture("task_next-parcel");
    task.sourceStory = undefined;
    task.strippedPaths = undefined;
    expect(Task.safeParse(task).success).toBe(true);
  });

  test("an extra key does not pass", () => {
    const task = rawFixture("task_next-parcel");
    task.persona = "prof_vera";
    expect(Task.safeParse(task).success).toBe(false);
  });

  test("an id without its prefix is rejected", () => {
    const task = rawFixture("task_next-parcel");
    task.id = "next-parcel";
    expect(Task.safeParse(task).success).toBe(false);
  });
});

describe("fixtures", () => {
  test("there are two of them and each one validates", () => {
    expect(taskFixtures).toHaveLength(2);
    for (const fixture of taskFixtures) {
      expect(Task.safeParse(fixture).success).toBe(true);
    }
    expect(taskFixtures.map((t) => t.id)).toEqual(["task_next-parcel", "task_past-order"]);
  });

  test("no fixture goal contains a path word", () => {
    for (const fixture of taskFixtures) {
      expect(pathWordsIn(fixture.goal)).toEqual([]);
    }
  });

  test("both goals read as a person's intent", () => {
    expect(taskFixture("task_next-parcel").goal).toBe(
      "you want to know where your next parcel is going",
    );
    expect(taskFixture("task_past-order").goal).toBe(
      "you want to see what you ordered three months ago",
    );
  });

  test("both match the url contract of tasks/m0-04-task-finding-schemas.md", () => {
    expect(taskFixture("task_next-parcel").success).toEqual({
      kind: "urlMatches",
      pattern: "**/account/address",
    });
    expect(taskFixture("task_past-order").success).toEqual({
      kind: "urlMatches",
      pattern: "**/deliveries/archive",
    });
  });

  test("each one keeps the story it was extracted from, and it is the messy one", () => {
    for (const fixture of taskFixtures) {
      expect(fixture.sourceStory).toBeDefined();
      expect(pathWordsIn(fixture.sourceStory as string).length).toBeGreaterThan(0);
      expect(fixture.strippedPaths?.length).toBeGreaterThan(0);
    }
  });

  test("no fixture carries vocabulary from one industry", () => {
    const words = ["energy", "energia", "tariff", "taryfa", "meter", "licznik", "kwh"];
    const source = JSON.stringify(taskFixtures).toLowerCase();
    for (const word of words) expect(source).not.toContain(word);
  });
});
