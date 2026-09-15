/**
 * The focus guard a pointer click runs through.
 *
 * A mouse click must not leave focus on the control it hit: with focus on a
 * button, Enter re-fires it, and with focus on a checkbox, Space toggles it
 * instead of the transport — so the desk's keys read as intercepted after a
 * click that was only meant to press something. A keyboard user who Tabs to a
 * control is not affected: nothing here runs for a keyboard activation, so
 * Space and Enter stay the control's there.
 *
 * The control a click hit is not always the element the click landed on. The
 * Clip rail renders its scope toggle as a `<label>` wrapping the checkbox, so
 * clicking the words "Every Clip (admin)" lands on the *label* — and the
 * browser puts focus on the input that label names. A guard that looks only for
 * `input[type=checkbox]` never sees that click, which is exactly the defect it
 * was widened for one attribute over.
 *
 * The rule is a pure function over as much of an element as it reads, so it is
 * pinned in a vitest test although this repo has no DOM test environment: an
 * `HTMLElement` satisfies `GuardedElement` as it stands, and the desk hands the
 * click's own target in.
 *
 * What this file does not carry is the wiring: `ClipDesk.tsx` attaches the rule
 * as the desk `<main>`'s `onPointerUp`, and no node test can render `<main>`. That
 * attachment is hand-verified (AGENTS.md → Verification; the owner's list in
 * `.scratch/pilot-ux/notes/21-the-pins-this-range-still-owes.md`), so the unit
 * test below must not be read as pinning it.
 */

/** As much of an element as the guard reads. An `HTMLElement` satisfies this as it is. */
export type GuardedElement = {
  /** Upper-cased tag name, as `Element.tagName`. */
  readonly tagName: string;
  /** One attribute, as `Element.getAttribute`. */
  getAttribute(name: string): string | null;
  /** The parent element, as `Element.parentElement`. */
  readonly parentElement: GuardedElement | null;
  /** The control a `<label>` names, as `HTMLLabelElement.control`. */
  readonly control?: GuardedElement | null;
  /** Take focus off this element, as `HTMLElement.blur`. */
  blur(): void;
};

/** Whether focus on this element would hold a key the desk's shortcuts want. */
function isControl(element: GuardedElement): boolean {
  if (element.tagName === "BUTTON") {
    return true;
  }
  const role = element.getAttribute("role");
  if (role === "button" || role === "radio") {
    return true;
  }
  return element.tagName === "INPUT" && element.getAttribute("type") === "checkbox";
}

/** Whether this element owns the focus inside it — a menu, a dialog, a popup's trigger. */
function ownsFocus(element: GuardedElement): boolean {
  const role = element.getAttribute("role");
  return (
    role === "dialog" ||
    role === "menu" ||
    role === "listbox" ||
    element.getAttribute("aria-haspopup") !== null
  );
}

/** The control a `<label>` names, or `null` for anything else. */
function namedControl(element: GuardedElement): GuardedElement | null {
  return element.tagName === "LABEL" ? (element.control ?? null) : null;
}

/**
 * The element a pointer click must take focus off, or `null` when focus must
 * stay where it is.
 *
 * Menus, dialogs and popups own the focus of everything inside them, so a click
 * there releases nothing wherever it lands. Anywhere else the click's effective
 * control is the first thing up from where it landed that is itself a control or
 * is a `label` naming one — so the rail's scope label releases its checkbox.
 */
export function controlToBlur(clicked: GuardedElement | null): GuardedElement | null {
  for (
    let element: GuardedElement | null = clicked;
    element !== null;
    element = element.parentElement
  ) {
    if (ownsFocus(element)) {
      return null;
    }
  }
  for (
    let element: GuardedElement | null = clicked;
    element !== null;
    element = element.parentElement
  ) {
    if (isControl(element)) {
      return element;
    }
    const named = namedControl(element);
    if (named !== null && isControl(named)) {
      return named;
    }
  }
  return null;
}
