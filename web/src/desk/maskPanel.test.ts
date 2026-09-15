/**
 * The mask desk as the reader meets it: the mapping in `maskControls.ts` wired to the
 * real surfaces — the panel's controls and the canvas on the picture — rendered to
 * static markup.
 *
 * This repo has no DOM test environment, so the desk is rendered on the server with the
 * mask item's `/api/me` cell already answered from the SWR fallback. That is what makes
 * the rendering worth asserting on: a correct pure mapping that the panel forgot to read
 * would pass `maskControls.test.ts` and still hand a non-assignee a working Predict. The
 * render is the promise ticket 23's finding asked for — no usable mask write, and the
 * server's own sentence sitting where the click used to fail.
 *
 * The canvas is in the same render on purpose: `inputEnabled` used to be wired from the
 * panel's own read, and only a render that includes `PlayerMaskOverlay` can say what the
 * gate does with a pointer. `data-mask-gate` carries the answer, so the read in flight
 * shows as `checking` — a held prompt — and never as the refused `refused`, whose only
 * sentence is the server's.
 */

import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SWRConfig } from "swr";
import { expect, test } from "vitest";
import { mePath, type ClipMeta, type Me, type MyItem, type TrackRow } from "../api";
import { MaskPanel, MaskSessionProvider, PlayerMaskOverlay } from "./MaskPanel";

const REFUSED = "This Clip's mask is assigned to alice: only alice writes its labels.";

const TRACKS: TrackRow[] = [{ track_id: 1, label: "track-1", color: "#4ade80", score: null }];

/** One manual mask on Frame 0, so Propagate has something to fill from. */
const FRAME_MASKS = [{ track_id: 1, format: "coco-rle", size: [2, 2], counts: [1, 3], source: "manual" }];

const CLIP: ClipMeta = { id: "CLIPA", kind: "jpeg", frame_count: 2, fps: 25, frames: [] };

async function noop(): Promise<undefined> {
  return undefined;
}

function pause(): void {}

/** The desk for one mask item cell — panel and canvas — as markup. */
function deskHtml(item: MyItem | undefined): string {
  const me: Me = {
    username: "bob",
    roles: { admin: false, reviewer: false, annotator: true },
    capabilities: { admin: false, review: false, annotate: true },
    item,
  };
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      { value: { fallback: { [mePath("CLIPA", "mask")]: me } } },
      createElement(
        MaskSessionProvider,
        {
          clipId: "CLIPA",
          clip: CLIP,
          frameIndex: 0,
          tracks: TRACKS,
          frameMasks: FRAME_MASKS,
          mutateAnnotation: noop,
          mutateFrameAnn: noop,
          notify: () => {},
          children: createElement(
            Fragment,
            null,
            createElement(MaskPanel),
            createElement(PlayerMaskOverlay, { videoRef: { current: null }, onPause: pause }),
          ),
        },
      ),
    ),
  );
}

function item(over: Partial<MyItem> = {}): MyItem {
  return {
    clip_id: "CLIPA",
    task_type: "mask",
    state: "Labeling",
    assignee: "alice",
    reviewer: null,
    note: null,
    reviewed_by: null,
    reviewed_at: null,
    delivered_at: null,
    version: 3,
    capabilities: {},
    write_refusal: null,
    ...over,
  };
}

/** The one `<button>` whose text is this label, as markup. */
function button(html: string, label: string): string {
  const match = html.match(new RegExp(`<button[^>]*>${label}</button>`));
  if (match === null) {
    throw new Error(`no button labelled ${label}`);
  }
  return match[0];
}

/** The one `<button>` carrying this attribute, as markup. */
function labelled(html: string, attribute: string): string {
  const match = html.match(new RegExp(`<button[^>]*${attribute}[^>]*>`));
  if (match === null) {
    throw new Error(`no button with ${attribute}`);
  }
  return match[0];
}

/** The Max frames input, as markup. */
function maxFrames(html: string): string {
  const match = html.match(/<input[^>]*aria-label="Max frames per direction"[^>]*>/);
  if (match === null) {
    throw new Error("no Max frames input");
  }
  return match[0];
}

/** The mask canvas on the picture, as markup. */
function canvas(html: string): string {
  const match = html.match(/<canvas[^>]*data-mask-overlay=""[^>]*>/);
  if (match === null) {
    throw new Error("no mask canvas");
  }
  return match[0];
}

