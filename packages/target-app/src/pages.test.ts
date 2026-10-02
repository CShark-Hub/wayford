import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { GOALS, PAGES, ROUTES } from "./pages.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (file: string): string => readFileSync(`${root}${file}`, "utf8");
/** Page markup without comments, so a commented-out link never counts as a route. */
const html = (file: string): string => source(file).replace(/<!--[\s\S]*?-->/g, "");
const paths = PAGES.map((page) => page.path);

/** An `aria-hidden` decorative span, such as the kebab's dots. */
const DECORATION = /<span\b[^>]*\saria-hidden="true"[^>]*>[^<]*<\/span>/g;

/** Text a reader or the accessibility tree gets: tags and `aria-hidden` decoration removed. */
function visibleText(markup: string): string {
  return markup
    .replace(DECORATION, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

/** One attribute's value, or `undefined` when it is absent. `href` does not match `data-href`. */
function attr(attrs: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`).exec(attrs)?.[1];
}

/** Whole-token class match: `hard-link` is not `no-hard-link`, and `data-class` is ignored. */
function hasClass(attrs: string, name: string): boolean {
  return (attr(attrs, "class") ?? "").split(/\s+/).includes(name);
}

interface Link {
  href: string;
  attrs: string;
  text: string;
}

/** Every `<a href>` in some markup as `{ href, attrs, text }`. Plain regex: the markup is ours. */
function linksIn(markup: string): Link[] {
  return [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => {
    const attrs = m[1] ?? "";
    return {
      href: attr(attrs, "href") ?? "",
      attrs,
      text: visibleText(m[2] ?? ""),
    };
  });
}

/** Every `<a href>` on a page. */
const links = (file: string): Link[] => linksIn(html(file));

/** Inner markup of the element with this id. The element must not nest its own tag. */
function inner(markup: string, id: string): string | undefined {
  return new RegExp(`<(\\w+)\\b[^>]*\\sid="${id}"[^>]*>([\\s\\S]*?)</\\1>`).exec(markup)?.[2];
}

interface Control {
  tag: string;
  attrs: string;
  content: string;
  name: string;
}

/** Every link and button in some markup, named by its `aria-label`, else by its visible text. */
function controlsIn(markup: string): Control[] {
  return [...markup.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map((m) => {
    const attrs = m[2] ?? "";
    const content = m[3] ?? "";
    const name = attr(attrs, "aria-label") ?? visibleText(content);
    return { tag: m[1] ?? "", attrs, content, name };
  });
}

/** Every link and button on a page. */
const controls = (file: string): Control[] => controlsIn(html(file));

const bigLinks = (file: string): string[] =>
  links(file)
    .filter((l) => hasClass(l.attrs, "big-link"))
    .map((l) => l.href);

/** Breadth-first walk from `/` over the links `follow` gives for each page. */
function reachable(follow: (file: string) => Link[] = links): Set<string> {
  const seen = new Set(["/"]);
  const queue = ["/"];
  while (queue.length > 0) {
    const current = queue.shift();
    const page = PAGES.find((p) => p.path === current);
    if (!page) continue;
    for (const link of follow(page.file)) {
      if (!seen.has(link.href)) {
        seen.add(link.href);
        queue.push(link.href);
      }
    }
  }
  return seen;
}

/** A page's links without its entrances and without the links inside what an entrance opens. */
function linksPastNoEntrance(file: string): Link[] {
  let markup = html(file);
  for (const entrance of controlsIn(markup).filter((c) => hasClass(c.attrs, "entrance"))) {
    const id = attr(entrance.attrs, "aria-controls");
    if (id) markup = markup.replace(inner(markup, id) ?? "", "");
  }
  return linksIn(markup).filter((l) => !hasClass(l.attrs, "entrance"));
}

const archive = GOALS.find((goal) => goal.id === "hard")?.path ?? "";

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

  test("PAGES lists /settings/data", () => {
    expect(PAGES).toContainEqual({ path: "/settings/data", file: "settings/data.html" });
  });

  test("the hard link is the only route to the archive without passing an entrance under 32 px", () => {
    const noHardLink = (file: string): Link[] =>
      linksPastNoEntrance(file).filter((l) => !hasClass(l.attrs, "hard-link"));
    expect(reachable(noHardLink)).not.toContain(archive);
    expect(reachable(linksPastNoEntrance)).toContain(archive);

    const hardLinks = PAGES.flatMap((p) =>
      links(p.file)
        .filter((l) => hasClass(l.attrs, "hard-link"))
        .map((l) => ({ href: l.href, file: p.file })),
    );
    expect(hardLinks).toEqual([{ href: archive, file: "deliveries.html" }]);

    const found = PAGES.flatMap((p) =>
      controls(p.file)
        .filter((c) => hasClass(c.attrs, "entrance"))
        .map((c) => ({ file: p.file, tag: c.tag, name: c.name })),
    );
    expect(found).toEqual([
      { file: "account.html", tag: "button", name: "More options" },
      { file: "settings.html", tag: "a", name: "Your data" },
    ]);
  });

  test("ROUTES names three routes, each a walk of real links", () => {
    expect(ROUTES.map((route) => route.id)).toEqual(["A", "B", "C"]);
    // s2-11 tells a run's route by the page of its last step.
    expect(new Set(ROUTES.map((route) => route.steps.at(-1)?.page)).size).toBe(ROUTES.length);
    for (const route of ROUTES) {
      expect(route.steps[0]?.page, route.id).toBe("/");
      for (const [i, step] of route.steps.entries()) {
        const next = route.steps[i + 1];
        const label = `${route.id}, step ${i + 1}: ${step.role} "${step.name}" on ${step.page}`;
        const file = PAGES.find((p) => p.path === step.page)?.file ?? "";
        expect(file, label).not.toBe("");
        const named = controls(file).filter((c) => c.name === step.name);
        if (step.role === "button") {
          const attrs = named.find((c) => c.tag === "button")?.attrs ?? "";
          expect(attr(attrs, "aria-label"), label).toBe(step.name);
          expect(attr(attrs, "aria-haspopup"), label).toBe("menu");
          expect(attr(attrs, "aria-expanded"), label).toBe("false");
          expect(attr(attrs, "aria-controls"), label).toBe("more-menu");
          // The button opens a menu on its own page, and the next step is one of its items.
          expect(next?.page, label).toBe(step.page);
          expect(next?.role, label).toBe("menuitem");
          const menu = attr(attrs, "aria-controls") ?? "";
          const items = linksIn(inner(html(file), menu) ?? "");
          expect(
            items.map((l) => l.text),
            label,
          ).toContain(next?.name);
          continue;
        }
        // Each `<a>` with that name goes to the next step's page, the last to the archive.
        const anchors = named.filter((c) => c.tag === "a");
        expect(anchors.length, label).toBeGreaterThan(0);
        for (const anchor of anchors) {
          expect(attr(anchor.attrs, "role") === "menuitem", label).toBe(step.role === "menuitem");
          expect(attr(anchor.attrs, "href"), label).toBe(next?.page ?? archive);
        }
      }
    }
  });

  // Route C is a vocabulary route only while "Fulfilment ledger" is its page's one way to the
  // archive, so no other link on any page, kebab menu included, may point there.
  test("the only links to the archive are the last steps of ROUTES", () => {
    const byPage = (a: { page: string }, b: { page: string }): number =>
      a.page.localeCompare(b.page);
    const found = PAGES.flatMap((p) =>
      controls(p.file)
        .filter((c) => c.tag === "a" && attr(c.attrs, "href") === archive)
        .map((c) => ({ page: p.path, name: c.name })),
    );
    const last = ROUTES.flatMap((route) => route.steps.slice(-1)).map(({ page, name }) => ({
      page,
      name,
    }));
    expect(found.sort(byPage)).toEqual(last.sort(byPage));
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

  // Visible text, or an `aria-label` on an icon-only control, whose content is one `aria-hidden`
  // span. The icon-only controls are the button steps of ROUTES: the kebab on /account.
  test.each(PAGES)("$file: every link and button has a name", ({ path, file }) => {
    const expected = ROUTES.flatMap((route) => route.steps)
      .filter((step) => step.role === "button" && step.page === path)
      .map((step) => step.name);
    const iconOnly: string[] = [];
    for (const control of controls(file)) {
      expect(control.name, control.attrs).not.toBe("");
      if (visibleText(control.content) !== "") continue;
      expect(control.content.trim(), control.name).toMatch(new RegExp(`^${DECORATION.source}$`));
      iconOnly.push(control.name);
    }
    expect(iconOnly).toEqual(expected);
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
