/**
 * The mask desk's keydown rule, pinned as plain data.
 *
 * The desk's handler is a `document` listener inside a provider, so this repo's
 * DOM-less vitest cannot press the chord. `maskKeyAction` is the decision that
 * listener makes — Escape drops the pending marks, the undo chord runs Undo —
 * and the one claim the closeout review found unpinned is here: a non-writable
 * item makes the chord inert, the way the Undo button is disabled.
 */

import { expect, test } from "vitest";
import { maskKeyAction } from "./keyboard";

const CMD_Z = { key: "z", ctrlKey: false, metaKey: true, shiftKey: false };
const CTRL_Z = { key: "z", ctrlKey: true, metaKey: false, shiftKey: false };
const SHIFT_CTRL_Z = { key: "z", ctrlKey: true, metaKey: false, shiftKey: true };
const IDLE = { editable: false, mayUndo: true };

test("the undo chord runs Undo on a writable item", () => {
  expect(maskKeyAction(CTRL_Z, IDLE)).toBe("undo");
  expect(maskKeyAction(CMD_Z, IDLE)).toBe("undo");
});

test("the undo chord is inert for an item this Account may not write", () => {
  // `mayUndo` is the server's `edit_labels` cell, the same gate the disabled
  // Undo button reads; the chord must not walk past it.
  const refused = { editable: false, mayUndo: false };
  expect(maskKeyAction(CTRL_Z, refused)).toBe("ignore");
  expect(maskKeyAction(CMD_Z, refused)).toBe("ignore");
});

test("a field being typed in swallows both keys", () => {
  const typing = { editable: true, mayUndo: true };
  expect(maskKeyAction(CTRL_Z, typing)).toBe("ignore");
  expect(maskKeyAction({ ...CTRL_Z, key: "Escape" }, typing)).toBe("ignore");
});

test("Escape drops pending marks, and keys that are neither do nothing", () => {
  const escape = { key: "Escape", ctrlKey: false, metaKey: false, shiftKey: false };
  expect(maskKeyAction(escape, IDLE)).toBe("dropPending");
  // Escape is not a write: it drops marks even on an item this Account may not write.
  expect(maskKeyAction(escape, { editable: false, mayUndo: false })).toBe("dropPending");
  // Shift is the redo chord, never another Undo, and a bare z is nothing.
  expect(maskKeyAction(SHIFT_CTRL_Z, IDLE)).toBe("ignore");
  expect(maskKeyAction({ ...CTRL_Z, key: "y" }, IDLE)).toBe("ignore");
  expect(maskKeyAction({ key: "z", ctrlKey: false, metaKey: false, shiftKey: false }, IDLE)).toBe(
    "ignore",
  );
});
