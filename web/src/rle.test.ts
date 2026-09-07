import { expect, test } from "vitest";
import { decodeRle } from "./rle";

test("rle_fg counts decode to a binary grid with a known foreground pixel", () => {
  // 2×2, C-order [0, 1, 0, 0] → runs start at background: 1, 1, 2
  const grid = decodeRle({ format: "rle_fg", size: [2, 2], counts: [1, 1, 2] });
  expect(grid).toEqual([
    [0, 1],
    [0, 0],
  ]);
});

test("empty size is an empty grid", () => {
  expect(decodeRle({ format: "rle_fg", size: [0, 0], counts: [] })).toEqual([]);
});
