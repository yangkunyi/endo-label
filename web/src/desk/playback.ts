import { createContext, useContext, type RefObject } from "react";

/** Picture playback state, shared with the timeline that renders the transport. */
export type Playback = {
  videoRef: RefObject<HTMLVideoElement | null>;
  playerSectionRef: RefObject<HTMLElement | null>;
  frameIndex: number;
  playing: boolean;
  transportTime: number;
  duration: number;
  rate: number;
  muted: boolean;
  volume: number;
  togglePlayback: () => void;
  pausePlayback: () => void;
  seek: (index: number) => void;
  changeRate: (value: number) => void;
  toggleMute: () => void;
  changeVolume: (value: number) => void;
  toggleFullscreen: () => void;
  onLoadedMetadata: (el: HTMLVideoElement) => void;
  onTimeUpdate: (currentTime: number) => void;
  onPlayChange: (playing: boolean) => void;
  onRateChange: (rate: number) => void;
  onVolumeChange: (muted: boolean, volume: number) => void;
};

export const PlaybackContext = createContext<Playback | null>(null);

export function usePlayback(): Playback {
  const playback = useContext(PlaybackContext);
  if (!playback) {
    throw new Error("usePlayback must be used inside PlaybackProvider");
  }
  return playback;
}
