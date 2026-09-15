import useSWR from "swr";
import { getJson, mePath, type Me, type MyItem } from "../api";

/**
 * What the open Clip's mask item allows, and which controls follow it.
 *
 * The server refuses every mask write on the item's Assignment
 * (`mask/http.py` → `require_label_assignee`, whose cell is `capabilities.edit_labels`),
 * and `/api/me` hands the desk that same cell for the mask item: the permission, and
 * `write_refusal` — the sentence a refused write would carry. The desk has no second
 * opinion, so a control it disables and a call the server refuses cannot disagree (ADR
 * 0030). There is no Save control to gate: the Annotation is written on each successful
 * edit (ADR 0025).
 *
 * The permission has three states, not two. `unknown` is a `/api/me` that has not
 * answered — no Clip open, the read in flight, or a (Clip, task type) pair the server
 * answers 404 for — and it is not the fact "unwritable": the canvas holds the first
 * prompt until the read lands rather than dropping it, and the panel words no refusal
 * the server never sent.
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

/** A write in flight: a Propagate Job owns the Clip until it finishes, and a Predict
 * owns the Session call it is in, so the other controls wait on the server. */
export type MaskBusy = { job: boolean; predicting: boolean };

/** The item's write permission, as far as the desk knows it, and its wording.
 *
 * Three states, because an answer the desk has not heard is not a refusal: `unknown` is
 * `/api/me` still in flight (or never asked), `writable` and `refused` are an answered
 * cell. `writable` is the one boolean every write guard asks for, and it is false for
 * `unknown` as well as `refused` — no guard has to learn the difference, and no write
 * starts on a cell the server has not answered. The state itself is what the canvas
 * reads, and what tells it a held prompt from a refused one. */
export type MaskWrite =
  | { state: "unknown"; writable: false; refusal: null }
  | { state: "writable"; writable: true; refusal: null }
  | { state: "refused"; writable: false; refusal: string | null };

/** What the picture canvas does with a pointer right now. `checking` is the `/api/me`
 * read still in flight: the canvas takes the prompt and holds it for the answer, which
 * is how the first drag on a freshly opened Clip survives. `busy` is a Propagate Job
 * owning the Clip (story 86). */
export type MaskPointerGate = "open" | "checking" | "busy" | "refused";

export type MaskControlStates = Record<MaskControl, boolean>;

/** The item's cell as a permission: the server's `edit_labels` answers it, and an item
 * the read has not produced at all leaves it unknown. */
export function maskWriteOf(item: MyItem | undefined): MaskWrite {
  if (item === undefined) {
    // No Clip open, the fetch in flight, or a pair `/api/me` answers 404 for: the desk
    // invents no refusal for an answer it has not heard, and writes nothing.
    return { state: "unknown", writable: false, refusal: null };
  }
  if (item.capabilities?.edit_labels === true) {
    // A writable item has nothing to explain.
    return { state: "writable", writable: true, refusal: null };
  }
  // An answered no: a refusal is the server's wording, not ours, and a payload that
  // carries none leaves the desk with no sentence rather than an invented one.
  return { state: "refused", writable: false, refusal: item.write_refusal ?? null };
}

/**
 * Which mask controls are usable right now.
 *
 * A prompt while a Predict runs is queued rather than dropped (`PREDICT_DEBOUNCE_MS`
 * collects the clicks), so prompts stay live under `predicting` and go off only while a
 * Propagate Job owns the Clip — which is exactly when the server would refuse the edit.
 * An unknown permission is not a refusal, but it is not a licence either: no write
 * starts before `/api/me` answers, so the write controls read off until it does, and the
 * canvas holds the prompt drawn in the meantime. Looking is not writing and never waits
 * on the answer, so the view half comes from `MASK_VIEW_CONTROLS` itself.
 */
export function maskControlStates(write: MaskWrite, busy: MaskBusy): MaskControlStates {
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
    undo: ready,
    clear: ready,
    propagate: ready,
    renameTrack: ready,
    deleteTrack: ready,
    ...view,
  };
}

/** What the canvas does with a pointer: a Propagate Job owns the Clip, an unanswered
 * read checks, a refused write refuses, and everything else is open — including under a
 * Predict, whose prompts are queued by the debounce. `open` is exactly where
 * `maskControlStates(...).prompts` is live; the other three are the reasons it is not. */
export function maskPointerGate(write: MaskWrite, busy: MaskBusy): MaskPointerGate {
  if (busy.job) {
    return "busy";
  }
  if (write.state === "unknown") {
    return "checking";
  }
  if (write.state === "refused") {
    return "refused";
  }
  return "open";
}

/** The open Clip's mask item cell: the same read the editor renders from and the server
 * refuses on. */
export function useMaskWrite(clipId: string | undefined): MaskWrite {
  const { data } = useSWR(clipId ? mePath(clipId, "mask") : null, getJson<Me>);
  return maskWriteOf(data?.item);
}
