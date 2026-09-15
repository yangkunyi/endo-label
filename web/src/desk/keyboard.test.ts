/**
 * The mask desk's keydown rule, pinned as plain data.
 *
 * The desk's handler is a `document` listener inside a provider, so this repo's
 * DOM-less vitest cannot press the chord. `maskKeyAction` is the decision that
 * listener makes — Escape drops the pending marks, the undo chord runs Undo — and it
 * takes the write gate's own inputs (`write`, `busy`) rather than a `mayUndo` boolean,
 * so this file pins the gate the disabled Undo button reads and no call site can pass
 * one the button would not honour.
 *
 * `maskKeyConsumes` is the other half: whether the desk calls `preventDefault()`. The
 * decision is that a chord the desk does not act on is left to the browser's own
 * Ctrl+Z — inert, never swallowed. The listener's attachment is hand-verified
 * (AGENTS.md → Verification).
 */

import { expect, test } from "vitest";
import { maskKeyAction, maskKeyConsumes } from "./keyboard";
import type { MaskBusy, MaskWrite } from "./maskControls";

const CMD_Z = { key: "z", ctrlKey: false, metaKey: true, shiftKey: false };
const CTRL_Z = { key: "z", ctrlKey: true, metaKey: false, shiftKey: false };
const SHIFT_CTRL_Z = { key: "z", ctrlKey: true, metaKey: false, shiftKey: true };

const IDLE: MaskBusy = { job: false, predicting: false };
const PREDICTING: MaskBusy = { job: false, predicting: true };
const JOB: MaskBusy = { job: true, predicting: false };

const WRITABLE: MaskWrite = { state: "writable", writable: true, refusal: null };
const REFUSED: MaskWrite = { state: "refused", writable: false, refusal: "assigned to alice" };
const UNREADABLE: MaskWrite = { state: "unreadable", writable: false, refusal: null };
const UNKNOWN: MaskWrite = { state: "unknown", writable: false, refusal: null };

const TYPING = { editable: true, write: WRITABLE, busy: IDLE };

test("the undo chord runs Undo on a writable item", () => {
  expect(maskKeyAction(CTRL_Z, { editable: false, write: WRITABLE, busy: IDLE })).toBe("undo");
  expect(maskKeyAction(CMD_Z, { editable: false, write: WRITABLE, busy: IDLE })).toBe("undo");
});

test("the undo chord is inert for an item this Account may not write", () => {
  // The gate is derived from the same cell the disabled Undo button reads; the chord
  // must not walk past it. The refused and unreadable cells are both non-writable.
  for (const write of [REFUSED, UNREADABLE, UNKNOWN]) {
    expect(maskKeyAction(CTRL_Z, { editable: false, write, busy: IDLE }), write.state).toBe("ignore");
    expect(maskKeyAction(CMD_Z, { editable: false, write, busy: IDLE }), write.state).toBe("ignore");
  }
});

test("the undo chord is inert while a write is in flight, as the Undo button is", () => {
  for (const busy of [PREDICTING, JOB]) {
    expect(maskKeyAction(CTRL_Z, { editable: false, write: WRITABLE, busy })).toBe("ignore");
  }
});

test("an inert chord is left to the browser, not swallowed", () => {
  // The decision the closeout review asked for: the desk calls `preventDefault()` only
  // for a chord it acts on. A refused item's Ctrl+Z is `ignore` and unconsumed, so the
  // browser's own Ctrl+Z receives it rather than a desk that does nothing with it.
  expect(maskKeyConsumes(maskKeyAction(CTRL_Z, { editable: false, write: REFUSED, busy: IDLE }))).toBe(
    false,
  );
  expect(maskKeyConsumes(maskKeyAction(CTRL_Z, { editable: false, write: WRITABLE, busy: IDLE }))).toBe(
    true,
  );
  // Escape is a drop, not a chord the desk claims from the browser either.
  expect(maskKeyConsumes("dropPending")).toBe(false);
  expect(maskKeyConsumes("ignore")).toBe(false);
});

test("a field being typed in swallows both keys", () => {
  expect(maskKeyAction(CTRL_Z, TYPING)).toBe("ignore");
  expect(maskKeyAction({ ...CTRL_Z, key: "Escape" }, TYPING)).toBe("ignore");
  // The field keeps its own undo: nothing is consumed on its behalf.
  expect(maskKeyConsumes(maskKeyAction(CTRL_Z, TYPING))).toBe(false);
});

test("Escape drops pending marks, and keys that are neither do nothing", () => {
  const escape = { key: "Escape", ctrlKey: false, metaKey: false, shiftKey: false };
  expect(maskKeyAction(escape, { editable: false, write: WRITABLE, busy: IDLE })).toBe("dropPending");
  // Escape is not a write: it drops marks even on an item this Account may not write.
  expect(maskKeyAction(escape, { editable: false, write: REFUSED, busy: IDLE })).toBe("dropPending");
  // Shift is the redo chord, never another Undo, and a bare z is nothing.
  expect(maskKeyAction(SHIFT_CTRL_Z, { editable: false, write: WRITABLE, busy: IDLE })).toBe("ignore");
  expect(maskKeyAction({ ...CTRL_Z, key: "y" }, { editable: false, write: WRITABLE, busy: IDLE })).toBe(
    "ignore",
  );
  expect(
    maskKeyAction(
      { key: "z", ctrlKey: false, metaKey: false, shiftKey: false },
      { editable: false, write: WRITABLE, busy: IDLE },
    ),
  ).toBe("ignore");
});
