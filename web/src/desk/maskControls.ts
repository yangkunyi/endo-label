import { useMemo } from "react";
import useSWR from "swr";
import { getJson, mePath, type Me, type MyItem } from "../api";
import { mayUndo } from "./keyboard";

/**
 * What the open Clip's item allows, and which controls follow it.
 *
 * One cell per (Clip, Task type) pair: the server refuses every label write on the
 * item's Assignment (`require_label_assignee`, whose cell is `capabilities.edit_labels`),
 * and `/api/me?clip_id=…&task_type=…` hands the desk that same cell — the permission,
 * and `write_refusal`, the sentence a refused write would carry. The desk has no second
 * opinion, so a control it disables and a call the server refuses cannot disagree (ADR
 * 0030). There is no Save control to gate: the Annotation is written on each successful
 * edit (ADR 0025).
 *
 * Two surfaces read it, which is why the cell is named for the item and not for either:
 * the mask panel (`useMaskWrite`) and the editor rail's Task type editors
 * (`useItemWrite`), each showing the sentence in its own words. There is one mask Task
 * type and three label ones, and they share this shape because they share the server's.
 *
 * The permission has four states, not two. `unknown` is a `/api/me` that has not
 * answered *yet* — no Clip open, or the read in flight — and it is not the fact
 * "unwritable": the canvas holds the first prompt until the read lands rather than
 * dropping it, and the panel words no refusal the server never sent. `unreadable` is a
 * read that ended without an answer — `/api/me`'s 404 for a (Clip, task type) pair with
 * no item, or a request that failed outright — and it is not `unknown`: nothing is held
 * for an answer that has not landed, and the panel says so in its own words. It is not
 * final — SWR retries a 404 indefinitely, so an answer may still land and turn the state
 * writable or refused; a failure only means the desk stops holding in the meantime.
 */

/** The mask controls whose usability is the item's write permission. */
export const MASK_WRITE_CONTROLS = [
  "prompts",
  "newTrack",
  "predict",
  "undo",
  "clear",
  "propagate",
  "renameTrack",
  "deleteTrack",
] as const;

/** The mask controls that only look. They are the mapping's view half, and
 * `maskControlStates` reads its states off this list rather than a second hardcoded
 * copy, so a control added here cannot end up without one. */
export const MASK_VIEW_CONTROLS = ["selectTrack", "laneVisibility"] as const;

export type MaskWriteControl = (typeof MASK_WRITE_CONTROLS)[number];
export type MaskViewControl = (typeof MASK_VIEW_CONTROLS)[number];
export type MaskControl = MaskWriteControl | MaskViewControl;

export type MaskControlStates = Record<MaskControl, boolean>;

/** A write in flight: a Propagate Job owns the Clip until it finishes, and a Predict
 * owns the Session call it is in, so the other controls wait on the server. */
export type MaskBusy = { job: boolean; predicting: boolean };

/**
 * The `/api/me` read the permission is built from, as SWR hands it over.
 *
 * `isLoading` and `error` are what tell a read still in flight from one that ended
 * without an answer; the desk destructured only `data` before this, so a 404 or a
 * failed fetch read as "in flight" for the rest of the session. `asked` is false when
 * no Clip is open and no read was made at all — a desk with no Clip has not failed to
 * read anything.
 */
export type ItemRead = {
  asked: boolean;
  isLoading: boolean;
  error: unknown;
};

/** The item's write permission, as far as the desk knows it, and its wording.
 *
 * Four states, because an answer the desk has not heard is not a refusal, and a read
 * that never answers is not a read in flight:
 *
 * - `unknown` — `/api/me` still out, or never asked. No write starts, no sentence is
 *   claimed, and the canvas holds a prompt drawn under it for the answer.
 * - `writable` / `refused` — an answered cell. `writable` is the one boolean every
 *   write guard asks for; `refused` is false and carries the server's own sentence
 *   (`null` when the payload carried none). Neither state invents the other.
 * - `unreadable` — a read that ended without an answer. No write, no held prompt, and
 *   no refusal claimed: the server sent no sentence, so the surface says the desk could
 *   not read the permission (`MASK_READ_FAILED` for the panel, `LABEL_READ_FAILED` for
 *   the editors).
 *
 * `writable` is false for `unknown`, `refused` and `unreadable` alike, so no guard has
 * to learn the difference, and no write starts on a cell the server has not answered.
 */
