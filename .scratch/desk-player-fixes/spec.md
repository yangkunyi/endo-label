Status: specified — ticket 01 resolved; tickets 02–03 ready-for-agent

# Spec: Trash clears the Brush; the player transport is hand-built and always visible

Parents: `.scratch/desk-brush-lanes/spec.md`, `.scratch/desk-ruler/spec.md`, `.scratch/desk-modern-player/spec.md`. Domain: [CONTEXT.md](../../CONTEXT.md). Decision: [ADR 0022](../../docs/adr/0022-custom-player-transport.md). Related: [ADR 0017](../../docs/adr/0017-modern-player-tokens.md) tokens (transport clause superseded), [ADR 0018](../../docs/adr/0018-timeline-ruler-clip-rail.md) Ruler, [ADR 0021](../../docs/adr/0021-brush-lane-well.md) Lane well, [ADR 0013](../../docs/adr/0013-shadcn.md) kit. UI copy stays English. mask stays off this page.

## Tickets

- [01 — Trash clears the Brush](issues/01-trash-clears-brush.md) (`resolved`)
- [02 — Hand-built transport replaces media-chrome](issues/02-hand-built-transport.md) (`ready-for-agent`)
- [03 — Full desk e2e closeout](issues/03-e2e-closeout.md) (`ready-for-agent`, blocked by 01, 02)

## Problem Statement

Trashing a Vocab name leaves it in the Brush: the bottom bar still shows a chip for a name that no longer exists, and the next Apply can write it again. Separately, the player fades to black: while playing, moving the mouse away fades the whole player out in one second, and a freshly opened Clip starts faded until the first hover. The desk plays through media-chrome, whose autohide rule fades the entire slotted controller because our container/controller nesting defeats its paused-guard; on top of that, the embedded seconds-based progress range and the frame-snapped Ruler are two rulers that never line up.

## Solution

**Brush hygiene.** Trashing a Vocab name (phase, class tag, or exact triple) drops that identity from its kind's Brush in the sitting store. The footer chip disappears immediately; an emptied Brush behaves like any empty Brush (Mark from / Apply / Remove / `i` `[` `o` `]` disabled). Stale machine-local Lane-visibility keys for deleted names are left alone — they are never read again.

**Player.** media-chrome is removed. The player is a native `<video>` plus a hand-built transport row of shadcn controls on one always-visible line directly under the Ruler: play/pause, `elapsed / duration`, a rate menu (`0.25 0.5 1 1.5 2`, click opens a list, never cycles), mute, volume, and fullscreen. There is no autohide and no fade anywhere. The embedded progress range is gone — the Ruler is the only progress and seek surface, frame-snapped to Frames. Space, `i`/`[` Mark from, and `o`/`]` Apply are unchanged. JPEG and video Clips share the same transport.

Black-screen acceptance: while playing, moving the mouse away never darkens the picture; a freshly opened Clip shows its first frame without any hover.

## User Stories

### Brush hygiene

1. As a labeler, I want trashing a Vocab name that is in the Brush to remove it from the Brush, so that the bottom bar never offers a name that no longer exists.
2. As a labeler, I want that removal to apply only to the matching kind and identity (a class tag, a phase name, or that exact triple), so that the other kinds' Brushes stay intact.
3. As a labeler, I want trashing a name that is not in the Brush to change nothing, so that unrelated Brush state never moves.
4. As a labeler, I want an emptier Brush to disable Mark from, Apply, Remove, and `i` `[` `o` `]` exactly like any empty Brush, so that the empty rule has no exceptions.
5. As a labeler, I want trash not to touch any other kind's Brush membership, so that switching Task focus still finds the sets I left there.
6. As a labeler, I want trash to leave the machine-local Lane-visibility store alone, so that hiding behavior for surviving names is untouched.
7. As a labeler, I want the footer to keep showing ×-drops and the color of every remaining chip, so that Brush editing feels the same after a trash.
8. As a labeler, I want a failed trash (HTTP error) to leave the Brush unchanged, so that the chips never disagree with disk.

### Player transport

