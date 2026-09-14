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

/** The mask controls that only look. They are in the mapping so the editor's surface is
 * stated whole, and a reader can see which controls ownership does not move. */
export const MASK_VIEW_CONTROLS = ["selectTrack", "laneVisibility"] as const;

export type MaskWriteControl = (typeof MASK_WRITE_CONTROLS)[number];
export type MaskViewControl = (typeof MASK_VIEW_CONTROLS)[number];
export type MaskControl = MaskWriteControl | MaskViewControl;

/** A write in flight: a Propagate Job owns the Clip until it finishes, and a Predict
 * owns the Session call it is in, so the other controls wait on the server. */
export type MaskBusy = { job: boolean; predicting: boolean };

/** The item's write permission and its wording, straight off the `/api/me` cell. */
export type MaskWrite = {
  writable: boolean;
  /** The server's sentence for a refused write, or null when this Account may write. */
  refusal: string | null;
};

export type MaskControlStates = Record<MaskControl, boolean>;

/** The item's cell as a permission: the server's `edit_labels` is the only key. */
export function maskWriteOf(item: MyItem | undefined): MaskWrite {
  const writable = item?.capabilities?.edit_labels === true;
  // A writable item has nothing to explain. An item the read has not answered yet — no
  // Clip open, the fetch in flight, or a pair `/api/me` answers 404 for — carries no
  // sentence, and the desk invents none: a refusal is the server's wording, not ours.
  return { writable, refusal: writable ? null : (item?.write_refusal ?? null) };
}

/**
 * Which mask controls are usable right now.
 *
 * A prompt while a Predict runs is queued rather than dropped (`PREDICT_DEBOUNCE_MS`
 * collects the clicks), so prompts stay live under `predicting` and go off only while a
 * Propagate Job owns the Clip — which is exactly when the server would refuse the edit.
 */
export function maskControlStates(write: MaskWrite, busy: MaskBusy): MaskControlStates {
  const readyForPrompts = write.writable && !busy.job;
  const ready = readyForPrompts && !busy.predicting;
  return {
    prompts: readyForPrompts,
    newTrack: ready,
    predict: ready,
    undo: ready,
    clear: ready,
    propagate: ready,
    renameTrack: ready,
    deleteTrack: ready,
    selectTrack: true,
    laneVisibility: true,
  };
}

/** The open Clip's mask item cell: the same read the editor renders from and the server
 * refuses on. */
export function useMaskWrite(clipId: string | undefined): MaskWrite {
  const { data } = useSWR(clipId ? mePath(clipId, "mask") : null, getJson<Me>);
  return maskWriteOf(data?.item);
}
