import { cn } from "cn";
import { expect, test } from "vitest";
import { buttonVariants } from "./button.js";

// shadcn components let a `className` override their own classes through `cn`.
// `cn` is a young package that replaces clsx plus tailwind-merge, so the one
// behaviour every component relies on is pinned here, through the same call
// `Button` makes.
test("a className overrides the variant's conflicting Tailwind classes", () => {
  const classes = cn(buttonVariants({ size: "default", className: "px-2" })).split(" ");
  expect(classes).toContain("px-2");
  expect(classes).not.toContain("px-4");
});

// docs/DESIGN.md sets a 32 px floor on every target. The sizes are the four that stay, and each
// reads its height from a token, so no class can name a smaller one.
const SIZES = ["default", "sm", "icon", "icon-sm"] as const;

test("no size falls under the 32 px target floor", () => {
  for (const size of SIZES) {
    const classes = buttonVariants({ size }).split(" ");
    const sizing = classes.filter((name) => /^(h|size)-/.test(name));
    expect(sizing.length, size).toBeGreaterThan(0);
    for (const name of sizing) {
      expect(name, size).toMatch(/^(h|size)-\(--(control-h|target-min)\)$/);
    }
  }
});

test("the button keeps no focus ring of its own", () => {
  const classes = buttonVariants({});
  expect(classes).not.toContain("outline-none");
  expect(classes).not.toContain("focus-visible:");
});
