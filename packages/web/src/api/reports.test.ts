import { QueryClient } from "@tanstack/react-query";
import { reportFixture } from "@wayford/core/fixtures";
import { afterEach, expect, test, vi } from "vitest";
import { analyse, fetchReport, reportQuery } from "./reports.js";

/** Make the next `fetch` answer with `response`, and hand back the stub to inspect calls. */
function answer(response: Response) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** What the one call to the `fetch` stub sent: its URL, method, content type and parsed body. */
function sent(fetch: ReturnType<typeof answer>) {
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0] ?? [];
  return {
    url,
    method: init?.method,
    contentType: new Headers(init?.headers).get("content-type"),
    body: JSON.parse(String(init?.body)) as unknown,
  };
}

const HARD = "task_past-order";
const report = reportFixture(HARD);

afterEach(() => {
  vi.unstubAllGlobals();
});

test("fetchReport reads a task's stored report from /api/reports/:taskId", async () => {
  const fetch = answer(Response.json(report));
  await expect(fetchReport(HARD)).resolves.toStrictEqual(report);
  expect(fetch).toHaveBeenCalledWith("/api/reports/task_past-order");
});

test("fetchReport answers null when io has no report on the task", async () => {
  answer(Response.json({ error: "no report on task_past-order" }, { status: 404 }));
  await expect(fetchReport(HARD)).resolves.toBeNull();
});

test("a task id goes into the path encoded", async () => {
  const fetch = answer(Response.json(report));
  await fetchReport("task_a/b?c#d");
  expect(fetch).toHaveBeenCalledWith("/api/reports/task_a%2Fb%3Fc%23d");
});

test("a body that is not a report rejects with zod's account of why", async () => {
  answer(Response.json({ ...report, backend: "gpt" }));
  const fetched = fetchReport(HARD);
  await expect(fetched).rejects.toThrow(/^io sent something that is not a report:\n/);
  await expect(fetched).rejects.toThrow("→ at backend");

  answer(Response.json({ ...report, taskId: "past-order" }, { status: 201 }));
  const analysed = analyse(HARD);
  await expect(analysed).rejects.toThrow(/^io sent something that is not a report:\n/);
  await expect(analysed).rejects.toThrow("→ at taskId");
});

test("reportQuery keys the report by task, and does not retry a failure", async () => {
  const query = reportQuery(HARD);
  expect(query.queryKey).toStrictEqual(["reports", HARD]);
  expect(query.retry).toBe(false);

  const client = new QueryClient();
  const fetch = answer(Response.json(report));
  await expect(client.fetchQuery(query)).resolves.toStrictEqual(report);
  expect(fetch).toHaveBeenCalledWith("/api/reports/task_past-order");
});

test("analyse with no backend posts an empty body as JSON, so io picks its default", async () => {
  const fetch = answer(Response.json(report, { status: 201 }));
  await expect(analyse(HARD)).resolves.toStrictEqual(report);
  expect(sent(fetch)).toStrictEqual({
    url: "/api/reports/task_past-order",
    method: "POST",
    // io answers 415 to any other content type.
    contentType: "application/json",
    body: {},
  });
});

test("analyse with a backend posts it", async () => {
  const fetch = answer(Response.json({ ...report, backend: "llm" }, { status: 201 }));
  await expect(analyse(HARD, "llm")).resolves.toStrictEqual({ ...report, backend: "llm" });
  expect(sent(fetch)).toStrictEqual({
    url: "/api/reports/task_past-order",
    method: "POST",
    contentType: "application/json",
    body: { backend: "llm" },
  });
});

test("analyse rejects a 404, unlike fetchReport: on POST it means no runs to read", async () => {
  answer(
    Response.json({ error: "no runs of task_past-order on jev; none on llm" }, { status: 404 }),
  );
  await expect(analyse(HARD)).rejects.toThrow(
    "io answered 404: no runs of task_past-order on jev; none on llm",
  );
});
