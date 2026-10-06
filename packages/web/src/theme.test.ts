import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { applyTheme, currentTheme, THEME_STORAGE_KEY, type Theme } from "./theme.js";

/** The inline script in `index.html` that sets the theme before first paint. */
const BOOT_SCRIPT = (() => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (inline === undefined) throw new Error("index.html has no inline boot script");
  return inline;
})();

/** What the boot script needs from the page, stubbed. */
interface Page {
  /** `undefined` when nothing is stored; a function when reading storage throws. */
  stored?: string | (() => never);
  osDark: boolean;
}

/** Run the boot script against a stubbed page, and return the `data-theme` it set. */
function boot({ stored, osDark }: Page): string | undefined {
  const attributes: Record<string, string> = {};
  const localStorage = {
    getItem(key: string): string | null {
      if (typeof stored === "function") return stored();
      return key === THEME_STORAGE_KEY ? (stored ?? null) : null;
    },
  };
  const matchMedia = (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && osDark,
  });
  const document = {
    documentElement: {
      setAttribute(name: string, value: string) {
        attributes[name] = value;
      },
    },
  };
  // The script is a classic script that reads three globals; each is passed in by name.
  new Function("localStorage", "matchMedia", "document", BOOT_SCRIPT)(
    localStorage,
    matchMedia,
    document,
  );
  return attributes["data-theme"];
}

const throws = (): never => {
  throw new Error("SecurityError: storage is blocked");
};

test.each<[string, Page, Theme]>([
  ["a stored Night wins over a light system", { stored: "dark", osDark: false }, "dark"],
  ["a stored Daylight wins over a dark system", { stored: "light", osDark: true }, "light"],
  ["nothing stored follows a dark system", { osDark: true }, "dark"],
  ["nothing stored follows a light system", { osDark: false }, "light"],
  ["a stored value that is no theme follows the system", { stored: "sepia", osDark: true }, "dark"],
  ["storage that throws follows the system", { stored: throws, osDark: true }, "dark"],
])("boot script: %s", (_name, page, theme) => {
  expect(boot(page)).toBe(theme);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A stubbed `<html>` and storage, for the app's own side of the contract. */
function stubPage(storage: Pick<Storage, "setItem">) {
  const attributes: Record<string, string> = {};
  vi.stubGlobal("document", {
    documentElement: {
      getAttribute: (name: string) => attributes[name] ?? null,
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    },
  });
  vi.stubGlobal("localStorage", storage);
  return attributes;
}

test("applyTheme writes the attribute and the stored choice", () => {
  const stored: Record<string, string> = {};
  const attributes = stubPage({
    setItem: (key, value) => {
      stored[key] = value;
    },
  });
  applyTheme("dark");
  expect(attributes["data-theme"]).toBe("dark");
  expect(stored).toEqual({ [THEME_STORAGE_KEY]: "dark" });
  expect(currentTheme()).toBe("dark");
});

test("applyTheme still flips the attribute when storage throws", () => {
  const attributes = stubPage({ setItem: throws });
  applyTheme("light");
  expect(attributes["data-theme"]).toBe("light");
});

test("currentTheme is Daylight where there is no document", () => {
  expect(currentTheme()).toBe("light");
});
