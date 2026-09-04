import type { CSSProperties } from "react";

export function nowEmptyText(kind: "phase" | "class" | "triplet", frameIndex: number): string {
  switch (kind) {
    case "phase":
      return `No phase on frame ${frameIndex}`;
    case "class":
      return `No class tags on frame ${frameIndex}`;
    case "triplet":
      return `No triplets on frame ${frameIndex}`;
  }
}

const UNSELECTED_STYLE: CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "transparent",
};

export function libraryRowSemanticStyle(color: string, on: boolean): CSSProperties {
  if (!on) {
    return UNSELECTED_STYLE;
  }
  const m = color.match(/hsl\((\d+)\s+([\d.]+%)\s+([\d.]+%)\)/);
  if (m) {
    const [, h, s, l] = m;
    return {
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: `hsla(${h}, ${s}, ${l}, 0.35)`,
      backgroundColor: `hsla(${h}, ${s}, ${l}, 0.12)`,
    };
  }
  return UNSELECTED_STYLE;
}
