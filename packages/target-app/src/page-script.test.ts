import { describe, expect, test } from "vitest";
import {
  addressWithoutParams,
  applyTheme,
  isStored,
  type MenuPanel,
  type MenuToggle,
  openStore,
  wireMenu,
} from "./page-script.js";
import {
  DEFAULT_PARAMS,
  type ParamStore,
  resolveParams,
  STORAGE_KEY,
  type TargetParams,
  themeVariables,
} from "./params.js";

function memoryStore(initial?: object): ParamStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial) data.set(STORAGE_KEY, JSON.stringify(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const origin = "http://localhost:5174";

/** What `main.ts` does, in its order: resolve (and store) first, then ask for the address. */
function addressAfterLoad(path: string, store: ParamStore | undefined): string | undefined {
  const href = `${origin}${path}`;
  const params = resolveParams(new URL(href).search, store);
  return addressWithoutParams(href, store, params);
}

describe("openStore", () => {
  test("returns what the opener returns", () => {
    const store = memoryStore();
    expect(openStore(() => store)).toBe(store);
  });

  test("returns undefined when the opener throws", () => {
    expect(
      openStore(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
    ).toBeUndefined();
  });
});

describe("applyTheme", () => {
  const cases: TargetParams[] = [DEFAULT_PARAMS, { contrast: 7, fontPx: 20, targetPx: 40 }];

  test.each(cases)("sets each variable once for %o", (params) => {
    const calls: [string, string][] = [];
    applyTheme({ setProperty: (name, value) => void calls.push([name, value ?? ""]) }, params);
    expect(Object.fromEntries(calls)).toEqual(themeVariables(params));
    expect(calls).toHaveLength(Object.keys(themeVariables(params)).length);
  });
});

describe("isStored", () => {
  const params: TargetParams = { contrast: 3, fontPx: 20, targetPx: 40 };

  test("true only for the exact JSON of the parameters", () => {
    expect(isStored(memoryStore(params), params)).toBe(true);
    expect(isStored(memoryStore({ ...params, contrast: 4 }), params)).toBe(false);
    expect(isStored(memoryStore(), params)).toBe(false);
    expect(isStored(undefined, params)).toBe(false);
  });
});

describe("addressWithoutParams", () => {
  test("strips all three parameters, with no trailing `?`", () => {
    expect(addressAfterLoad("/deliveries?contrast=3&fontPx=20&targetPx=40", memoryStore())).toBe(
      "/deliveries",
    );
  });

  test("keeps other query parameters and the hash", () => {
    expect(addressAfterLoad("/deliveries?contrast=3&tab=2#top", memoryStore())).toBe(
      "/deliveries?tab=2#top",
    );
  });

  test("on home, gives `/`", () => {
    expect(addressAfterLoad("/?contrast=4.5", memoryStore())).toBe("/");
  });

  test("no parameters in the URL: nothing to strip, even with a stored value", () => {
    const store = memoryStore({ contrast: 7, fontPx: 20, targetPx: 40 });
    expect(addressAfterLoad("/deliveries", store)).toBeUndefined();
  });

  test("storage blocked: the parameters stay", () => {
    expect(addressAfterLoad("/deliveries?contrast=3", undefined)).toBeUndefined();
  });

  test("setItem throws: the parameters stay", () => {
    const store: ParamStore = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(addressAfterLoad("/deliveries?contrast=3", store)).toBeUndefined();
  });

  test("setItem does nothing and an older setting is stored: the parameters stay", () => {
    const older = memoryStore({ contrast: 7, fontPx: 20, targetPx: 40 });
    const store: ParamStore = { getItem: older.getItem, setItem: () => {} };
    expect(addressAfterLoad("/deliveries?contrast=3", store)).toBeUndefined();
  });

  test("getItem throws: the parameters stay", () => {
    const store: ParamStore = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {},
    };
    expect(addressAfterLoad("/deliveries?contrast=3", store)).toBeUndefined();
  });
});

describe("wireMenu", () => {
  function fakes(expanded?: string) {
    const attributes = new Map<string, string>();
    if (expanded !== undefined) attributes.set("aria-expanded", expanded);
    const listeners: (() => void)[] = [];
    const toggles: [string, boolean | undefined][] = [];
    const toggle: MenuToggle = {
      getAttribute: (name) => attributes.get(name) ?? null,
      setAttribute: (name, value) => void attributes.set(name, value),
      addEventListener: (_type, listener) => void listeners.push(listener),
    };
    const nav: MenuPanel = {
      classList: {
        toggle: (name, force) => {
          toggles.push([name, force]);
          return force ?? false;
        },
      },
    };
    const click = (): void => {
      for (const listener of listeners) listener();
    };
    return { attributes, listeners, toggles, toggle, nav, click };
  }

  test("each click flips aria-expanded and the nav's open class together", () => {
    const { attributes, toggles, toggle, nav, click } = fakes("false");
    wireMenu(toggle, nav);
    click();
    expect(attributes.get("aria-expanded")).toBe("true");
    click();
    expect(attributes.get("aria-expanded")).toBe("false");
    click();
    expect(attributes.get("aria-expanded")).toBe("true");
    expect(toggles).toEqual([
      ["open", true],
      ["open", false],
      ["open", true],
    ]);
  });

  test("with no aria-expanded, the first click opens", () => {
    const { attributes, toggles, toggle, nav, click } = fakes();
    wireMenu(toggle, nav);
    click();
    expect(attributes.get("aria-expanded")).toBe("true");
    expect(toggles).toEqual([["open", true]]);
  });

  test("a missing toggle or nav registers nothing", () => {
    const { listeners, toggle, nav } = fakes("false");
    expect(() => wireMenu(null, nav)).not.toThrow();
    expect(() => wireMenu(toggle, null)).not.toThrow();
    expect(listeners).toHaveLength(0);
  });
});
