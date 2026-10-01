import { describe, expect, test } from "vitest";
import { type IdEntity, newId } from "./id.js";
import { ID_PREFIXES, prefixedId, RunId, TaskId } from "./primitives.js";

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";
const ULID = /^[0-9a-hjkmnp-tv-z]{26}$/;

/** The part after the one underscore. */
function ulidOf(id: string): string {
  return id.slice(id.indexOf("_") + 1);
}

describe("newId", () => {
  test("an id for every entity passes its own id schema", () => {
    expect(TaskId.safeParse(newId("task")).success).toBe(true);
    expect(RunId.safeParse(newId("run")).success).toBe(true);
    for (const [entity, prefix] of Object.entries(ID_PREFIXES)) {
      const id = newId(entity as IdEntity);
      expect(prefixedId(prefix).safeParse(id).success).toBe(true);
      expect(ulidOf(id)).toMatch(ULID);
    }
  });

  test("a thousand ids are all different", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId("run")));
    expect(ids.size).toBe(1000);
  });

  test("the first ten characters encode the time the id was made", () => {
    const before = Date.now();
    const id = newId("run");
    const after = Date.now();
    let decoded = 0;
    for (const char of ulidOf(id).slice(0, 10)) {
      decoded = decoded * 32 + CROCKFORD.indexOf(char);
    }
    expect(decoded).toBeGreaterThanOrEqual(before);
    expect(decoded).toBeLessThanOrEqual(after);
  });
});
