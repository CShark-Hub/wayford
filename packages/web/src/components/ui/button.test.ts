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
