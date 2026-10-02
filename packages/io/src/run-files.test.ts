import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { attachment, runFilePath } from "./run-files.js";

// Absolute on every platform: on Windows `resolve` puts the current drive in front.
const runsDir = resolve("/srv/wayford/runs");
const runId = "run_01abc";
const folder = join(runsDir, runId);

describe("runFilePath", () => {
  test("a stored name resolves inside the run's folder", () => {
    expect(runFilePath(runsDir, runId, "ada-seed7-run_01abc.webm")).toBe(
      join(folder, "ada-seed7-run_01abc.webm"),
    );
  });

  test("a nested stored path resolves inside the run's folder", () => {
    expect(runFilePath(runsDir, runId, "sub/a.png")).toBe(join(folder, "sub", "a.png"));
  });

  test("a name that starts with two dots stays inside", () => {
    expect(runFilePath(runsDir, runId, "..notes.txt")).toBe(join(folder, "..notes.txt"));
  });

  test.each([
    "..",
    "../x.webm",
    "../../outside.webm",
    "a/../../x",
    // Another run's file: under the runs directory, outside this run's folder.
    "../run_other/a.webm",
    // A sibling whose name starts with this run's id, which a prefix check would let through.
    "../run_01abc-2/a.webm",
  ])("%s lands outside the run's folder and is refused", (stored) => {
    expect(runFilePath(runsDir, runId, stored)).toBeUndefined();
  });

  test("an absolute path counts where it lands: refused outside the folder, served inside", () => {
    expect(runFilePath(runsDir, runId, resolve("/srv/wayford/outside.webm"))).toBeUndefined();
    expect(runFilePath(runsDir, runId, join(runsDir, "run_other", "a.webm"))).toBeUndefined();
    const inside = join(folder, "a.webm");
    expect(runFilePath(runsDir, runId, inside)).toBe(inside);
  });

  test.each(["", ".", "sub/.."])("%j is the folder itself, which is no file to serve", (stored) => {
    expect(runFilePath(runsDir, runId, stored)).toBeUndefined();
  });

  // Each would resolve a plain name without the check: the first and the last to a file straight
  // in the runs directory, outside every run's folder.
  test.each(["../runs", "run_ABC", ""])(
    "a run id %j that is no RunId gives undefined, even for a plain stored name",
    (id) => {
      expect(runFilePath(runsDir, id, "ada-seed7-run_01abc.webm")).toBeUndefined();
    },
  );
});

describe("attachment", () => {
  test("an ASCII name passes through unchanged in both parts", () => {
    expect(attachment("ada-seed7-run_01abc.webm")).toBe(
      "attachment; filename=\"ada-seed7-run_01abc.webm\"; filename*=UTF-8''ada-seed7-run_01abc.webm",
    );
  });

  test("zoë loses the accent in filename and keeps it in filename* as UTF-8", () => {
    // Written as an escape so the test holds the precomposed ë, U+00EB, whatever the editor saves.
    expect(attachment("zo\u00eb-seed1-run_x.webm")).toBe(
      "attachment; filename=\"zoe-seed1-run_x.webm\"; filename*=UTF-8''zo%C3%AB-seed1-run_x.webm",
    );
  });

  test("any other non-ASCII character is an underscore, so the header is one Node accepts", () => {
    // A label may hold any Unicode letter, and Node refuses header text beyond Latin-1.
    const name = "ζωή-seed1-run_x.webm";
    expect(() => new Headers({ "Content-Disposition": `attachment; filename="${name}"` })).toThrow(
      TypeError,
    );
    const header = attachment(name);
    expect(header).toBe(
      "attachment; filename=\"___-seed1-run_x.webm\"; filename*=UTF-8''%CE%B6%CF%89%CE%AE-seed1-run_x.webm",
    );
    expect(() => new Headers({ "Content-Disposition": header })).not.toThrow();
  });

  test("a quote or a backslash never reaches the quoted filename", () => {
    expect(attachment('a"b\\c.webm')).toBe(
      "attachment; filename=\"a_b_c.webm\"; filename*=UTF-8''a%22b%5Cc.webm",
    );
    // NFKD turns the fullwidth quote into `"`, so quotes are replaced after the normalisation.
    expect(attachment("a＂b.webm")).toBe(
      "attachment; filename=\"a_b.webm\"; filename*=UTF-8''a%EF%BC%82b.webm",
    );
  });

  test("filename* also encodes the characters encodeURIComponent keeps and RFC 5987 forbids", () => {
    expect(attachment("it's (1)*.webm")).toBe(
      "attachment; filename=\"it's (1)*.webm\"; filename*=UTF-8''it%27s%20%281%29%2A.webm",
    );
  });
});
