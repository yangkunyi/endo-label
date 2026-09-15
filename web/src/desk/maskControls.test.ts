/**
 * The mapping from the mask item's `/api/me` cell to the mask controls' state, and to
 * what the picture canvas does with a pointer.
 *
 * The desk's half of ADR 0030: `edit_labels` false means no usable Predict, Propagate,
 * Undo, Clear mask, New Track, Track Label edit or Track delete and no picture prompts,
 * while looking at the Clip (Track selection, Lane eyes) stays. The sentence beside the
 * disabled controls is the server's own, so this file pins it to the payload rather than
 * to a second copy of the wording.
 *
 * The read has four answers, not two: `edit_labels` true, `edit_labels` false, a
 * `/api/me` that has not answered yet, and a read that ended without an answer at all.
 * The third is `unknown`, and this file pins that it is not a refusal — no write starts
 * on it, no sentence claims it, and the canvas holds a prompt drawn under it as
 * `checking` rather than turning the gesture away as `refused`. The fourth is
 * `unreadable` — the server's 404 for a (Clip, task type) pair with no item, or a
 * request that failed — and this file pins that it is not the held `unknown`: it holds
 * nothing, and the desk words its own line for it because no server sentence exists.
 */

import { expect, test } from "vitest";
import type { MyItem } from "../api";
import { mayUndo } from "./keyboard";
import {
  MASK_READ_FAILED,
  MASK_VIEW_CONTROLS,
  MASK_WRITE_CONTROLS,
  acceptsPointerInk,
  heldPromptOnAnswer,
  maskControlStates,
  maskPointerGate,
  maskReadFailure,
  maskWriteOf,
  type MaskBusy,
  type MaskRead,
  type MaskWrite,
} from "./maskControls";

const REFUSED = "This Clip's mask is assigned to alice: only alice writes its labels.";

const IDLE: MaskBusy = { job: false, predicting: false };
const JOB: MaskBusy = { job: true, predicting: false };
const PREDICTING: MaskBusy = { job: false, predicting: true };

/** A read that settled with no `/api/me` answer: the server's 404 with no body, or a
 * request that never arrived. */
const FAILED: MaskRead = { asked: true, isLoading: false, error: new Error("Not Found") };

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

const WRITABLE = maskWriteOf(item({ capabilities: { edit_labels: true } }));
const REFUSED_CELL = maskWriteOf(
  item({ capabilities: { edit_labels: false }, write_refusal: REFUSED }),
);
/** The read in flight: no item payload yet. */
const UNKNOWN = maskWriteOf(undefined);
/** The read ended without an answer: `/api/me`'s 404, or a failed request. */
const UNREADABLE = maskWriteOf(undefined, FAILED);
/** No Clip open: no read was ever asked, so there is no failure to report. */
const NO_CLIP = maskWriteOf(undefined, { asked: false, isLoading: false, error: null });

test("the mapping covers every control it declares, and no Save", () => {
  const mapped = Object.keys(states(maskWriteOf(item()), IDLE)).sort();
  expect(mapped).toEqual([...MASK_WRITE_CONTROLS, ...MASK_VIEW_CONTROLS].sort());
  // Every mask write lands on the edit, so the editor has no Save control to gate.
  expect(MASK_WRITE_CONTROLS as readonly string[]).not.toContain("save");
});

test("a cell the server calls writable turns every mask write control on", () => {
  expect(WRITABLE).toEqual({ state: "writable", writable: true, refusal: null });
  for (const control of MASK_WRITE_CONTROLS) {
    expect(states(WRITABLE)[control], control).toBe(true);
  }
  for (const control of MASK_VIEW_CONTROLS) {
    expect(states(WRITABLE)[control], control).toBe(true);
  }
});