/** What the canvas would do with a pointer: the gate the session handed it. */
function gate(html: string): string {
  const match = canvas(html).match(/data-mask-gate="([^"]+)"/);
  if (match === null) {
    throw new Error("the mask canvas carries no gate");
  }
  return match[1];
}

/** React renders a disabled control as `disabled=""`; every button's class list also
 * carries `disabled:` variants, so the attribute is what is asked for. */
function disabled(markup: string): boolean {
  return markup.includes('disabled=""');
}

/** The sentence the panel shows beside its controls, or null when it shows none. */
function refusalText(html: string): string | null {
  const match = html.match(/<p data-mask-refusal=""[^>]*>(.*?)<\/p>/);
  if (match === null) {
    return null;
  }
  // Markup escapes the apostrophe the server's sentence carries.
  return match[1].replace(/&#x27;/g, "'");
}

test("a mask item this Account may not write disables every write control and says why", () => {
  const html = deskHtml(
    item({ capabilities: { edit_labels: false }, write_refusal: REFUSED }),
  );

  // The sentence is the server's own, shown before the click rather than after a 403.
  expect(refusalText(html)).toBe(REFUSED);

  for (const label of ["New Track", "Predict", "Undo", "Clear mask", "Propagate"]) {
    expect(disabled(button(html, label)), label).toBe(true);
  }
  expect(disabled(button(html, "forward")), "forward").toBe(true);
  expect(disabled(maxFrames(html)), "Max frames").toBe(true);
  // The Track's own writes: no delete, and no rename hint to double-click on.
  expect(disabled(labelled(html, 'aria-label="Delete track-1"')), "delete track-1").toBe(true);
  expect(html).not.toContain("Double-click to rename");
  // Looking stays: the Track is still there to select and its eye still toggles.
  expect(disabled(labelled(html, 'aria-label="Hide lane"'))).toBe(false);
  // The canvas is shut for the same reason, and not with a crosshair.
  expect(gate(html)).toBe("refused");
  expect(canvas(html)).toContain("cursor-default");
  expect(canvas(html)).not.toContain("cursor-crosshair");
});

test("a writable mask item shows no sentence and waits only on its own state", () => {
  const html = deskHtml(item({ capabilities: { edit_labels: true } }));

  expect(refusalText(html)).toBeNull();

  // Editable: New Track, Propagate and the rename hint are live.
  expect(disabled(button(html, "New Track"))).toBe(false);
  expect(disabled(button(html, "Propagate"))).toBe(false);
  expect(disabled(button(html, "backward"))).toBe(false);
  expect(disabled(maxFrames(html))).toBe(false);
  expect(html).toContain("Double-click to rename");
  expect(disabled(labelled(html, 'aria-label="Delete track-1"'))).toBe(false);

  // Off for reasons that are not ownership: no pending prompt, nothing to undo, and
  // no active Track to clear.
  expect(disabled(button(html, "Predict"))).toBe(true);
  expect(disabled(button(html, "Undo"))).toBe(true);
  expect(disabled(button(html, "Clear mask"))).toBe(true);

  // The canvas takes prompts.
  expect(gate(html)).toBe("open");
  expect(canvas(html)).toContain("cursor-crosshair");
});

test("an unanswered item cell invents no sentence and offers no write", () => {
  const html = deskHtml(undefined);

  expect(refusalText(html)).toBeNull();
  for (const label of ["New Track", "Predict", "Undo", "Clear mask", "Propagate"]) {
    expect(disabled(button(html, label)), label).toBe(true);
  }
  expect(disabled(labelled(html, 'aria-label="Delete track-1"'))).toBe(true);
  // Only looking: Track selection and the Lane eye.
  expect(disabled(labelled(html, 'aria-label="Hide lane"'))).toBe(false);
});

test("the canvas holds a prompt drawn before `/api/me` answers, and never calls it refused", () => {
  const html = deskHtml(undefined);

  // `checking`, not `refused`: the gesture is kept for the answer instead of being
  // turned away as a write the server never refused.
  expect(gate(html)).toBe("checking");
  expect(canvas(html)).toContain("cursor-crosshair");
});
