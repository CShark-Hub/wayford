import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { forgetRace, showRace, useShownRace } from "../arena/shown-race.js";
import {
  CURRENT_TARGET_STORAGE_KEY,
  clearCurrentTarget,
  readCurrentTarget,
  setCurrentTarget,
  targetLinks,
} from "./current-target.js";
import { stubSessionStorage } from "./test-support.js";

const shop = { taskId: "task_shop-orders", startUrl: "https://shop.example.com/" };
const other = { taskId: "task_other-site", startUrl: "https://other.example.org/start" };

const blocked = (): never => {
  throw new Error("SecurityError: storage is blocked");
};

/** The race the Race tab leads to, as a static render of `useShownRace` reads it. */
function shownRace(): string {
  function Shown() {
    return useShownRace() ?? "none";
  }
  return renderToStaticMarkup(createElement(Shown));
}

afterEach(() => {
  vi.unstubAllGlobals();
  forgetRace();
});

test("a target set is read back, and a cleared one reads as nothing", () => {
  const items = stubSessionStorage();
  expect(readCurrentTarget()).toBeUndefined();

  setCurrentTarget(shop);
  expect(readCurrentTarget()).toEqual(shop);
  expect(JSON.parse(items.get(CURRENT_TARGET_STORAGE_KEY) ?? "")).toEqual(shop);

  clearCurrentTarget();
  expect(readCurrentTarget()).toBeUndefined();
  expect(items.has(CURRENT_TARGET_STORAGE_KEY)).toBe(false);
});

test("with no sessionStorage, the store reads nothing and a set does not throw", () => {
  // Stubbed away: Node 25 and later define Web Storage globals, so the runtime cannot be relied on.
  vi.stubGlobal("sessionStorage", undefined);
  expect(typeof sessionStorage).toBe("undefined");
  expect(() => setCurrentTarget(shop)).not.toThrow();
  expect(readCurrentTarget()).toBeUndefined();
});

test.each([
  ["not JSON", "{task"],
  ["no object", JSON.stringify("task_shop-orders")],
  ["a bad task id", JSON.stringify({ taskId: "Task_Shop", startUrl: "https://shop.example.com/" })],
  [
    "a non-http URL",
    JSON.stringify({ taskId: "task_shop-orders", startUrl: "ftp://example.com/" }),
  ],
  ["a URL that is no URL", JSON.stringify({ taskId: "task_shop-orders", startUrl: "shop" })],
])("a broken stored value reads as nothing: %s", (_name, stored) => {
  stubSessionStorage({ [CURRENT_TARGET_STORAGE_KEY]: stored });
  expect(readCurrentTarget()).toBeUndefined();
});

test("a storage that throws reads as nothing, and setting a target does not throw", () => {
  // Reading the global itself throws, as a sandboxed frame's does.
  vi.stubGlobal("sessionStorage", undefined);
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get: blocked });
  expect(readCurrentTarget()).toBeUndefined();
  expect(() => setCurrentTarget(shop)).not.toThrow();
  expect(() => clearCurrentTarget()).not.toThrow();

  // The global reads, and every method on it throws.
  vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
  expect(readCurrentTarget()).toBeUndefined();
  expect(() => setCurrentTarget(shop)).not.toThrow();
  expect(() => clearCurrentTarget()).not.toThrow();
  expect(readCurrentTarget()).toBeUndefined();
});

test("setting a new task forgets the shown race, and setting the same task does not", () => {
  stubSessionStorage();
  showRace("race_shown");
  setCurrentTarget(shop);
  expect(shownRace()).toBe("none");

  showRace("race_shown");
  setCurrentTarget({ ...shop, startUrl: "https://shop.example.com/orders" });
  expect(shownRace()).toBe("race_shown");

  setCurrentTarget(other);
  expect(shownRace()).toBe("none");
});

test("clearing a target forgets the shown race, and clearing none does not", () => {
  stubSessionStorage();
  setCurrentTarget(shop);
  showRace("race_shown");
  clearCurrentTarget();
  expect(shownRace()).toBe("none");

  showRace("race_shown");
  clearCurrentTarget();
  expect(shownRace()).toBe("race_shown");
});

test("the snapshot read twice is the same object", () => {
  stubSessionStorage();
  setCurrentTarget(shop);
  expect(readCurrentTarget()).toBe(readCurrentTarget());
});

test("a start URL the Lens refuses leaves the Lens link plain, and the others carry the target", () => {
  const withPassword = {
    taskId: "task_shop-orders",
    startUrl: "https://user:pass@shop.example.com/",
  };
  stubSessionStorage();
  setCurrentTarget(withPassword);
  expect(readCurrentTarget()).toEqual(withPassword);
  expect(targetLinks(withPassword)).toEqual({
    target: { to: "/target", search: { task: withPassword.taskId } },
    lens: { to: "/lens" },
    race: { to: "/race", search: { task: withPassword.taskId } },
    report: { to: "/report/$taskId", params: { taskId: withPassword.taskId } },
  });
});