9. As a labeler, I want a freshly opened Clip to show its first frame without any hover, so that the desk never opens on a black picture.
10. As a labeler, I want moving the mouse away while playing to leave the picture fully visible, so that playback never fades to black.
11. As a labeler, I want no autohide and no fade animation anywhere in the player, so that the picture cannot be hidden by a timer.
12. As a labeler, I want play/pause on a transport row directly under the Ruler, so that transport and seek sit on one visual axis.
13. As a labeler, I want the transport row always visible, so that I never hover-hunt for controls.
14. As a labeler, I want `elapsed / duration` shown on that row, so that I keep a sense of position inside the Clip.
15. As a labeler, I want the rate control to be a menu opening `0.25 0.5 1 1.5 2`, so that slow speeds are reachable without cycling.
16. As a labeler, I want mute and volume on the same row, so that audio control stays one glance away.
17. As a labeler, I want fullscreen on the same row and driven by the browser's native API, so that fullscreen works without a UI library.
18. As a labeler, I want the embedded progress range deleted, so that there is exactly one progress ruler.
19. As a labeler, I want the Ruler to stay the frame-snapped seek surface, so that seeking and labels keep talking in Frames.
20. As a labeler, I want the transport time to be informational seconds only, so that it never competes with the Ruler as a seek target.
21. As a labeler, I want Space to keep toggling playback, so that my hands keep their habits.
22. As a labeler, I want `i`/`[` and `o`/`]` to keep meaning Mark from / Apply, so that span painting is untouched by the player swap.
23. As a labeler, I want keyboard shortcuts to stay ignored while I type in an input or combobox, so that rename and add-name stay safe.
24. As a labeler, I want JPEG and video Clips to share this transport, so that kind does not change the chrome.
25. As a labeler, I want the media-chrome dependency gone from the desk, so that its autohide behavior cannot come back.
26. As a labeler, I want the player column order to stay picture, Ruler, transport row, Lane well, so that the well keeps its reserved height and the picture never jumps.
27. As a labeler, I want error and empty states ("Clip not found", "This Clip has no Frames") to keep working, so that the swap does not regress edge states.

### Verification

28. As a labeler, I want the browser suite to prove the black-screen fix by moving the mouse off a playing player and asserting the picture stays visible, so that this bug cannot return.
29. As a labeler, I want the browser suite to assert the picture is visible on a fresh open before any hover, so that the faded-first-open bug cannot return.
30. As a labeler, I want the full desk suite green after the swap, so that nothing else regressed.

## Implementation Decisions

- **Dependency**: media-chrome leaves `package.json`; the player chrome CSS overrides and the media-chrome React imports go away. The player is one local module: native `<video>` element plus shadcn buttons and Lucide icons.
- **Transport row**: one shrink-0 line directly under the Ruler and above the Lane well. Player column keeps the ADR 0021 vertical split (picture `flex-1 min-h-0`, Ruler shrink-0, transport row shrink-0, well reserved). The row never overlays the picture and never fades.
- **Controls**: play/pause toggles native play/pause. Time display updates from `timeupdate` and shows `elapsed / duration` in `m:ss`. Rate menu is a click-open list setting `playbackRate` (`0.25 0.5 1 1.5 2`, no cycling). Mute toggles `muted`; volume sets `volume`. Fullscreen uses the native Fullscreen API on the player section.
- **Progress**: no embedded range. The Ruler keeps frame-snapped drag and click-to-seek; the transport time is display-only.
- **Keyboard**: Space toggles playback; `i`/`[`/`o`/`]` and Backspace/Delete semantics unchanged; typing-in-input guard unchanged.
- **Brush cleanup**: the Vocab trash confirm handler (phase, class, and exact triple paths) drops the deleted identity from its kind's Brush in the sitting store before refreshing Library data. Membership is by identity; ordering stays Vocab order. Empty-Brush disabling rules are the existing ones. No HTTP change; a failed trash request leaves the Brush untouched.
- **Visibility store**: trash does not prune machine-local Lane-visibility entries for deleted identities.
- **Backend**: no schema, route, or JSON change.

## Testing Decisions

- **Primary seam**: the existing Playwright desk suite, rewritten for the hand-built controls. Retire every `media-*` element assertion. New regression cases: (a) open a Clip, move the mouse away, assert the player surface is still opaque and non-black (computed opacity of the player surface stays 1; a pixel probe on the player region is not black); (b) fresh open shows the picture before any hover; (c) rate menu opens a list with `0.25` and does not cycle; (d) mute/volume/fullscreen toggle their effects.
- **Store seam**: existing sitting-store unit tests grow cases for trash-drops-Brush-membership (matching kind only; other kinds untouched; failed request leaves state). This is the only new unit surface; no new test seam is introduced.
- **What a good test is**: external sitting behavior — what the labeler sees and presses. No assertions on internal store field names or CSS class strings beyond the stable `aria-*` / `data-*` hooks the suite already uses.
- **Prior art**: the serial Playwright desk suite (clip/label/player/keyboard flows) and the sitting-store unit tests.
- **Gate**: `tsc` green; vitest green; Playwright desk suite green; pytest untouched and green.

## Out of Scope

- mask, Session, scribble, canvas.
- Persisting volume/rate across reloads or machines.
- Frame-stepping keys (`,`/`.`), new keyboard bindings, or changing `i`/`o` semantics.
- Ruler redesign, Lane well geometry, Lane visibility behavior beyond trash leaving the store alone.
- Hand-drawn frame transport replacing `<video>` for JPEG Clips.
- New span HTTP, backend changes, YAML changes.

## Further Notes

The black-fade evidence and the `noautohide` fallback are recorded in ADR 0022; if the replacement stalls, that one-attribute fix is the documented fallback, but the end state removes the dependency. The transport time is seconds-based while labels are Frame-based by design (ADR 0016); the Ruler remains the only seek and progress surface (ADR 0018).
