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
 * The read has three answers, not two: `edit_labels` true, `edit_labels` false, and
 * `/api/me` not answered at all. The last is `unknown`, and this file pins that it is not
 * a refusal — no write starts on it, no sentence claims it, and the canvas holds a prompt
 * drawn under it as `checking` rather than turning the gesture away as `refused`.
 */

import { expect, test } from "vitest";
import type { MyItem } from "../api";
import {
  MASK_VIEW_CONTROLS,
  MASK_WRITE_CONTROLS,
  maskControlStates,
  maskPointerGate,
  maskWriteOf,
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

const WRITABLE = maskWriteOf(item({ capabilities: { edit_labels: true } }));
const REFUSED_CELL = maskWriteOf(
  item({ capabilities: { edit_labels: false }, write_refusal: REFUSED }),
);
/** The read in flight: no item payload yet. */
const UNKNOWN = maskWriteOf(undefined);

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
});

test("the canvas gate holds an unanswered read instead of turning it away", () => {
  expect(maskPointerGate(WRITABLE, IDLE)).toBe("open");
  // A prompt under a Predict is queued by the debounce, so the canvas stays open.
  expect(maskPointerGate(WRITABLE, PREDICTING)).toBe("open");
  // The read in flight is not a refusal: the prompt is held for the answer.
  expect(maskPointerGate(UNKNOWN, IDLE)).toBe("checking");
  // Only the server's own no turns the gesture away.
  expect(maskPointerGate(REFUSED_CELL, IDLE)).toBe("refused");
  // A Propagate Job owns the Clip whatever the permission says (story 86).
  expect(maskPointerGate(WRITABLE, JOB)).toBe("busy");
  expect(maskPointerGate(UNKNOWN, JOB)).toBe("busy");
  expect(maskPointerGate(REFUSED_CELL, JOB)).toBe("busy");
  // The gate is open exactly where the prompts control is live.
  for (const write of [WRITABLE, REFUSED_CELL, UNKNOWN]) {
    for (const busy of [IDLE, PREDICTING, JOB]) {
      expect(maskPointerGate(write, busy) === "open").toBe(states(write, busy).prompts);
    }
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

test("a busy Clip an Account may not write is off for the same reason and the same shape", () => {
  expect(states(REFUSED_CELL, JOB)).toEqual(states(REFUSED_CELL, IDLE));
});
