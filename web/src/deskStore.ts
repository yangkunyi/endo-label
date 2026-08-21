import { create } from "zustand";

type DeskState = {
  clipId: string | null;
  frameIndex: number;
  frameCount: number;
  openClip: (clipId: string, frameCount: number) => void;
  scrub: (frameIndex: number) => void;
};

export const useDeskStore = create<DeskState>((set, get) => ({
  clipId: null,
  frameIndex: 0,
  frameCount: 0,
  openClip: (clipId, frameCount) =>
    set((s) => {
      if (s.clipId === clipId) {
        const frameIndex =
          frameCount <= 0 ? 0 : Math.min(s.frameIndex, frameCount - 1);
        return { frameCount, frameIndex };
      }
      return { clipId, frameCount, frameIndex: 0 };
    }),
  scrub: (frameIndex) => {
    const n = get().frameCount;
    if (n <= 0) {
      return;
    }
    set({ frameIndex: Math.min(Math.max(0, frameIndex), n - 1) });
  },
}));
