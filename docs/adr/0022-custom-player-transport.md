# Player transport is hand-built shadcn controls under the Ruler; media-chrome is removed

Status: accepted. Supersedes [ADR 0017](./0017-modern-player-tokens.md)’s “media-chrome transport” clause (tokens, transcode, and the Video Player element itself still hold). The Ruler as the only seek track is [ADR 0018](./0018-timeline-ruler-clip-rail.md) and now also the only progress display.

The desk player shows a black picture in two states: while **playing** and the mouse leaves the player, and **on first open before any hover**. Measured reproduction (Playwright + pixel probes on the real sitting):

- While the screen is black, the `<video>` buffer still holds the picture (drawImage reads ~93% non-black pixels); `readyState` 4, no media errors at any step.
- The only DOM change on mouse-out is `userinactive` appearing on `media-container` and `media-controller`. `getComputedStyle(media-controller).opacity` runs 1 → 0.49 (+0.3s) → ~0 (+0.7s). Setting `noautohide` on `media-controller` restores the picture instantly without mouse movement; it also reproduces under SwiftShader software rendering.
- Root cause: our `MediaController` is slotted inside a `MediaContainer`. media-chrome 4.19.2’s autohide rule (`::slotted(:not([slot=media])…){opacity:0;transition:opacity 1s}`) therefore fades the whole slotted controller — video included. Its “don’t fade while paused” guard keys on `mediapaused`, which the outer container never relays, so the guard fails and even the fresh-load state fades.

**Decision.** Remove media-chrome. The player is a native `<video>` plus a hand-built transport row of shadcn controls, always visible, placed directly under the Ruler: play/pause, `elapsed / duration` time display, the rate menu (`0.25 0.5 1 1.5 2`, click opens a list), mute, volume, and fullscreen. The embedded progress range is gone; the Ruler is the only progress and seek surface, frame-snapped. There is no autohide and no fade anywhere in the player. Keyboard behavior is unchanged: Space toggles playback, `i`/`[` and `o`/`]` stay Mark from / Apply.

Acceptance for the change: while playing, moving the mouse away must never darken the picture; a freshly opened Clip must show its first frame without any hover; fullscreen, rate, and volume keep working.

## Considered Options

- **`noautohide` on `MediaController`** — verified one-attribute fix, kept as the fallback if the replacement stalls; rejected as the end state because the buggy autohide path and the dependency stay.
- **Keep media-chrome and only move the control bar out** — rejected; the fading rule targets any slotted non-media child, so the fragile nesting remains, and the embedded seconds-based progress range still fights the frame-snapped Ruler.
- **Hand-drawn frame transport for JPEG Clips (no `<video>`)** — rejected; transcoded mp4 playback in a native element is correct, only the chrome was wrong.
- **Overlay controls on the picture without autohide** — rejected; covers anatomy (ADR 0021’s Lane well decision keeps the picture clear).

## Consequences

- `media-chrome` leaves `package.json`; `player-chrome.css` and the media-chrome imports in `web/src/components/ui/video-player.tsx` go away.
- Playwright assertions on `media-time-range` / `media-play-button` / `media-*-display` are rewritten for the hand-built controls.
- A second look at the time display: it shows seconds of the transcoded mp4 while labels stay on Frames — the Ruler remains the frame-accurate surface (ADR 0003/0016 still hold).
