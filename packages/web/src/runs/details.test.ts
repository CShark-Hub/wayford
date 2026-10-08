import { expect, test } from "vitest";
import { shortNumber } from "./details.js";

test("a stored float reads at three significant digits, and a short one as stored", () => {
  expect(shortNumber(0.2440023438539356)).toBe("0.244");
  expect(shortNumber(0.0027357211802154779)).toBe("0.00274");
  expect(shortNumber(0.006249999999999999)).toBe("0.00625");
  expect([0.37, 0.8, 0.9, 0].map((value) => shortNumber(value))).toEqual([
    "0.37",
    "0.8",
    "0.9",
    "0",
  ]);
});

test("a number keeps its side of every bound, taking the digits it needs", () => {
  // Three digits would print 0.8, which is not below the p of 0.8 the roll fired under.
  expect(shortNumber(0.7999612, 0.8, 1)).toBe("0.79996");
  // A roll never reaches 1, so it never reads 1.
  expect(shortNumber(0.99981, 1)).toBe("0.9998");
  // At or over the bound already, so reading as the bound itself keeps its side.
  expect(shortNumber(0.80004, 0.8, 1)).toBe("0.8");
  expect(shortNumber(0.62707394058816135, 0.8, 1)).toBe("0.627");
});
