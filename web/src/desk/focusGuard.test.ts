/**
 * The pointer-click focus guard, pinned as plain data.
 *
 * `ClipDesk.tsx` has no test seam — it is a shell of providers — so the rule the
 * click runs through lives in `focusGuard.ts` as a pure function over the parts
 * of an element the guard reads. The elements below are hand-built in that
 * shape, which is what lets a repo with no DOM test environment pin "clicking
 * the words beside the checkbox releases the checkbox".
 */

import { expect, test } from "vitest";
import { controlToBlur, type GuardedElement } from "./focusGuard";

type Facts = {
  attrs?: Record<string, string>;
  parent?: GuardedElement | null;
  /** `HTMLLabelElement.control`: the control this label names, if it names one. */
  control?: GuardedElement | null;
};

/** One element of a click's path, in the shape the guard reads it. */
function element(
  tagName: string,
  { attrs = {}, parent = null, control = null }: Facts = {},
): GuardedElement {
  return {
    tagName,
    getAttribute: (name) => attrs[name] ?? null,
    parentElement: parent,
    control,
    blur: () => {},
  };
}

const CHECKBOX = element("INPUT", { attrs: { type: "checkbox" } });

test("a click on a control releases focus on it", () => {
  const button = element("BUTTON");
  expect(controlToBlur(button)).toBe(button);
  // A click on anything inside the control is a click on the control.
  expect(controlToBlur(element("SPAN", { parent: button }))).toBe(button);
});

test("the roles the desk's own chrome carries are controls too", () => {
  const radio = element("DIV", { attrs: { role: "radio" } });
  const fauxButton = element("DIV", { attrs: { role: "button" } });
  expect(controlToBlur(radio)).toBe(radio);
  expect(controlToBlur(fauxButton)).toBe(fauxButton);
  expect(controlToBlur(element("LABEL", { control: radio }))).toBe(radio);
});

test("the rail's scope label releases the checkbox it names", () => {
  // The rail renders `<label><input type="checkbox">Every Clip (admin)</label>`:
  // the click lands on the label, and the browser focuses the input it names —
  // so the label is the click's effective control, not the element under it.
  const label = element("LABEL", {
    control: CHECKBOX,
    parent: element("DIV", { parent: element("NAV") }),
  });

  expect(controlToBlur(label)).toBe(CHECKBOX);
  // The checkbox itself is still a control; both clicks release the same focus.
  expect(controlToBlur(CHECKBOX)).toBe(CHECKBOX);
});

test("a click that is no control leaves focus where it is", () => {
  expect(controlToBlur(null)).toBeNull();
  expect(controlToBlur(element("DIV", { parent: element("NAV") }))).toBeNull();
  expect(controlToBlur(element("A"))).toBeNull();
  // An input that claims no key the transport wants is not one of them.
  expect(controlToBlur(element("INPUT"))).toBeNull();
  expect(controlToBlur(element("INPUT", { attrs: { type: "text" } }))).toBeNull();
  // Nor is a label that names nothing, or names a control of that other kind:
  // clicking the "Project" label of a `<select>` must leave the field focused.
  expect(controlToBlur(element("LABEL"))).toBeNull();
  expect(controlToBlur(element("LABEL", { control: element("INPUT") }))).toBeNull();
});

test("a menu, a dialog or a popup keeps the focus of what it holds", () => {
  const inMenu = element("BUTTON", {
    parent: element("DIV", { attrs: { role: "menu" } }),
  });
  const inDialog = element("INPUT", {
    attrs: { type: "checkbox" },
    parent: element("DIV", { attrs: { role: "dialog" } }),
  });
  // The trigger owns its own focus: the click that opened the menu must not blur it.
  const trigger = element("BUTTON", { attrs: { "aria-haspopup": "menu" } });
  const inListbox = element("DIV", {
    attrs: { role: "option" },
    parent: element("DIV", { attrs: { role: "listbox" } }),
  });

  expect(controlToBlur(inMenu)).toBeNull();
  expect(controlToBlur(inDialog)).toBeNull();
  expect(controlToBlur(trigger)).toBeNull();
  expect(controlToBlur(inListbox)).toBeNull();
});
