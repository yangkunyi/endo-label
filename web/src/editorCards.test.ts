import { describe, expect, it } from "vitest";
import { libraryRowSemanticStyle, nowEmptyText, nowFillStyle } from "./editorCards";

describe("editor cards helpers", () => {
  it("nowEmptyText returns calm muted text with frame number", () => {
    expect(nowEmptyText("phase", 0)).toBe("No phase on frame 0");
    expect(nowEmptyText("phase", 42)).toBe("No phase on frame 42");
    expect(nowEmptyText("class", 0)).toBe("No class tags on frame 0");
    expect(nowEmptyText("class", 7)).toBe("No class tags on frame 7");
    expect(nowEmptyText("triplet", 0)).toBe("No triplets on frame 0");
    expect(nowEmptyText("triplet", 12)).toBe("No triplets on frame 12");
  });

  it("libraryRowSemanticStyle returns transparent unselected border and no inline background", () => {
    const unselected = libraryRowSemanticStyle("hsl(200 35% 55%)", false);
    expect(unselected).toEqual({
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "transparent",
    });
  });

  it("libraryRowSemanticStyle returns soft 12% semantic tint and 35% border on selection", () => {
    const selected = libraryRowSemanticStyle("hsl(200 35% 55%)", true);
    expect(selected).toEqual({
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "hsla(200, 35%, 55%, 0.35)",
      backgroundColor: "hsla(200, 35%, 55%, 0.12)",
    });
  });

  it("nowFillStyle fills the chip with the identity's own label colour", () => {
    expect(nowFillStyle("Preparation")).toEqual({
      backgroundColor: "hsl(186 35% 55%)",
      color: "var(--color-background)",
    });
    expect(nowFillStyle("grasper")).toEqual({
      backgroundColor: "hsl(27 35% 55%)",
      color: "var(--color-background)",
    });
    // A triplet is one identity, spelled the way the desk spells it.
    expect(nowFillStyle("Hook / Pull / Tissue")).toEqual({
      backgroundColor: "hsl(254 35% 55%)",
      color: "var(--color-background)",
    });
  });
});
