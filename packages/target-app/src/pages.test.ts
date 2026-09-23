import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { GOALS, PAGES } from "./pages.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const html = (file: string): string => readFileSync(`${root}${file}`, "utf8");
const paths = PAGES.map((page) => page.path);

/** Every `<a href>` on a page as `{ href, attrs, text }`. Plain regex: the markup is ours. */
function links(file: string): { href: string; attrs: string; text: string }[] {
  return [...html(file).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => {
    const attrs = m[1] ?? "";
    return {
      href: /href="([^"]*)"/.exec(attrs)?.[1] ?? "",
      attrs,
      text: (m[2] ?? "").replace(/<[^>]*>/g, "").trim(),
    };
  });
}

/** Breadth-first walk from `/` over links, optionally skipping one class. */
function reachable(skipClass?: string): Set<string> {
  const seen = new Set(["/"]);
  const queue = ["/"];
  while (queue.length > 0) {
    const current = queue.shift();
    const page = PAGES.find((p) => p.path === current);
    if (!page) continue;
    for (const link of links(page.file)) {
      if (skipClass && link.attrs.includes(`class="${skipClass}"`)) continue;
      if (!seen.has(link.href)) {
        seen.add(link.href);
        queue.push(link.href);
      }
    }
  }
  return seen;
}

describe("URL contract", () => {
  test.each(PAGES)("$path has $file", ({ file }) => {
    expect(existsSync(`${root}${file}`)).toBe(true);
  });

  test("every internal link resolves to a contract path", () => {
    for (const page of PAGES) {
      for (const link of links(page.file)) {
        expect(paths, `${page.file} links to ${link.href}`).toContain(link.href);
      }
    }
  });

  test("both goal pages are reachable from home", () => {
    const seen = reachable();
    for (const goal of GOALS) expect(seen).toContain(goal.path);
  });

  test("the easy goal is two clicks from home", () => {
    const fromHome = links("index.html").map((l) => l.href);
    const fromAccount = links("account.html").map((l) => l.href);
    expect(fromHome).toContain("/account");
    expect(fromAccount).toContain("/account/address");
  });

  test("the hard goal is reached only through the hard link", () => {
    expect(reachable("hard-link")).not.toContain("/deliveries/archive");
    const hardLinks = PAGES.flatMap((p) =>
      links(p.file)
        .filter((l) => l.attrs.includes('class="hard-link"'))
        .map((l) => ({ ...l, file: p.file })),
    );
    expect(hardLinks).toEqual([expect.objectContaining({ file: "deliveries.html" })]);
    expect(hardLinks[0]?.href).toBe("/deliveries/archive");
  });

  test("goal patterns match their own path and nothing else", () => {
    for (const goal of GOALS) {
      const suffix = goal.pattern.replace("**", "");
      expect(paths.filter((p) => p.endsWith(suffix))).toEqual([goal.path]);
    }
  });
});

describe("accessible names", () => {
  test.each(PAGES)("$file: every link and button has visible text", ({ file }) => {
    for (const link of links(file)) expect(link.text, link.href).not.toBe("");
    for (const m of html(file).matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
      const text = (m[1] ?? "").replace(/<span aria-hidden="true">[^<]*<\/span>/g, "");
      expect(text.replace(/<[^>]*>/g, "").trim()).not.toBe("");
    }
  });

  test.each(PAGES)("$file: every checkbox sits inside a label", ({ file }) => {
    const source = html(file);
    const inputs = source.match(/<input\b/g)?.length ?? 0;
    const labelled = source.match(/<label\b[^>]*>\s*<input\b/g)?.length ?? 0;
    expect(labelled).toBe(inputs);
  });

  test.each(PAGES)("$file: one mobile menu toggle, wired to the nav", ({ file }) => {
    const source = html(file);
    expect(source.match(/id="menu-toggle"/g)).toHaveLength(1);
    expect(source).toContain('aria-controls="site-nav"');
    expect(source).toContain('id="site-nav"');
  });
});
