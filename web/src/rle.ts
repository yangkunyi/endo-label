export type RleMask = {
  format: string;
  size: number[];
  counts: number[];
};

export function decodeRle(payload: RleMask): number[][] {
  const h = Number(payload.size?.[0] ?? 0);
  const w = Number(payload.size?.[1] ?? 0);
  if (h <= 0 || w <= 0) {
    return [];
  }
  const flat: number[] = [];
  let val = 0;
  for (const count of payload.counts ?? []) {
    const n = Number(count);
    if (n < 0) {
      throw new Error("RLE counts must be non-negative");
    }
    for (let i = 0; i < n; i += 1) {
      flat.push(val);
    }
    val = 1 - val;
  }
  const expected = h * w;
  if (flat.length < expected) {
    while (flat.length < expected) {
      flat.push(0);
    }
  }
  const grid: number[][] = [];
  for (let r = 0; r < h; r += 1) {
    grid.push(flat.slice(r * w, (r + 1) * w));
  }
  return grid;
}
