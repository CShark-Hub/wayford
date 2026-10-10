import { afterEach, expect, test, vi } from "vitest";
import { BACKEND_STORAGE_KEY, currentBackend, onBackend, pickBackend } from "./actor-backend.js";

/** A page whose `localStorage` is stubbed over `items`, which the test reads back. */
function stubLocalStorage(entries: Record<string, string> = {}): Map<string, string> {
  const items = new Map(Object.entries(entries));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    },
  });
  return items;
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Back to the page's first state: no storage, so the memory alone, on the LLM.
  pickBackend("llm");
});

test("before any pick the backend is the LLM, ADR 0001's default", () => {
  stubLocalStorage();
  expect(currentBackend()).toBe("llm");
});

test("a pick is stored under its key and read back", () => {
  const items = stubLocalStorage();
  pickBackend("jev");
  expect(items.get(BACKEND_STORAGE_KEY)).toBe("jev");
  expect(currentBackend()).toBe("jev");
});

test("a stored value that names no backend is ignored", () => {
  stubLocalStorage({ [BACKEND_STORAGE_KEY]: "gpt" });
  expect(currentBackend()).toBe("llm");
});

test("with storage blocked, a pick still holds for the page's life", () => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    },
  });
  pickBackend("jev");
  expect(currentBackend()).toBe("jev");
});

test("a line about a run set names the backend", () => {
  expect(onBackend("llm")).toBe("on the LLM");
  expect(onBackend("jev")).toBe("on Jev");
});
