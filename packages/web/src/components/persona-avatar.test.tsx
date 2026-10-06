import type { Profile } from "@wayford/core";
import { profileFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Avatar } from "../avatar/avatar.js";
import { attributesOf, styleOf, textOf } from "../preview/rendered-markup.js";
import { PersonaAvatar, PersonaChip } from "./persona-avatar.js";

/** The tile's own start tag, read as attributes, and what it holds. */
function tileOf(html: string): { attributes: Record<string, string>; inner: string } {
  const tile = html.match(/^(<div[^>]*>)(.*)<\/div>$/s);
  if (tile?.[1] === undefined || tile[2] === undefined) throw new Error("no tile at the root");
  return { attributes: attributesOf(tile[1]), inner: tile[2] };
}

/** The classes on a start tag's attributes, split. */
function classesOf(attributes: Record<string, string>): string[] {
  return (attributes.class ?? "").split(/\s+/);
}

/** A profile no fixture is, so no slot is pinned to it. */
function stranger(): Profile {
  return { ...profileFixture("prof_ada"), id: "prof_stranger", label: "Stranger" };
}

test("the tile sets the persona's slot variables: Vera's are cobalt", () => {
  const html = renderToStaticMarkup(<PersonaAvatar profile={profileFixture("prof_vera")} />);
  const style = styleOf(tileOf(html).attributes);
  expect(style["--p"]).toBe("var(--persona-cobalt)");
  expect(style["--p-ink"]).toBe("var(--persona-cobalt-ink)");
  expect(style["--p-soft"]).toBe("var(--persona-cobalt-soft)");
});

test("a profile no slot is pinned to takes the fallback", () => {
  const html = renderToStaticMarkup(<PersonaAvatar profile={stranger()} />);
  expect(styleOf(tileOf(html).attributes)["--p"]).toBe("var(--persona-fallback)");
});

test("the tile carries the slot-tint and Night-tile classes, and the caller's size", () => {
  const html = renderToStaticMarkup(
    <PersonaAvatar profile={profileFixture("prof_kai")} className="size-20 opacity-50" />,
  );
  const classes = classesOf(tileOf(html).attributes);
  for (const name of ["bg-(--p-soft)", "dark:bg-avatar-tile", "size-20", "opacity-50"]) {
    expect(classes, name).toContain(name);
  }
});

test("the tile holds the persona's avatar, filling it, and passes the state through", () => {
  // The avatar's own class: it fills the tile, and in Night takes the line for its ink.
  const avatarClass = "block size-full dark:[--p-ink:var(--avatar-line)]";
  const milo = profileFixture("prof_milo");
  const plain = renderToStaticMarkup(<PersonaAvatar profile={milo} className="size-40" />);
  expect(tileOf(plain).inner).toBe(
    renderToStaticMarkup(<Avatar profile={milo} className={avatarClass} />),
  );
  const stuck = renderToStaticMarkup(<PersonaAvatar profile={milo} state="stuck" />);
  expect(tileOf(stuck).inner).toBe(
    renderToStaticMarkup(<Avatar profile={milo} state="stuck" className={avatarClass} />),
  );
});

test("the chip sets its slot's variables, then a hidden square in the slot's fill, then the name", () => {
  const html = renderToStaticMarkup(<PersonaChip slot="jade">Milo</PersonaChip>);
  const chip = html.match(/^<span[^>]*>/)?.[0] ?? "";
  expect(styleOf(attributesOf(chip))["--p"]).toBe("var(--persona-jade)");
  const square = html.slice(chip.length).match(/^<span[^>]*><\/span>/)?.[0] ?? "";
  const attributes = attributesOf(square);
  expect(attributes["aria-hidden"]).toBe("true");
  expect(classesOf(attributes)).toEqual(
    expect.arrayContaining(["size-3", "shrink-0", "rounded-xs", "bg-(--p)"]),
  );
  expect(html.slice(chip.length + square.length)).toBe("Milo</span>");
  expect(textOf(html)).toBe("Milo");
});
