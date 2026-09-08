import { useState, type RefObject } from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Button } from "./button";

/**
 * Hand-built player on a native <video>: the picture element plus an always
 * visible transport row. No autohide, no fade anywhere. The transport time is
 * display-only seconds; the Ruler stays the only progress and seek surface.
 */
export function VideoPlayer({
  src,
  videoRef,
  frameLabel,
  onTimeUpdate,
  onLoadedMetadata,
  onPlayChange,
  onRateChange,
  onVolumeChange,
}: {
  src: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  frameLabel: string;
  onTimeUpdate: (currentTime: number) => void;
  onLoadedMetadata: (video: HTMLVideoElement) => void;
  onPlayChange: (playing: boolean) => void;
  onRateChange: (rate: number) => void;
  onVolumeChange: (muted: boolean, volume: number) => void;
}) {
  return (
    <video
      ref={videoRef}
      className="h-full w-full object-contain"
      src={src}
      playsInline
      preload="metadata"
      aria-label={frameLabel}
      onPlay={() => onPlayChange(true)}
      onPause={() => onPlayChange(false)}
      onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
      onLoadedMetadata={(event) => onLoadedMetadata(event.currentTarget)}
      onRateChange={(event) => onRateChange(event.currentTarget.playbackRate)}
      onVolumeChange={(event) => {
        const el = event.currentTarget;
        onVolumeChange(el.muted, el.volume);
      }}
    />
  );
}

const RATES = [0.25, 0.5, 1, 1.5, 2];

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function PlayerTransport({
  playing,
  currentTime,
  duration,
  rate,
  muted,
  volume,
  onTogglePlay,
  onSetRate,
  onToggleMute,
  onSetVolume,
  onToggleFullscreen,
}: {
  playing: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  muted: boolean;
  volume: number;
  onTogglePlay: () => void;
  onSetRate: (rate: number) => void;
  onToggleMute: () => void;
  onSetVolume: (volume: number) => void;
  onToggleFullscreen: () => void;
}) {
  const [rateOpen, setRateOpen] = useState(false);
  return (
    <div
      role="toolbar"
      aria-label="Transport"
      data-transport=""
      className="flex h-9 shrink-0 items-center gap-1 px-2"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={playing ? "Pause" : "Play"}
        onClick={onTogglePlay}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </Button>
      <output data-transport-time="" className="px-1 text-xs tabular-nums text-muted-foreground">
        {clock(currentTime)} / {clock(duration)}
      </output>
      <div className="relative shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Playback rate"
          aria-haspopup="menu"
          aria-expanded={rateOpen}
          onClick={() => setRateOpen((open) => !open)}
        >
          {rate}×
        </Button>
        {rateOpen ? (
          <>
            <div aria-hidden="true" className="fixed inset-0 z-40" onClick={() => setRateOpen(false)} />
            <div
              role="menu"
              aria-label="Playback rate"
              className="absolute bottom-full left-0 z-50 mb-1 w-20 rounded-md border border-border bg-popover p-1 shadow-lg"
            >
              {RATES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === rate}
                  className="flex w-full items-center rounded-sm px-2 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onSetRate(value);
                    setRateOpen(false);
                  }}
                >
                  {value}×
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={muted ? "Unmute" : "Mute"}
        onClick={onToggleMute}
      >
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </Button>
      <input
        type="range"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.1}
        value={volume}
        onChange={(event) => onSetVolume(Number(event.target.value))}
        className="w-16 accent-foreground"
      />
      <Button type="button" variant="ghost" size="icon" aria-label="Fullscreen" onClick={onToggleFullscreen}>
        <Maximize size={15} />
      </Button>
    </div>
  );
}
