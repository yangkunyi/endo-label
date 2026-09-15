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
 *
 * The last test pins the module's import direction from its own source: `TimelinePanel`,
 * `FrameControls` and `PlayerPanel` import `isEditableTarget` from here, so a value edge
 * out of this file that leads to a module with imports would drag a fetcher into all
 * three. The pin is conservative — it fails on *any* value import in the closure, whether
 * or not the module fetches — because "fetches nothing" is not readable from a module
 * body this test does not parse. The closure is walked with the TypeScript compiler
 * rather than a pattern over the text: what must not slip through is an edge that lands
 * quietly, and a side-effect import, a re-export, a dynamic `import()` and a single-quoted
 * specifier are value edges a pattern has to be taught about one at a time.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";
import { expect, test } from "vitest";
import { maskKeyAction, maskKeyConsumes } from "./keyboard";
import type { MaskBusy, ItemWrite } from "./maskControls";

const CMD_Z = { key: "z", ctrlKey: false, metaKey: true, shiftKey: false };
const CTRL_Z = { key: "z", ctrlKey: true, metaKey: false, shiftKey: false };
const SHIFT_CTRL_Z = { key: "z", ctrlKey: true, metaKey: false, shiftKey: true };

const IDLE: MaskBusy = { job: false, predicting: false };
const PREDICTING: MaskBusy = { job: false, predicting: true };
const JOB: MaskBusy = { job: true, predicting: false };

const WRITABLE: ItemWrite = { state: "writable", writable: true, refusal: null };
const REFUSED: ItemWrite = { state: "refused", writable: false, refusal: "assigned to alice" };
const UNREADABLE: ItemWrite = { state: "unreadable", writable: false, refusal: null };
const UNKNOWN: ItemWrite = { state: "unknown", writable: false, refusal: null };

const TYPING = { editable: true, write: WRITABLE, busy: IDLE };

const DESK_DIR = dirname(fileURLToPath(import.meta.url));

/** The module edges one source file declares, with the specifier and whether the whole
 * statement is erased at build: an `import type` / `export type`, or one whose specifiers
 * are all `type`. A side-effect import (`import "./x";`), a re-export (`export … from`),
 * and a dynamic `import("./x")` are all value edges and are read as such; `require` does
 * not exist in this tree and would not resolve its specifier to a module anyway.
 *
 * Parsed rather than pattern-matched, because the pin's claim is "no value edge out of
 * this file", and the failure it must not miss is an edge that lands quietly. */
function importsOf(path: string): { specifier: string; typeOnly: boolean }[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const imports: { specifier: string; typeOnly: boolean }[] = [];
  const add = (declare: ts.Node) => {
    if (ts.isImportDeclaration(declare) && ts.isStringLiteral(declare.moduleSpecifier)) {
      const clause = declare.importClause;
      const named = clause?.namedBindings;
      imports.push({
        specifier: declare.moduleSpecifier.text,
        typeOnly:
          clause?.isTypeOnly === true ||
          (named !== undefined &&
            ts.isNamedImports(named) &&
            named.elements.every((element) => element.isTypeOnly)),
      });
      return;
    }
    if (
      ts.isExportDeclaration(declare) &&
      declare.moduleSpecifier !== undefined &&
      ts.isStringLiteral(declare.moduleSpecifier)
    ) {
      const clause = declare.exportClause;
      imports.push({
        specifier: declare.moduleSpecifier.text,
        typeOnly:
          declare.isTypeOnly ||
          (clause !== undefined &&
            ts.isNamedExports(clause) &&
            clause.elements.every((element) => element.isTypeOnly)),
      });
      return;
    }
    if (
      ts.isImportEqualsDeclaration(declare) &&
      ts.isExternalModuleReference(declare.moduleReference) &&
      declare.moduleReference.expression !== undefined &&
      ts.isStringLiteral(declare.moduleReference.expression)
    ) {
      imports.push({
        specifier: declare.moduleReference.expression.text,
        typeOnly: declare.isTypeOnly,
      });
      return;
    }
    if (
      ts.isCallExpression(declare) &&
      declare.expression.kind === ts.SyntaxKind.ImportKeyword &&
      declare.arguments.length === 1 &&
      ts.isStringLiteral(declare.arguments[0])
    ) {
      // A dynamic import is a value edge whatever its names are used for.
      imports.push({ specifier: (declare.arguments[0] as ts.StringLiteral).text, typeOnly: false });
    }
  };
  const visit = (node: ts.Node) => {
    add(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

/** The file a relative specifier names, or null for a bare package specifier. */
function modulePath(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const base = resolve(dirname(from), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(`no module at ${specifier} (from ${from})`);
}

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

test("the module's value imports reach nothing that imports, so no fetcher enters a panel", () => {
  const entry = resolve(DESK_DIR, "keyboard.ts");
  // The walk must have found the edge it exists to walk. A pin that passes because it saw
  // nothing at all is exactly what it is here to prevent, and a walk whose reading stops
  // finding edges looks the same as a module with no edges.
  expect(
    importsOf(entry).map((edge) => edge.specifier),
    "the value import this pin walks",
  ).toContain("../overlayCoords");
  const reached = new Set([entry]);
  // A Set visits entries added while it is iterated, so this walks the whole value closure.
  for (const path of reached) {
    for (const { specifier, typeOnly } of importsOf(path)) {
      if (typeOnly) {
        continue;
      }
      const next = modulePath(path, specifier);
      // A bare specifier is a package (`swr`, `react`, …) whose imports this pin cannot
      // inspect; none exists today, and adding one is exactly the edit this catches.
      if (next === null) {
        throw new Error(`${path} value-imports ${specifier}`);
      }
      reached.add(next);
    }
  }
  // Every module a value edge reaches is itself import-free, so none of them can fetch.
  for (const path of reached) {
    if (path !== entry) {
      expect(importsOf(path), path).toHaveLength(0);
    }
  }
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
