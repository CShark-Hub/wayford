/**
 * The glob dialect of a task's `urlMatches` and `requestObserved` patterns: Playwright 1.63's
 * string globs ("Glob URL patterns" in its docs), so a task means what `page.waitForURL` makes of
 * it. It is written here because Playwright's matcher is internal, and `waitForURL` used as a
 * matcher writes a failed action into the trace on every miss
 * (`docs/specs/2026-10-01-s2-03-actor-loop.md`, "URL matching").
 *
 * - `*` is any run of characters inside one path segment, and `**` any run at all.
 * - A `**` with a slash after it takes the slash. With a slash before it too, the three are whole
 *   segments or none: one slash, or two with at least one character between them. Anywhere else,
 *   the `**` and its slash are anything, then a slash, which at the start of a glob covers the
 *   scheme, the host and any leading segments.
 * - `{a,b}` is either alternative, each a glob of its own. Braces do not nest.
 * - `?`, `[` and `]` are the characters themselves, as is every other character a regular
 *   expression gives a meaning to.
 * - A backslash makes the next character literal, a brace or a comma included; a last backslash
 *   stands for itself. A comma outside braces is a comma.
 *
 * A glob covers the whole URL, case-sensitively, and is compared as written. Playwright first
 * resolves a glob that does not start with `*` with the URL parser, which normalises it: there
 * `HTTP://Example.com` reads `http://example.com/`. Here an absolute glob must be spelled as the
 * browser reports the URL. An empty glob matches only the empty string, where Playwright takes it
 * for no condition at all; `Task` refuses one anyway.
 */
import { WayfordError } from "@wayford/core";

/**
 * The regular expression a glob stands for, anchored at both ends and with no flags. It tests a
 * whole string, case-sensitively, and gives the same answer every time, so a caller may compile a
 * glob once and test every request against it.
 *
 * Braces that do not pair, one inside another, a `}` with no `{` or a `{` never closed, throw a
 * `WayfordError` with code `invalid_url_glob` naming the brace. Playwright refuses them too, and a
 * run checked against such a glob could never end `success`, so it would read as a finding.
 */
export function globToRegExp(glob: string): RegExp {
  let source = "^";
  // The index of the open `{`, while its alternatives are being read.
  let openBrace: number | undefined;
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob.charAt(i);
    if (char === "\\" && i + 1 < glob.length) {
      i += 1;
      source += literal(glob.charAt(i));
    } else if (char === "*") {
      // `charAt(-1)` is "", so a glob's first star has nothing before it.
      const before = glob.charAt(i - 1);
      let stars = 1;
      while (glob.charAt(i + stars) === "*") stars += 1;
      i += stars - 1;
      if (stars === 1) {
        source += "[^/]*";
      } else if (glob.charAt(i + 1) === "/") {
        i += 1;
        source += before === "/" ? "(?:.+/)?" : ".*/";
      } else {
        source += ".*";
      }
    } else if (char === "{") {
      if (openBrace !== undefined) {
        throw braceError(glob, i, "opens inside another pair of braces, and braces cannot nest");
      }
      openBrace = i;
      source += "(?:";
    } else if (char === "}") {
      if (openBrace === undefined) throw braceError(glob, i, 'closes no "{"');
      openBrace = undefined;
      source += ")";
    } else if (char === "," && openBrace !== undefined) {
      source += "|";
    } else {
      source += literal(char);
    }
  }
  if (openBrace !== undefined) throw braceError(glob, openBrace, "is never closed");
  return new RegExp(`${source}$`);
}

// Every character a regular expression gives a meaning to outside a character class.
const REGEXP_SYNTAX = /[$()*+.?[\\\]^{|}]/;

/** One glob character as a regular expression that matches just that character. */
function literal(char: string): string {
  return REGEXP_SYNTAX.test(char) ? `\\${char}` : char;
}

/** The error for the brace at `index`, which does not pair, and what is wrong with it. */
function braceError(glob: string, index: number, problem: string): WayfordError {
  const brace = glob.charAt(index);
  return new WayfordError(
    "invalid_url_glob",
    `Invalid URL glob ${JSON.stringify(glob)}: the "${brace}" at character ${index + 1} ${problem}. Escape a literal brace with a backslash.`,
  );
}
