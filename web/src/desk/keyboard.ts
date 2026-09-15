import { isUndoKey, type UndoKeyEvent } from "../overlayCoords";
import { mayUndo, type MaskBusy, type MaskWrite } from "./maskControls";

/** True when the given event target is a field the user is typing into. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
    return true;
  }
  return Boolean(target.closest('[role="textbox"], [role="combobox"], [role="searchbox"]'));
}

/** What the mask desk's keydown does with one event. */
export type MaskKeyAction = "dropPending" | "undo" | "ignore";

/**
 * The mask desk's keydown situation.
 *
 * `editable` is the caller's `isEditableTarget(event.target)` rather than the target
 * itself, because that check is a DOM question and this rule is pinned without a DOM.
 * `write` and `busy` are the write gate's own inputs — the item's `/api/me` cell and
 * the writes in flight — so `mayUndo` is derived here rather than handed in as a
 * boolean: no call site can pass a `mayUndo: true` the disabled Undo button would not.
 */
export type MaskChordState = {
  editable: boolean;
  write: MaskWrite;
  busy: MaskBusy;
};

/**
 * The mask desk's keydown rule, as a pure decision.
 *
 * Escape drops pending marks that never Predict-ed; the undo chord (`ctrl/meta+Z`)
 * runs Undo. Both are suppressed inside a field the user is typing in. The chord
 * is gated on `mayUndo` as well: an item this Account may not write must be as
 * inert to the keyboard as it is to the disabled Undo button, or the chord walks
 * past a gate the click respects.
 */
export function maskKeyAction(event: { key: string } & UndoKeyEvent, state: MaskChordState): MaskKeyAction {
  if (state.editable) {
    return "ignore";
  }
  if (event.key === "Escape") {
    return "dropPending";
  }
  if (isUndoKey(event)) {
    return mayUndo(state.write.writable, state.busy) ? "undo" : "ignore";
  }
  return "ignore";
}

/**
 * Whether the mask desk consumes the keystroke, i.e. calls `preventDefault()` on it.
 *
 * Only a chord the desk acts on is consumed. A chord it leaves inert — a non-writable
 * item, which `maskKeyAction` answers `"ignore"` — is not, so the browser's own Ctrl+Z
 * receives the event instead of being swallowed by a desk that does nothing with it.
 * That is the decision: inert and left to the browser, never inert and swallowed. A
 * field being typed in is untouched either way (`isEditableTarget` answers first); the
 * choice is about a desk key the mask gate turned down, where the desk has no undo of
 * its own to offer and no reason to hide the browser's.
 */
export function maskKeyConsumes(action: MaskKeyAction): boolean {
  return action === "undo";
}
