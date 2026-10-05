import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { JargonList } from "./jargon.js";

const fixture: unknown = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/jargon.json", import.meta.url)), "utf8"),
);

describe("JargonList (the target app's jargon terms)", () => {
  test("the fixture parses", () => {
    expect(JargonList.safeParse(fixture).success).toBe(true);
  });

  test("the list says it is folk, and nothing else", () => {
    // Provenance on every list (AGENTS.md): a list written by a model would be `llm`, out of scope.
    expect(JargonList.safeParse({ terms: ["ledger"] }).success).toBe(false);
    expect(JargonList.safeParse({ provenance: "llm", terms: ["ledger"] }).success).toBe(false);
  });

  test("it holds at least one term, and no term is empty", () => {
    expect(JargonList.safeParse({ provenance: "folk", terms: [] }).success).toBe(false);
    expect(JargonList.safeParse({ provenance: "folk", terms: [""] }).success).toBe(false);
    expect(JargonList.safeParse({ provenance: "folk", terms: [" "] }).success).toBe(false);
  });

  test("terms are distinct, ignoring case", () => {
    const same = { provenance: "folk", terms: ["ledger", "ledger"] };
    expect(JargonList.safeParse(same).success).toBe(false);
    const cased = { provenance: "folk", terms: ["Fulfilment ledger", "fulfilment Ledger"] };
    expect(JargonList.safeParse(cased).success).toBe(false);
  });
});
