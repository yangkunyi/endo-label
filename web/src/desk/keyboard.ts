import { isUndoKey, type UndoKeyEvent } from "../overlayCoords";

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
 * The mask desk's keydown rule, as a pure decision.
 *
 * Escape drops pending marks that never Predict-ed; the undo chord (`ctrl/meta+Z`)
 * runs Undo. Both are suppressed inside a field the user is typing in. The chord
 * is gated on `mayUndo` as well: an item this Account may not write must be as
 * inert to the keyboard as it is to the disabled Undo button, or the chord walks
 * past a gate the click respects.
 *
 * `editable` is the caller's `isEditableTarget(event.target)` rather than the
 * target itself, because that check is a DOM question and this rule is pinned
 * without a DOM.
 */
export function maskKeyAction(
  event: { key: string } & UndoKeyEvent,
  choices: { editable: boolean; mayUndo: boolean },
): MaskKeyAction {
  if (choices.editable) {
    return "ignore";
  }
  if (event.key === "Escape") {
    return "dropPending";
  }
  if (isUndoKey(event)) {
    return choices.mayUndo ? "undo" : "ignore";
  }
  return "ignore";
}
