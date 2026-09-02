import type { RefObject } from "react";
import {
  MediaContainer,
  MediaControlBar,
  MediaController,
  MediaDurationDisplay,
  MediaFullscreenButton,
  MediaMuteButton,
  MediaPlayButton,
  MediaPlaybackRateButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react";
import "../../player-chrome.css";

/**
 * shadcn-style local Video Player built on media-chrome. Browser-owned
 * transport: play/pause, seek, time, rate, volume, fullscreen. Theme follows
 * the desk tokens via CSS variables in player-chrome.css.
 */
export function VideoPlayer({
  src,
  videoRef,
  frameLabel,
  onTimeUpdate,
  onLoadedMetadata,
}: {
  src: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  frameLabel: string;
  onTimeUpdate: (currentTime: number) => void;
  onLoadedMetadata: (currentTime: number) => void;
}) {
  return (
    <MediaContainer className="h-full w-full bg-black">
      <MediaController
        className="h-full w-full"
        style={{ ["--media-control-bar-height" as string]: "36px" }}
      >
        <video
          slot="media"
          ref={videoRef}
          className="h-full w-full object-contain"
          src={src}
          playsInline
          preload="metadata"
          aria-label={frameLabel}
          onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => onLoadedMetadata(event.currentTarget.currentTime)}
        />
        <MediaControlBar className="px-2">
          <MediaPlayButton />
          <MediaTimeRange style={{ flex: 1 }} />
          <MediaTimeDisplay />
          <MediaDurationDisplay />
          <MediaPlaybackRateButton />
          <MediaMuteButton />
          <MediaVolumeRange />
          <MediaFullscreenButton />
        </MediaControlBar>
      </MediaController>
    </MediaContainer>
  );
}
