/**
 * Test support for the current target, never imported by the app: a `sessionStorage` in memory.
 * `current-target.test.ts`, `top-bar.test.tsx` and `target.test.tsx` share it, as filter's tests
 * share its `test-support.ts`.
 */
import { vi } from "vitest";

/**
 * A `sessionStorage` in memory, holding `entries`, stubbed onto the global, so the current target
 * is read and written as in a browser tab. Node has none, so a test that stubs nothing reads no
 * target. The map is the storage itself, for a test to read back; `vi.unstubAllGlobals` removes it.
 */
export function stubSessionStorage(entries: Record<string, string> = {}): Map<string, string> {
  const items = new Map(Object.entries(entries));
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  });
  return items;
}