export type ItemWrite =
  | { state: "unknown"; writable: false; refusal: null }
  | { state: "writable"; writable: true; refusal: null }
  | { state: "refused"; writable: false; refusal: string | null }
  | { state: "unreadable"; writable: false; refusal: null };

/** What the desk says when `/api/me` never answered — a 404 for an item that does not
 * exist, or a request that failed. It is the desk's own line, not a refusal: the server
 * sent no sentence, so the panel must not show one it might have sent. */
export const MASK_READ_FAILED =
  "Could not read this Clip's mask permission — mask writes are off until it loads.";

/** The editor rail's line for the same fact about a label item. Same office as
 * `MASK_READ_FAILED`: the desk's own sentence, never one the server might have sent. */
export const LABEL_READ_FAILED =
  "Could not read this Clip's label permission — label writes are off until it loads.";

/** A read the desk never made: no Clip open, nothing in flight, nothing failed. */
const NOT_ASKED: ItemRead = { asked: false, isLoading: false, error: null };

/**
 * The item's cell as a permission, from the item and the `/api/me` read that produced
 * it. An item the read produced answers `edit_labels`; a read that ended with no item
 * and no error is `unreadable` when it was asked (the server's 404) and `unknown` when
 * it never was (no Clip open).
 */
export function itemWriteOf(item: MyItem | undefined, read: ItemRead = NOT_ASKED): ItemWrite {
  if (item !== undefined) {
    if (item.capabilities?.edit_labels === true) {
      // A writable item has nothing to explain.
      return { state: "writable", writable: true, refusal: null };
    }
    // An answered no: a refusal is the server's wording, not ours, and a payload that
    // carries none leaves the desk with no sentence rather than an invented one.
    return { state: "refused", writable: false, refusal: item.write_refusal ?? null };
  }
  if (read.error != null) {
    // The read landed without an answer — the server's 404, or the request failed.
    // Once it has failed the state stays unreadable until an answer lands, so a SWR
    // retry in flight does not put the desk back to holding for one; that ordering is
    // why this arm is checked before `isLoading`.
    //
    // It does not consult `asked`, and does not need to: `useMaskWrite` keys SWR on the
    // Clip, so a read it never made — `asked` false, no Clip open — cannot carry an
    // error. The arm is not a second way into `unreadable` for an unasked read; it is
    // the failure that decides whatever `asked` says.
    return { state: "unreadable", writable: false, refusal: null };
  }
  if (read.isLoading) {
    // Still out: the desk invents no refusal for an answer it has not heard, holds a
    // prompt for it, and writes nothing.
    return { state: "unknown", writable: false, refusal: null };
  }
  // Settled with nothing and no error: the read was asked and the server answered 404
  // (the pair has no item), or it was never asked because no Clip is open.
  return read.asked
    ? { state: "unreadable", writable: false, refusal: null }
    : { state: "unknown", writable: false, refusal: null };
}

/**
 * Which mask controls are usable right now.
 *
 * A prompt while a Predict runs is queued rather than dropped (`PREDICT_DEBOUNCE_MS`
 * collects the clicks), so prompts stay live under `predicting` and go off only while a
 * Propagate Job owns the Clip — which is exactly when the server would refuse the edit.
 * An unknown permission is not a refusal, but it is not a licence either: no write
 * starts before `/api/me` answers, so the write controls read off until it does, and the
 * canvas holds the prompt drawn in the meantime. A read that never answered leaves them
 * off for the same reason and holds nothing. Looking is not writing and never waits
 * on the answer, so the view half comes from `MASK_VIEW_CONTROLS` itself.
 */
export function maskControlStates(write: ItemWrite, busy: MaskBusy): MaskControlStates {
  const readyForPrompts = write.writable && !busy.job;
  const ready = readyForPrompts && !busy.predicting;
  const view = {} as Record<MaskViewControl, boolean>;
  for (const control of MASK_VIEW_CONTROLS) {
    view[control] = true;
  }
  return {
    prompts: readyForPrompts,
    newTrack: ready,
    predict: ready,
    undo: mayUndo(write.writable, busy),
    clear: ready,
    propagate: ready,
    renameTrack: ready,
    deleteTrack: ready,
    ...view,
  };
}

