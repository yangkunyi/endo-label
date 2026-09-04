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

export function libraryRowSemanticStyle(color: string, on: boolean): CSSProperties {
  if (!on) {
    return {
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "transparent",
      backgroundColor: "transparent",
    };
  }
  const m = color.match(/hsl\((\d+)\s+([\d.]+%)\s+([\d.]+%)?\)/);
  if (m) {
    const [, h, s, l] = m;
    return {
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: `hsla(${h}, ${s}, ${l}, 0.35)`,
      backgroundColor: `hsla(${h}, ${s}, ${l}, 0.14)`,
    };
  }
  return {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.replace(")", " / 0.35)"),
    backgroundColor: color.replace(")", " / 0.14)"),
  };
}
