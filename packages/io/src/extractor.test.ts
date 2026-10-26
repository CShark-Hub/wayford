import { readFileSync } from "node:fs";
import { LlmError } from "@wayford/agent";
import { type FakeLlm, fakeLlm } from "@wayford/agent/fake";
import { PATH_WORDS, pathWordsIn, Task, TaskId } from "@wayford/core";
import { taskFixture } from "@wayford/core/fixtures";
import { describe, expect, onTestFinished, test } from "vitest";
import { EXTRACTOR_PROMPT_FILE, STEP_WORDS } from "./extractor.js";
import { crlfCheckout, postJson, testApp } from "./test-app.js";

// The past-order task's own start and success, so they follow the fixture the target app checks.
const { startUrl, success } = taskFixture("task_past-order");

/** The prompt as the model reads it: line endings as Git stores them, whatever the checkout. */
const PROMPT = readFileSync(EXTRACTOR_PROMPT_FILE, "utf8").replaceAll("\r\n", "\n");

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
      { role: "system", content: PROMPT },
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

  test("a goal that keeps its steps through the repair round is a 422 naming them", async () => {
    // The review's probe (CShark-Hub/wayford#26): the model keeps the route and lists nothing, so
    // core's seven words and the model's own list both let it through.
    const story = "go to Deliveries, then open Order archive to see what I ordered";
    const kept = {
      goal: "go to Deliveries, then open Order archive to see what you ordered",
      strippedPaths: [],
    };
    const fake = fakeLlm({ extractor: [kept, kept] });

    const { status, body } = await postTask(fake, story);

    expect(status).toBe(422);
    expect(body.survived).toEqual(["go to", "then", "Deliveries", "Order archive"]);
    expect(fake.calls).toHaveLength(2);
    const repair = fake.calls[1]?.messages[3]?.content ?? "";
    for (const term of body.survived) {
      expect(repair).toContain(term);
    }
  });

  test("on the target app, a screen name of its routes is refused though the model did not list it", async () => {
    const kept = {
      goal: "you want to find your old orders in the Fulfilment ledger",
      strippedPaths: [],
    };
    const fake = fakeLlm({ extractor: [kept, kept] });

    const { status, body } = await postTask(
      fake,
      "I want to find my old orders in the Fulfilment ledger",
    );

    expect(status).toBe(422);
    expect(body.survived).toEqual(["Fulfilment ledger"]);
  });

  test("off the target app, a screen name the model did not list goes through, and the step words are still refused", async () => {
    const elsewhere = {
      startUrl: "https://example.com/",
      success: { type: "urlMatches", pattern: "https://example.com/**" },
    };
    const named = "you want to find your old orders in the Order archive";
    const accepted = await postBody(fakeLlm({ extractor: [{ goal: named, strippedPaths: [] }] }), {
      story: named,
      ...elsewhere,
    });
    expect(accepted.status).toBe(201);

    const stepped = { goal: "go to the shop, then find your old orders", strippedPaths: [] };
    const refused = await postBody(fakeLlm({ extractor: [stepped, stepped] }), {
      story: stepped.goal,
      ...elsewhere,
    });
    expect(refused.status).toBe(422);
    expect(refused.body.survived).toEqual(["go to", "then"]);
  });

  test.each([
    // On the target app: the fixture goals, a step word's letters across or inside other words, the
    // easy goal's link, and a word from a route name that is not the name.
    ["you want to know where your next parcel is going", startUrl, success],
    ["you want to see what you ordered three months ago", startUrl, success],
    ["you want to see what you ordered a year ago to the day", startUrl, success],
    ["you want to know if your parcel can go tomorrow", startUrl, success],
    ["you want to strengthen your password", startUrl, success],
    ["you want to know when your parcel is going to arrive", startUrl, success],
    ["you want to verify your delivery address", startUrl, success],
    ["you want to find an old order", startUrl, success],
    // Off it: Our pick's goals G1 to G3 on cshark.com (`docs/DEMO.md`).
    [
      "Find the names of the company's board members.",
      "https://www.cshark.com/",
      { type: "urlMatches", pattern: "https://www.cshark.com/about/**" },
    ],
    [
      "Find out what the salary is for the Senior Performance Test Engineer role.",
      "https://www.cshark.com/",
      {
        type: "urlMatches",
        pattern: "https://www.cshark.com/job-offers/senior-performance-test-engineer/**",
      },
    ],
    [
      "Apply for the Senior Performance Test Engineer role.",
      "https://www.cshark.com/",
      {
        type: "urlMatches",
        pattern: "https://joboffers.cshark.com/**/senior-performance-test-engineer,ja,*",
      },
    ],
  ])("an intent passes in one call: %s", async (goal, start, condition) => {
    const fake = fakeLlm({ extractor: [{ goal, strippedPaths: [] }] });

    const { status } = await postBody(fake, { story: goal, startUrl: start, success: condition });

    expect(status).toBe(201);
    expect(fake.calls).toHaveLength(1);
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

  test("a prompt checked out with CRLF reaches the model as it does from an LF checkout", async () => {
    crlfCheckout();
    const crlf = await import("./extractor.js");
    const story = "you want to see what you ordered three months ago";
    const fake = fakeLlm({ extractor: [{ goal: story, strippedPaths: [] }] });

    await crlf.extractTask(fake, { story, startUrl, success }, new URL(startUrl).origin);

    expect(fake.calls[0]?.messages[0]).toEqual({ role: "system", content: PROMPT });
  });

  test("the prompt template names no impairment and no persona", () => {
    const prompt = readFileSync(EXTRACTOR_PROMPT_FILE, "utf8").toLowerCase();
    for (const word of ["impaired", "disabled", "persona"]) {
      expect(prompt).not.toContain(word);
    }
  });

  test("the prompt names every path word and step word the task check refuses", () => {
    // The prompt spells both lists out by hand, so a word added to either fails here first.
    const prompt = readFileSync(EXTRACTOR_PROMPT_FILE, "utf8").toLowerCase();
    for (const word of [...PATH_WORDS, ...STEP_WORDS]) {
      expect(prompt).toContain(word);
    }
  });
});