/** What the picture canvas does with a pointer right now. `checking` is the `/api/me`
 * read still in flight: the canvas takes the prompt and holds it for the answer, which
 * is how the first drag on a freshly opened Clip survives. `unreadable` is a read that
 * ended without an answer — the same input-off as `refused`, for a different reason.
 * `busy` is a Propagate Job owning the Clip (story 86). */
export type MaskPointerGate = "open" | "checking" | "busy" | "refused" | "unreadable";

/** Whether the canvas takes a pointer for this gate: open for an answered writable item
 * or a held read, shut for a Job, a refusal, or a read that never answered. It is the
 * one place the pointer handlers ask, so an in-flight drag learns the same answer a new
 * press would. */
export function acceptsPointerInk(gate: MaskPointerGate): boolean {
  return gate === "open" || gate === "checking";
}

/** What the canvas does with a pointer: a Propagate Job owns the Clip, an unanswered
 * read checks, a refused write refuses, a read that never answered is unreadable, and
 * everything else is open — including under a Predict, whose prompts are queued by the
 * debounce. `open` is exactly where `maskControlStates(...).prompts` is live; the other
 * four are the reasons it is not. */
export function maskPointerGate(write: ItemWrite, busy: MaskBusy): MaskPointerGate {
  if (busy.job) {
    return "busy";
  }
  if (write.state === "unknown") {
    return "checking";
  }
  if (write.state === "refused") {
    return "refused";
  }
  if (write.state === "unreadable") {
    return "unreadable";
  }
  return "open";
}

/** What a permission answer does to a prompt the canvas held for it. */
export type HeldPromptAnswer = "send" | "drop" | "hold";

/**
 * ADR 0030's middle: the answer that lands writable is what sends the held prompt
 * (`"send"`). An answer that lands unwritable — the server's refusal, or a read that
 * never answered — takes the prompt with it beside the panel's sentence (`"drop"`); a
 * read still in flight holds it (`"hold"`). The effects that run this are wiring a node
 * test cannot reach; this function is the decision they are built from.
 */
export function heldPromptOnAnswer(write: ItemWrite): HeldPromptAnswer {
  if (write.writable) {
    return "send";
  }
  if (write.state === "unknown") {
    return "hold";
  }
  return "drop";
}

/** The desk's own sentence for a read that never answered — in the words of the surface
 * that shows it — or null when there is no such failure. Each surface shows it where a
 * refusal's sentence would go: both answer "why are these controls off", and only one of
 * them is the server's. */
export function writeReadFailure(write: ItemWrite, whenUnreadable: string): string | null {
  return write.state === "unreadable" ? whenUnreadable : null;
}

/** The mask panel's wording of `writeReadFailure`. */
export function maskReadFailure(write: ItemWrite): string | null {
  return writeReadFailure(write, MASK_READ_FAILED);
}

/** The open Clip's item cell for one Task type: the same read the surface renders from
 * and the server refuses on. SWR's `isLoading`/`error` choose the state — a read still
 * out is `unknown`, a read that ended without an item (the 404, or a failed request) is
 * `unreadable` — so neither is dropped into `unknown` for good.
 *
 * The result is memoized on the read's own values: the state is a plain object, and the
 * chord's listener and the held-prompt effect depend on it, so a re-render with the same
 * answer must not hand them a new identity. */
export function useItemWrite(clipId: string | undefined, taskType: string): ItemWrite {
  const { data, error, isLoading } = useSWR(
    clipId ? mePath(clipId, taskType) : null,
    getJson<Me>,
  );
  const asked = clipId !== undefined;
  const item = data?.item;
  return useMemo(
    () => itemWriteOf(item, { asked, isLoading, error }),
    [asked, error, isLoading, item],
  );
}

/** The mask panel's cell: the Task type with a canvas of its own. */
export function useMaskWrite(clipId: string | undefined): ItemWrite {
  return useItemWrite(clipId, "mask");
}
