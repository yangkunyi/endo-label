import type { CSSProperties } from "react";

export function nowEmptyText(kind: "phase" | "class", frameIndex: number): string {
  return kind === "phase"
    ? `No phase on frame ${frameIndex}`
    : `No class tags on frame ${frameIndex}`;
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