test("a refused cell turns every mask write control off and keeps looking on", () => {
  expect(REFUSED_CELL).toEqual({ state: "refused", writable: false, refusal: REFUSED });
  for (const control of MASK_WRITE_CONTROLS) {
    expect(states(REFUSED_CELL)[control], control).toBe(false);
  }
  // Reading is not writing: a non-assignee still inspects the Clip's mask.
  for (const control of MASK_VIEW_CONTROLS) {
    expect(states(REFUSED_CELL)[control], control).toBe(true);
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
  expect(noSentence).toEqual({ state: "refused", writable: false, refusal: null });
  // An unanswered read carries no sentence either — but it is not that refusal.
  expect(UNKNOWN).toEqual({ state: "unknown", writable: false, refusal: null });
  expect(UNKNOWN.state).not.toBe(noSentence.state);
  // A failed read is not a refusal either: it carries no refusal sentence, and the one
  // line the desk words for it is about the read, not about ownership.
  expect(UNREADABLE).toEqual({ state: "unreadable", writable: false, refusal: null });
  expect(UNREADABLE.refusal).toBeNull();
});

test("an unanswered read is unknown, not refused: no write, no sentence, looking stays", () => {
  // Nothing is written while the answer is out, but nothing is claimed either.
  for (const control of MASK_WRITE_CONTROLS) {
    expect(states(UNKNOWN)[control], control).toBe(false);
  }
  // Only looking: Track selection and the Lane eye.
  for (const control of MASK_VIEW_CONTROLS) {
    expect(states(UNKNOWN)[control], control).toBe(true);
  }
  expect(UNKNOWN.refusal).toBeNull();
  expect(maskReadFailure(UNKNOWN)).toBeNull();
});

test("a read that ended without an answer is unreadable, not a hanging unknown", () => {
  // The 404 and the failed request are the same fact to the desk: `/api/me` will not
  // answer, so the state must not stay `checking` for the rest of the session.
  expect(UNREADABLE.state).toBe("unreadable");
  expect(UNREADABLE.state).not.toBe(UNKNOWN.state);
  expect(maskPointerGate(UNREADABLE, IDLE)).toBe("unreadable");
  expect(maskPointerGate(UNREADABLE, IDLE)).not.toBe("checking");
  expect(acceptsPointerInk(maskPointerGate(UNREADABLE, IDLE))).toBe(false);

  // No write and no hold, and the panel has its own line to show.
  for (const control of MASK_WRITE_CONTROLS) {
    expect(states(UNREADABLE)[control], control).toBe(false);
  }
  for (const control of MASK_VIEW_CONTROLS) {
    expect(states(UNREADABLE)[control], control).toBe(true);
  }
  expect(maskReadFailure(UNREADABLE)).toBe(MASK_READ_FAILED);

  // The same state from a read that ended with no item and no error: the server's 404
  // is a settled answer, not a read in flight.
  const answered404 = maskWriteOf(undefined, { asked: true, isLoading: false, error: null });
  expect(answered404).toEqual(UNREADABLE);

  // No Clip open asks no question: that stays `unknown`, not a failure.
  expect(NO_CLIP).toEqual(UNKNOWN);
  expect(maskReadFailure(NO_CLIP)).toBeNull();
});

test("a failed read stays unreadable while a retry is in flight, until an answer lands", () => {
  // SWR retries; the desk does not go back to holding a prompt for each retry.
  const retrying = maskWriteOf(undefined, { asked: true, isLoading: true, error: new Error("Not Found") });
  expect(retrying).toEqual(UNREADABLE);
  // The answer that lands writable is what ends it.
  expect(maskWriteOf(item({ capabilities: { edit_labels: true } }), FAILED)).toEqual(WRITABLE);
});

test("the canvas gate holds an unanswered read instead of turning it away", () => {
  expect(maskPointerGate(WRITABLE, IDLE)).toBe("open");
  // A prompt under a Predict is queued by the debounce, so the canvas stays open.
  expect(maskPointerGate(WRITABLE, PREDICTING)).toBe("open");
  // The read in flight is not a refusal: the prompt is held for the answer.
  expect(maskPointerGate(UNKNOWN, IDLE)).toBe("checking");
  // Only the server's own no turns the gesture away as a refusal.
  expect(maskPointerGate(REFUSED_CELL, IDLE)).toBe("refused");
  // A read that never answered is its own reason, not the refusal's.
  expect(maskPointerGate(UNREADABLE, IDLE)).toBe("unreadable");
  // A Propagate Job owns the Clip whatever the permission says (story 86).
  expect(maskPointerGate(WRITABLE, JOB)).toBe("busy");
  expect(maskPointerGate(UNKNOWN, JOB)).toBe("busy");
  expect(maskPointerGate(REFUSED_CELL, JOB)).toBe("busy");
  expect(maskPointerGate(UNREADABLE, JOB)).toBe("busy");
  // The gate is open exactly where the prompts control is live.
  for (const write of [WRITABLE, REFUSED_CELL, UNKNOWN, UNREADABLE]) {
    for (const busy of [IDLE, PREDICTING, JOB]) {
      expect(maskPointerGate(write, busy) === "open").toBe(states(write, busy).prompts);
    }
  }
});

test("a gate that turns mid-drag stops accepting ink: the canvas repaints without it", () => {
  // A drag starts under one of these and its ink is drawn to the canvas; when the gate
  // turns to one of the others the gesture is a write the desk may no longer make, and
  // the half-drawn segment is discarded and repainted rather than left as ink on a
  // canvas nothing repaints. This is the truth table the overlay's clear effect and its
  // in-flight repaint guard are built from; the wiring is hand-verified.
  expect(acceptsPointerInk("open")).toBe(true);
  expect(acceptsPointerInk("checking")).toBe(true);
  expect(acceptsPointerInk("busy")).toBe(false);
  expect(acceptsPointerInk("refused")).toBe(false);
  expect(acceptsPointerInk("unreadable")).toBe(false);
});

test("the answer that lands decides the held prompt: send, drop, or hold", () => {
  // ADR 0030's middle, as a truth table the two held-prompt effects are built from.
  expect(heldPromptOnAnswer(WRITABLE)).toBe("send");
  expect(heldPromptOnAnswer(REFUSED_CELL)).toBe("drop");
  expect(heldPromptOnAnswer(UNKNOWN)).toBe("hold");
  // A read that never answered drops it: nothing is coming, so nothing is held.
  expect(heldPromptOnAnswer(UNREADABLE)).toBe("drop");
  // The decision agrees with the controls: `send` is exactly where the prompts control
  // is live, and the canvas takes ink wherever the prompt is sent or still held.
  for (const write of [WRITABLE, REFUSED_CELL, UNKNOWN, UNREADABLE]) {
    expect(heldPromptOnAnswer(write) === "send").toBe(states(write, IDLE).prompts);
    expect(acceptsPointerInk(maskPointerGate(write, IDLE))).toBe(heldPromptOnAnswer(write) !== "drop");
  }
});

test("a write in flight only ever subtracts: prompts queue under a Predict", () => {
  const predicting = states(WRITABLE, PREDICTING);
  // The debounce collects clicks made while a Predict runs, so prompts stay live.
  expect(predicting.prompts).toBe(true);
  for (const control of MASK_WRITE_CONTROLS) {
    if (control === "prompts") {
      continue;
    }
    expect(predicting[control], control).toBe(false);
  }

  // A Propagate Job owns the Clip — the server refuses mask edits until it finishes.
  const job = states(WRITABLE, JOB);
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
  expect(states(REFUSED_CELL, JOB)).toEqual(states(REFUSED_CELL, IDLE));
  // A failed read is off under a Job for the Job's reason, like any other non-writable
  // cell, so the panel's sentence does not change with the Job.
  expect(states(UNREADABLE, JOB)).toEqual(states(UNREADABLE, IDLE));
});
