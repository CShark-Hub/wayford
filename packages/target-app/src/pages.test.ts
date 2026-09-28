import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { GOALS, PAGES } from "./pages.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (file: string): string => readFileSync(`${root}${file}`, "utf8");
/** Page markup without comments, so a commented-out link never counts as a route. */
const html = (file: string): string => source(file).replace(/<!--[\s\S]*?-->/g, "");
const paths = PAGES.map((page) => page.path);

/** Text a reader or the accessibility tree gets: tags and `aria-hidden` decoration removed. */
function visibleText(markup: string): string {
  return markup
    .replace(/<span\b[^>]*\saria-hidden="true"[^>]*>[^<]*<\/span>/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

/** Whole-token class match: `hard-link` is not `no-hard-link`, and `data-class` is ignored. */
function hasClass(attrs: string, name: string): boolean {
  const value = /(?:^|\s)class=["']([^"']*)["']/.exec(attrs)?.[1] ?? "";
  return value.split(/\s+/).includes(name);
}

/** Every `<a href>` on a page as `{ href, attrs, text }`. Plain regex: the markup is ours. */
function links(file: string): { href: string; attrs: string; text: string }[] {
  return [...html(file).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => {
    const attrs = m[1] ?? "";
    return {
      href: /href=["']([^"']*)["']/.exec(attrs)?.[1] ?? "",
      attrs,
      text: visibleText(m[2] ?? ""),
    };
  });
}

const bigLinks = (file: string): string[] =>
  links(file)
    .filter((l) => hasClass(l.attrs, "big-link"))
    .map((l) => l.href);

/** Breadth-first walk from `/` over links, optionally skipping one class. */
function reachable(skipClass?: string): Set<string> {
  const seen = new Set(["/"]);
  const queue = ["/"];
  while (queue.length > 0) {
    const current = queue.shift();
    const page = PAGES.find((p) => p.path === current);
    if (!page) continue;
    for (const link of links(page.file)) {
      if (skipClass && hasClass(link.attrs, skipClass)) continue;
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

  test("the easy goal is two clicks from home through large links", () => {
    expect(bigLinks("index.html")).toContain("/account");
    expect(bigLinks("account.html")).toContain("/account/address");
  });

  test("deliveries, where 'parcel' pulls people first, also has a large link to the easy goal", () => {
    expect(bigLinks("deliveries.html")).toContain("/account/address");
  });

  test("the hard goal is reached only through the one hard link, on deliveries", () => {
    expect(reachable("hard-link")).not.toContain("/deliveries/archive");
    const hardLinks = PAGES.flatMap((p) =>
      links(p.file)
        .filter((l) => hasClass(l.attrs, "hard-link"))
        .map((l) => ({ href: l.href, file: p.file })),
    );
    expect(hardLinks).toEqual([{ href: "/deliveries/archive", file: "deliveries.html" }]);
  });

  test("goal patterns are `**` plus their path, and no other contract path ends that way", () => {
    for (const goal of GOALS) {
      expect(goal.pattern).toBe(`**${goal.path}`);
      expect(paths.filter((p) => p.endsWith(goal.path))).toEqual([goal.path]);
    }
  });
});

describe("markup", () => {
  // A style attribute or a <style> element would put a size or colour outside style.css, where
  // params.test.ts checks every size against the persona cuts and lets only .hard-link read the
  // tunable variables.
  test.each(PAGES)("$file has no style attribute and no <style> element", ({ file }) => {
    expect(html(file)).not.toMatch(/<style\b|\sstyle\s*=/i);
  });

  test.each(PAGES)("$file is branded as the fictional Quillmere", ({ file }) => {
    const markup = html(file);
    expect(markup).toMatch(/<title>[^<]+ · Quillmere<\/title>/);
    const footer = /<footer\b[^>]*>([\s\S]*?)<\/footer>/.exec(markup)?.[1] ?? "";
    expect(visibleText(footer)).toMatch(/\bfictional\b/i);
  });

  test.each(PAGES)("$file: every link and button has visible text", ({ file }) => {
    for (const link of links(file)) expect(link.text, link.href).not.toBe("");
    for (const m of html(file).matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
      expect(visibleText(m[1] ?? "")).not.toBe("");
    }
  });

  test.each(PAGES)("$file: every input sits in its own label, with text", ({ file }) => {
    const markup = html(file);
    const count = (part: string): number => part.match(/<input\b/g)?.length ?? 0;
    const labelled = [...markup.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)]
      .map((m) => m[1] ?? "")
      .filter((inner) => count(inner) > 0);
    // A label names only the first input inside it, so a second one would go unnamed.
    for (const inner of labelled) {
      expect(count(inner), visibleText(inner)).toBe(1);
      expect(visibleText(inner)).not.toBe("");
    }
    expect(labelled).toHaveLength(count(markup));
  });

  test.each(PAGES)("$file: one mobile menu toggle, wired to the nav", ({ file }) => {
    const markup = html(file);
    expect(markup.match(/id="menu-toggle"/g)).toHaveLength(1);
    expect(markup).toContain('aria-controls="site-nav"');
    expect(markup).toContain('id="site-nav"');
  });

  test.each(PAGES)(
    "$file: the nav marks its own section, `location` on sub-pages",
    ({ path, file }) => {
      const section = `/${path.split("/")[1] ?? ""}`;
      const marked = links(file).filter((l) => /aria-current=/.test(l.attrs));
      expect(marked.map((l) => l.href)).toEqual([section]);
      const kind = path === section ? "page" : "location";
      expect(marked[0]?.attrs).toContain(`aria-current="${kind}"`);
    },
  );
});
