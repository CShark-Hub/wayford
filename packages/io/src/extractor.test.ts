import { readFileSync } from "node:fs";
import { LlmError } from "@wayford/agent";
import { type FakeLlm, fakeLlm } from "@wayford/agent/fake";
import { PATH_WORDS, pathWordsIn, Task, TaskId } from "@wayford/core";
import { taskFixture } from "@wayford/core/fixtures";
import { describe, expect, onTestFinished, test } from "vitest";
import { EXTRACTOR_PROMPT_FILE } from "./extractor.js";
import { postJson, testApp } from "./test-app.js";

// The past-order task's own start and success, so they follow the fixture the target app checks.
const { startUrl, success } = taskFixture("task_past-order");

/**
 * POST a JSON body to `/tasks` on a new app whose only model is `fake`, on its own store, closed
 * after the test.
 */
async function postBody(fake: FakeLlm, body: unknown) {
  const t = await testApp({ llm: fake });
  onTestFinished(() => t.close());
  return postJson(t.app, "/tasks", body);
}

/** POST a valid request for `story`. */
function postTask(fake: FakeLlm, story: string) {
  return postBody(fake, { story, startUrl, success });
}

describe("POST /tasks", () => {
  test("a story with a route through the interface gives 201, a clean goal and what was stripped", async () => {
    const story = "open Settings and click the Archive tab to see my old orders";
    const fake = fakeLlm({
      extractor: [
        { goal: "you want to see your old orders", strippedPaths: ["Settings", "Archive"] },
      ],
    });

    const { status, body } = await postTask(fake, story);

    expect(status).toBe(201);
    expect(Task.safeParse(body.task).success).toBe(true);
    expect(TaskId.safeParse(body.task.id).success).toBe(true);
    expect(pathWordsIn(body.task.goal)).toEqual([]);
    expect(body.rewritten).toBe(true);
    expect(body.task.strippedPaths).toContain("Settings");
    expect(body.task.strippedPaths).toContain("Archive");
    expect(body.task.sourceStory).toBe(story);
    expect(body.task.success).toEqual(success);
    expect(body.task.startUrl).toBe(startUrl);

    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call?.role).toBe("extractor");
    // The whole array: nothing else, `success` and `startUrl` included, reaches the model.
    expect(call?.messages).toEqual([
      { role: "system", content: readFileSync(EXTRACTOR_PROMPT_FILE, "utf8") },
      { role: "user", content: story },
    ]);
  });

  test("a screen name listed with its UI noun is stored and checked by its name", async () => {
    const story = "open Settings and click the Archive tab to see my old orders";
    const fake = fakeLlm({
      extractor: [
        {
          goal: "you want to see your old orders",
          strippedPaths: ["Settings", "Archive tab", "  "],
        },
      ],
    });

    const { status, body } = await postTask(fake, story);

    expect(status).toBe(201);
    expect(body.task.strippedPaths).toEqual(["Settings", "Archive"]);

    const kept = {
      goal: "you want to see your old orders in the Archive",
      strippedPaths: ["Archive tab"],
    };
    const refused = await postTask(fakeLlm({ extractor: [kept, kept] }), story);
    expect(refused.status).toBe(422);
    expect(refused.body.survived).toEqual(["Archive"]);
  });

  test("a story that already states an intent comes back unchanged", async () => {
    const story = "you want to see what you ordered three months ago";
    const fake = fakeLlm({ extractor: [{ goal: story, strippedPaths: [] }] });

    const { status, body } = await postTask(fake, story);

    expect(status).toBe(201);
    expect(body.rewritten).toBe(false);
    expect(body.task.goal).toBe(story);
    expect(body.task.strippedPaths).toEqual([]);
  });

  test("a goal that keeps a path word through the repair round is a 422 naming it", async () => {
    const story = "open the menu and pick Archive to see my old orders";
    const firstAnswer = { goal: "open the menu to see your old orders", strippedPaths: [] };
    const fake = fakeLlm({
      extractor: [firstAnswer, { goal: "use the menu to find your old orders", strippedPaths: [] }],
    });

    const { status, body } = await postTask(fake, story);

    expect(status).toBe(422);
    expect(body.survived).toContain("menu");

    expect(fake.calls.length).toBe(2);
    const [first, second] = fake.calls;
    expect(second?.messages).toHaveLength(4);
    expect(second?.messages.slice(0, 2)).toEqual(first?.messages);
    expect(second?.messages[2]).toEqual({
      role: "assistant",
      content: JSON.stringify(firstAnswer),
    });
    expect(second?.messages[3]?.role).toBe("user");
    expect(second?.messages[3]?.content).toContain("menu");
  });

  test("the repair round can fix a goal", async () => {
    const story = "click Archive to see my old orders";
    const fake = fakeLlm({
      extractor: [
        { goal: "click to see your old orders", strippedPaths: ["Archive"] },
        { goal: "you want to see your old orders", strippedPaths: ["Archive"] },
      ],
    });

    const { status, body } = await postTask(fake, story);

    expect(status).toBe(201);
    expect(body.rewritten).toBe(true);
    expect(fake.calls).toHaveLength(2);
  });

  test("a screen name the model says it stripped but kept is a 422", async () => {
    const story = "open Settings and click the Archive tab to see my old orders";
    const answer = {
      goal: "you want to see your old orders in the Archive",
      strippedPaths: ["Settings", "Archive"],
    };
    const fake = fakeLlm({ extractor: [answer, answer] });

    const { status, body } = await postTask(fake, story);

    expect(status).toBe(422);
    expect(body.survived).toEqual(["Archive"]);
  });

  test("a stripped screen name that is also a path word is named once", async () => {
    const story = "open Settings to see my old orders";
    const answer = {
      goal: "you want to see your old orders in Settings",
      strippedPaths: ["Settings"],
    };
    const fake = fakeLlm({ extractor: [answer, answer] });

    const { status, body } = await postTask(fake, story);

    expect(status).toBe(422);
    expect(body.survived).toEqual(["settings"]);
  });

  test("a body without success is a 400 and asks no model", async () => {
    const fake = fakeLlm({});
    const story = "you want to see what you ordered three months ago";

    const missing = await postBody(fake, { story, startUrl });
    expect(missing.status).toBe(400);
    expect(typeof missing.body.error).toBe("string");

    const extra = await postBody(fake, { story, startUrl, success, goal: story });
    expect(extra.status).toBe(400);
    expect(typeof extra.body.error).toBe("string");

    expect(fake.calls).toEqual([]);
  });

  test("a failed model call is a 502", async () => {
    const fake = fakeLlm({
      extractor: [
        new LlmError("llm_request_failed", "The extractor call failed", {
          tokensIn: 0,
          tokensOut: 0,
          usd: 0,
        }),
      ],
    });

    const { status, body } = await postTask(
      fake,
      "you want to see what you ordered three months ago",
    );

    expect(status).toBe(502);
    expect(body.error).toMatch(/^llm_request_failed/);
  });

  test("the prompt template names no impairment and no persona", () => {
    const prompt = readFileSync(EXTRACTOR_PROMPT_FILE, "utf8").toLowerCase();
    for (const word of ["impaired", "disabled", "persona"]) {
      expect(prompt).not.toContain(word);
    }
  });

  test("the prompt names every path word the task check refuses", () => {
    // The prompt spells core's list out by hand, so a word added to PATH_WORDS fails here first.
    const prompt = readFileSync(EXTRACTOR_PROMPT_FILE, "utf8").toLowerCase();
    for (const word of PATH_WORDS) {
      expect(prompt).toContain(word);
    }
  });
});
