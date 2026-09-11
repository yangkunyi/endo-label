import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { clipMediaPath, type ClipMeta } from "../api";
import { PlayerTransport, VideoPlayer } from "../components/ui/video-player";
import { useDeskStore } from "../deskStore";
import { isEditableTarget } from "./keyboard";
import { PlayerMaskOverlay } from "./MaskPanel";

/** The container fps, or 25 when the Clip does not carry one. */
function fpsOf(clip: ClipMeta | undefined): number {
  return clip && clip.fps > 0 ? clip.fps : 25;
}

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

const PlaybackContext = createContext<Playback | null>(null);

export function usePlayback(): Playback {
  const playback = useContext(PlaybackContext);
  if (!playback) {
    throw new Error("usePlayback must be used inside PlaybackProvider");
  }
  return playback;
}

/** Owns the <video> element and the transport readouts for the open Clip. */
export function PlaybackProvider({
  clip,
  frameIndex,
  children,
}: {
  clip: ClipMeta | undefined;
  frameIndex: number;
  children: ReactNode;
}) {
  const scrub = useDeskStore((s) => s.scrub);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerSectionRef = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(false);
  const [transportTime, setTransportTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const togglePlayback = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, []);

  const pausePlayback = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const seek = useCallback((index: number) => {
    scrub(index);
    const el = videoRef.current;
    if (el) {
      const fps = clip && clip.fps > 0 ? clip.fps : 25;
      el.currentTime = index / fps;
    }
  }, [clip, scrub]);

  const changeRate = useCallback((value: number) => {
    const el = videoRef.current;
    if (el) {
      el.playbackRate = value;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (el) {
      el.muted = !el.muted;
    }
  }, []);

  const changeVolume = useCallback((value: number) => {
    const el = videoRef.current;
    if (el) {
      el.volume = value;
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void playerSectionRef.current?.requestFullscreen().catch(() => undefined);
    }
  }, []);
  const fps = fpsOf(clip);
  const frameCount = clip?.frame_count ?? 0;

  const onLoadedMetadata = useCallback((el: HTMLVideoElement) => {
    setDuration(el.duration);
    el.currentTime = frameIndex / fps;
  }, [fps, frameIndex]);

  const onTimeUpdate = useCallback((currentTime: number) => {
    setTransportTime(currentTime);
    const last = Math.max(0, frameCount - 1);
    const index = Math.min(last, Math.max(0, Math.round(currentTime * fps)));
    if (index !== frameIndex) {
      scrub(index);
    }
  }, [fps, frameCount, frameIndex, scrub]);

  // Space toggles playback anywhere on the desk except in a field being typed into.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.key === " " && frameCount > 0) {
        event.preventDefault();
        togglePlayback();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [frameCount, togglePlayback]);

  const playback: Playback = {
    videoRef,
    playerSectionRef,
    frameIndex,
    playing,
    transportTime,
    duration,
    rate,
    muted,
    volume,
    togglePlayback,
    pausePlayback,
    seek,
    changeRate,
    toggleMute,
    changeVolume,
    toggleFullscreen,
    onLoadedMetadata,
    onTimeUpdate,
    onPlayChange: setPlaying,
    onRateChange: setRate,
    onVolumeChange: (nextMuted, nextVolume) => {
      setMuted(nextMuted);
      setVolume(nextVolume);
    },
  };

  return <PlaybackContext.Provider value={playback}>{children}</PlaybackContext.Provider>;
}

/** The transport row, rendered inside the timeline band. */
export function TransportRow() {
  const player = usePlayback();
  return (
    <PlayerTransport
      playing={player.playing}
      currentTime={player.transportTime}
      duration={player.duration}
      rate={player.rate}
      muted={player.muted}
      volume={player.volume}
      onTogglePlay={player.togglePlayback}
      onSetRate={player.changeRate}
      onToggleMute={player.toggleMute}
      onSetVolume={player.changeVolume}
      onToggleFullscreen={player.toggleFullscreen}
    />
  );
}

/** The player panel: the picture, the mask overlay and every player-owned state. */
export function PlayerPanel({
  clipId,
  clip,
  error,
  isLoading,
}: {
  clipId: string | undefined;
  clip: ClipMeta | undefined;
  error: unknown;
  isLoading: boolean;
}) {
  const player = usePlayback();
  return (
    <section ref={player.playerSectionRef} aria-label="Player" className="relative flex min-h-48 min-w-0 flex-1 flex-col overflow-hidden rounded-t-xl bg-black">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {error ? (
          <div className="p-6 text-center"><h2 className="mb-2 text-lg font-semibold">{clipId}</h2><p>{error instanceof Error ? error.message : "Clip not found"}</p></div>
        ) : isLoading ? (
          <p>Loading Clip…</p>
        ) : clip?.frame_count ? (
          <VideoPlayer
            src={clipMediaPath(clip.id)}
            videoRef={player.videoRef}
            frameLabel={`Frame ${player.frameIndex}`}
            onLoadedMetadata={player.onLoadedMetadata}
            onTimeUpdate={player.onTimeUpdate}
            onPlayChange={player.onPlayChange}
            onRateChange={player.onRateChange}
            onVolumeChange={player.onVolumeChange}
          >
            <PlayerMaskOverlay videoRef={player.videoRef} onPause={player.pausePlayback} />
          </VideoPlayer>
        ) : clip ? (
          <p>This Clip has no Frames.</p>
        ) : (
          <div className="p-6 text-center"><h2 className="mb-2 text-xl font-semibold">Choose a Clip</h2><p className="text-muted-foreground">Select a Clip from the left rail to begin labeling.</p></div>
        )}
      </div>
    </section>
  );
}
