/**
 * The mapping from the mask item's `/api/me` cell to the mask controls' state.
 *
 * The desk's half of ADR 0030: `edit_labels` false means no usable Predict, Propagate,
 * Undo, Clear mask, New Track, Track Label edit or Track delete and no picture prompts,
 * while looking at the Clip (Track selection, Lane eyes) stays. The sentence beside the
 * disabled controls is the server's own, so this file pins it to the payload rather than
 * to a second copy of the wording.
 */

import { expect, test } from "vitest";
import type { MyItem } from "../api";
import {
  MASK_VIEW_CONTROLS,
  MASK_WRITE_CONTROLS,
  maskControlStates,
  maskWriteOf,
  mayUndo,
  type MaskBusy,
  type MaskWrite,
} from "./maskControls";

const REFUSED = "This Clip's mask is assigned to alice: only alice writes its labels.";

const IDLE: MaskBusy = { job: false, predicting: false };
const JOB: MaskBusy = { job: true, predicting: false };
const PREDICTING: MaskBusy = { job: false, predicting: true };

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

/** One control's state, for a permission and a moment. */
function states(write: MaskWrite, busy: MaskBusy = IDLE) {
  return maskControlStates(write, busy);
}

test("the mapping covers every control it declares, and no Save", () => {
  const mapped = Object.keys(states(maskWriteOf(item()), IDLE)).sort();
  expect(mapped).toEqual([...MASK_WRITE_CONTROLS, ...MASK_VIEW_CONTROLS].sort());
  // Every mask write lands on the edit, so the editor has no Save control to gate.
  expect(MASK_WRITE_CONTROLS as readonly string[]).not.toContain("save");
});

test("a cell the server calls writable turns every mask write control on", () => {
  const write = maskWriteOf(item({ capabilities: { edit_labels: true } }));
  expect(write).toEqual({ writable: true, refusal: null });
  for (const control of MASK_WRITE_CONTROLS) {
    expect(states(write)[control], control).toBe(true);
  }
  for (const control of MASK_VIEW_CONTROLS) {
    expect(states(write)[control], control).toBe(true);
  }
});

test("a refused cell turns every mask write control off and keeps looking on", () => {
  const write = maskWriteOf(
    item({ capabilities: { edit_labels: false }, write_refusal: REFUSED }),
  );
  expect(write).toEqual({ writable: false, refusal: REFUSED });
  for (const control of MASK_WRITE_CONTROLS) {
    expect(states(write)[control], control).toBe(false);
  }
  // Reading is not writing: a non-assignee still inspects the Clip's mask.
  for (const control of MASK_VIEW_CONTROLS) {
    expect(states(write)[control], control).toBe(true);
  }
});

test("a review of someone else's item is refused like any other, in its own words", () => {
  // A Reviewing item: the annotator's cell, not the assigned reviewer's.
  const write = maskWriteOf(
    item({
      state: "Reviewing",
      reviewer: "carol",
      capabilities: { edit_labels: false },
      write_refusal: "This Clip's mask is in Review — only its reviewer (carol) may edit its labels.",
    }),
  );
  expect(write.refusal).toBe(
    "This Clip's mask is in Review — only its reviewer (carol) may edit its labels.",
  );
  expect(states(write).predict).toBe(false);
  expect(states(write).selectTrack).toBe(true);
});

test("the desk never words a refusal of its own", () => {
  // A refused cell whose payload carries no sentence disables the editor and says
  // nothing rather than inventing wording the server would not use.
  const noSentence = maskWriteOf(item({ capabilities: { edit_labels: false } }));
  expect(noSentence).toEqual({ writable: false, refusal: null });

  // No item payload at all: no Clip open, the read in flight, or a pair `/api/me`
  // answers 404 for. Nothing is written, and nothing is claimed either.
  const unanswered = maskWriteOf(undefined);
  expect(unanswered).toEqual({ writable: false, refusal: null });
  expect(states(unanswered).predict).toBe(false);
  expect(states(unanswered).deleteTrack).toBe(false);
});

test("a write in flight only ever subtracts: prompts queue under a Predict", () => {
  const write = maskWriteOf(item({ capabilities: { edit_labels: true } }));

  const predicting = states(write, PREDICTING);
  // The debounce collects clicks made while a Predict runs, so prompts stay live.
  expect(predicting.prompts).toBe(true);
  for (const control of MASK_WRITE_CONTROLS) {
    if (control === "prompts") {
      continue;
    }
    expect(predicting[control], control).toBe(false);
  }

  // A Propagate Job owns the Clip — the server refuses mask edits until it finishes.
  const job = states(write, JOB);
  for (const control of MASK_WRITE_CONTROLS) {
    expect(job[control], control).toBe(false);
  }
  expect(job.selectTrack).toBe(true);
  expect(job.laneVisibility).toBe(true);
});

test("the undo chord is inert for a non-writable item while the Undo button is disabled", () => {
  const refused = maskWriteOf(
    item({ capabilities: { edit_labels: false }, write_refusal: REFUSED }),
  );
  // The chord's own guard and the button's `controls.undo` are one predicate:
  // `mayUndo` gates both, so the keyboard cannot walk past the disabled button.
  expect(mayUndo(refused.writable, IDLE)).toBe(false);
  expect(states(refused, IDLE).undo).toBe(false);

  // Writable, idle, and the two agree the other way; a write in flight subtracts
  // from both, as the mapping's other controls do.
  const writable = maskWriteOf(item({ capabilities: { edit_labels: true } }));
  expect(mayUndo(writable.writable, IDLE)).toBe(true);
  expect(states(writable, IDLE).undo).toBe(true);
  expect(mayUndo(writable.writable, PREDICTING)).toBe(false);
  expect(mayUndo(writable.writable, JOB)).toBe(false);
  expect(states(writable, JOB).undo).toBe(false);
});

test("a busy Clip an Account may not write is off for the same reason and the same shape", () => {
  const refused = maskWriteOf(
    item({ capabilities: { edit_labels: false }, write_refusal: REFUSED }),
  );
  expect(states(refused, JOB)).toEqual(states(refused, IDLE));
});
