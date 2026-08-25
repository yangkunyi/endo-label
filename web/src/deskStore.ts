import { create } from "zustand";

const defaultFolds = {
  phaseForm: true,
  classBody: false,
  tripletForm: false,
};

type DeskState = {
  clipId: string | null;
  frameIndex: number;
  frameCount: number;
  phaseForm: boolean;
  classBody: boolean;
  tripletForm: boolean;
  openClip: (clipId: string, frameCount: number) => void;
  scrub: (frameIndex: number) => void;
  togglePhaseForm: () => void;
  toggleClassBody: () => void;
  toggleTripletForm: () => void;
};

export const useDeskStore = create<DeskState>((set, get) => ({
  clipId: null,
  frameIndex: 0,
  frameCount: 0,
  ...defaultFolds,
  openClip: (clipId, frameCount) =>
    set((s) => {
      if (s.clipId === clipId) {
        const frameIndex =
          frameCount <= 0 ? 0 : Math.min(s.frameIndex, frameCount - 1);
        return { frameCount, frameIndex };
      }
      return { clipId, frameCount, frameIndex: 0, ...defaultFolds };
    }),
  scrub: (frameIndex) => {
    const n = get().frameCount;
    if (n <= 0) {
      return;
    }
    set({ frameIndex: Math.min(Math.max(0, frameIndex), n - 1) });
  },
  togglePhaseForm: () => set((s) => ({ phaseForm: !s.phaseForm })),
  toggleClassBody: () => set((s) => ({ classBody: !s.classBody })),
  toggleTripletForm: () => set((s) => ({ tripletForm: !s.tripletForm })),
}));
