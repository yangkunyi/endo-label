import { create } from "zustand";

export type EditorKind = "class" | "triplet" | "phase";

export type SpanStart = {
  clipId: string;
  frameIndex: number;
};

export type DeskLayout = {
  clipRailWidth: number;
  editorRailWidth: number;
  bottomBarHeight: number;
  editorOrder: EditorKind[];
};

export const DESK_LAYOUT_STORAGE_KEY = "endo_label:desk-layout-v2";

export const DEFAULT_DESK_LAYOUT: DeskLayout = {
  clipRailWidth: 208,
  editorRailWidth: 280,
  bottomBarHeight: 56,
  editorOrder: ["class", "triplet", "phase"],
};

export const DESK_LAYOUT_LIMITS = {
  clipRailWidth: { min: 176, max: 360 },
  editorRailWidth: { min: 220, max: 420 },
  bottomBarHeight: { min: 48, max: 220 },
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isEditorKind(value: unknown): value is EditorKind {
  return value === "class" || value === "triplet" || value === "phase";
}

function readNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, min, max)
    : fallback;
}

export function normalizeDeskLayout(value: unknown): DeskLayout {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_DESK_LAYOUT, editorOrder: [...DEFAULT_DESK_LAYOUT.editorOrder] };
  }

  const candidate = value as Partial<DeskLayout>;
  const order = Array.isArray(candidate.editorOrder) &&
    candidate.editorOrder.length === DEFAULT_DESK_LAYOUT.editorOrder.length &&
    candidate.editorOrder.every(isEditorKind) &&
    new Set(candidate.editorOrder).size === DEFAULT_DESK_LAYOUT.editorOrder.length
    ? [...candidate.editorOrder]
    : [...DEFAULT_DESK_LAYOUT.editorOrder];

  return {
    clipRailWidth: readNumber(
      candidate.clipRailWidth,
      DEFAULT_DESK_LAYOUT.clipRailWidth,
      DESK_LAYOUT_LIMITS.clipRailWidth.min,
      DESK_LAYOUT_LIMITS.clipRailWidth.max,
    ),
    editorRailWidth: readNumber(
      candidate.editorRailWidth,
      DEFAULT_DESK_LAYOUT.editorRailWidth,
      DESK_LAYOUT_LIMITS.editorRailWidth.min,
      DESK_LAYOUT_LIMITS.editorRailWidth.max,
    ),
    bottomBarHeight: readNumber(
      candidate.bottomBarHeight,
      DEFAULT_DESK_LAYOUT.bottomBarHeight,
      DESK_LAYOUT_LIMITS.bottomBarHeight.min,
      DESK_LAYOUT_LIMITS.bottomBarHeight.max,
    ),
    editorOrder: order,
  };
}

function readStoredLayout(): DeskLayout {
  if (typeof window === "undefined") {
    return normalizeDeskLayout(null);
  }
  try {
    const raw = window.localStorage.getItem(DESK_LAYOUT_STORAGE_KEY);
    return normalizeDeskLayout(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeDeskLayout(null);
  }
}

function saveLayout(layout: DeskLayout) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(DESK_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // localStorage can be unavailable in private browsing or a restricted iframe.
  }
}

type DeskState = {
  clipId: string | null;
  frameIndex: number;
  frameCount: number;
  frameIndexes: Record<string, number>;
  layout: DeskLayout;
  spanStart: SpanStart | null;
  openClip: (clipId: string, frameCount: number) => void;
  scrub: (frameIndex: number) => void;
  setLayout: (patch: Partial<DeskLayout>) => void;
  setEditorOrder: (order: EditorKind[]) => void;
  setSpanStart: (start: SpanStart | null) => void;
  clearSpanStart: () => void;
};

export const useDeskStore = create<DeskState>((set, get) => ({
  clipId: null,
  frameIndex: 0,
  frameCount: 0,
  frameIndexes: {},
  layout: readStoredLayout(),
  spanStart: null,
  openClip: (clipId, frameCount) =>
    set((s) => {
      if (s.clipId === clipId) {
        const frameIndex = frameCount <= 0 ? 0 : Math.min(s.frameIndex, frameCount - 1);
        return { frameCount, frameIndex, frameIndexes: { ...s.frameIndexes, [clipId]: frameIndex } };
      }
      const frameIndex = frameCount <= 0 ? 0 : Math.min(s.frameIndexes[clipId] ?? 0, frameCount - 1);
      return {
        clipId,
        frameCount,
        frameIndex,
        frameIndexes: { ...s.frameIndexes, [clipId]: frameIndex },
        spanStart: null,
      };
    }),
  scrub: (frameIndex) => {
    const n = get().frameCount;
    if (n <= 0) {
      return;
    }
    const next = Math.min(Math.max(0, frameIndex), n - 1);
    const clipId = get().clipId;
    set((s) => ({ frameIndex: next, frameIndexes: clipId ? { ...s.frameIndexes, [clipId]: next } : s.frameIndexes }));
  },
  setLayout: (patch) =>
    set((s) => {
      const layout = normalizeDeskLayout({ ...s.layout, ...patch });
      saveLayout(layout);
      return { layout };
    }),
  setEditorOrder: (order) =>
    set((s) => {
      const layout = normalizeDeskLayout({ ...s.layout, editorOrder: order });
      saveLayout(layout);
      return { layout };
    }),
  setSpanStart: (spanStart) => set({ spanStart }),
  clearSpanStart: () => set({ spanStart: null }),
}));
