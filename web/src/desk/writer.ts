import { useCallback, useRef } from "react";
import type { KeyedMutator } from "swr";
import {
  classSpanPath,
  phaseSpanPath,
  sendJson,
  tripletSpanPath,
  withVersion,
  type ClassDoc,
  type PhaseDoc,
  type TripletDoc,
} from "../api";
import type { BrushIdentity, EditorKind } from "../deskStore";
import { isVersionConflict } from "../api";
import type { DeskNotice } from "./notice";

/** The Frame range a Mark from would cover: from the marked Frame to this one. */
export function rangeEnds(fromIndex: number | null, currentIndex: number): { from: number; to: number } {
  const start = fromIndex == null ? currentIndex : fromIndex;
  return { from: Math.min(start, currentIndex), to: Math.max(start, currentIndex) };
}

/** One selected Timeline bar: a Lane identity plus the Frame range it covers. */
export type LaneBar = { laneKey: string; start: number; end: number };

export function sameLaneBar(a: LaneBar, b: LaneBar): boolean {
  return a.laneKey === b.laneKey && a.start === b.start && a.end === b.end;
}

export function identityFromLaneKey(kind: EditorKind, key: string): BrushIdentity | null {
  if (kind === "class") {
    return { kind: "class", name: key };
  }
  if (kind === "phase") {
    return { kind: "phase", name: key };
  }
  const parts = key.split(" / ");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    return null;
  }
  return { kind: "triplet", instrument: parts[0], verb: parts[1], target: parts[2] };
}

async function postIdentitySpan(
  clipId: string,
  identity: BrushIdentity,
  from: number,
  to: number,
  remove: boolean,
  version: number | undefined,
): Promise<PhaseDoc | ClassDoc | TripletDoc> {
  if (identity.kind === "phase") {
    return sendJson<PhaseDoc>(
      phaseSpanPath(clipId),
      "POST",
      withVersion({ phase: remove ? null : identity.name, from, to }, version),
    );
  }
  if (identity.kind === "class") {
    return sendJson<ClassDoc>(
      classSpanPath(clipId),
      "POST",
      withVersion({ tag: identity.name, from, to, on: !remove }, version),
    );
  }
  return sendJson<TripletDoc>(
    tripletSpanPath(clipId),
    "POST",
    withVersion(
      {
        instrument: identity.instrument,
        verb: identity.verb,
        target: identity.target,
        from,
        to,
        op: remove ? "remove" : "add",
      },
      version,
    ),
  );
}

export type IdentityWriter = {
  /** POST the identity's span; refreshes the held labels on a stale version. */
  commitIdentityRange: (identity: BrushIdentity, from: number, to: number, remove: boolean) => Promise<void>;
  /** Commit one Lane span under the desk-wide write mutex; false when busy or refused. */
  writeLaneSpan: (laneKey: string, from: number, to: number, remove: boolean) => Promise<boolean>;
  /** Run a multi-span write under the same mutex; false when another write holds it. */
  runExclusive: (work: () => Promise<void>) => Promise<boolean>;
};

/**
 * The desk's one label-write path for span edits: the Brush bar and the Timeline
 * gestures share it, so two span writes can never interleave.
 */
export function useIdentityWriter({
  clipId,
  focus,
  phaseVersion,
  classVersion,
  tripletVersion,
  mutatePhase,
  mutateClass,
  mutateTriplet,
  notify,
}: {
  clipId: string | undefined;
  focus: EditorKind;
  phaseVersion: number | undefined;
  classVersion: number | undefined;
  tripletVersion: number | undefined;
  mutatePhase: KeyedMutator<PhaseDoc>;
  mutateClass: KeyedMutator<ClassDoc>;
  mutateTriplet: KeyedMutator<TripletDoc>;
  notify: (notice: DeskNotice) => void;
}): IdentityWriter {
  const spanBusy = useRef(false);

  const commitIdentityRange = useCallback(
    async (identity: BrushIdentity, from: number, to: number, remove: boolean) => {
      if (!clipId) {
        return;
      }
      const version =
        identity.kind === "phase"
          ? phaseVersion
          : identity.kind === "class"
            ? classVersion
            : tripletVersion;
      try {
        const doc = await postIdentitySpan(clipId, identity, from, to, remove, version);
        if (identity.kind === "phase") {
          await mutatePhase(doc as PhaseDoc, { revalidate: false });
        } else if (identity.kind === "class") {
          await mutateClass(doc as ClassDoc, { revalidate: false });
        } else {
          await mutateTriplet(doc as TripletDoc, { revalidate: false });
        }
      } catch (err) {
        if (isVersionConflict(err)) {
          // Stale Clip version: refetch the held labels before the user retries.
          await Promise.all([mutatePhase(), mutateClass(), mutateTriplet()]);
        }
        throw err;
      }
    },
    [classVersion, clipId, mutateClass, mutatePhase, mutateTriplet, phaseVersion, tripletVersion],
  );

  const runExclusive = useCallback(async (work: () => Promise<void>) => {
    if (spanBusy.current) {
      return false;
    }
    spanBusy.current = true;
    try {
      await work();
      return true;
    } finally {
      spanBusy.current = false;
    }
  }, []);

  const writeLaneSpan = useCallback(
    async (laneKey: string, from: number, to: number, remove: boolean) => {
      const identity = identityFromLaneKey(focus, laneKey);
      if (!clipId || !identity) {
        return false;
      }
      let ok = true;
      const ran = await runExclusive(async () => {
        notify(null);
        try {
          await commitIdentityRange(identity, from, to, remove);
        } catch (err) {
          notify({ text: err instanceof Error ? err.message : "Write failed", error: true });
          ok = false;
        }
      });
      return ran && ok;
    },
    [clipId, commitIdentityRange, focus, notify, runExclusive],
  );

  return { commitIdentityRange, writeLaneSpan, runExclusive };
}
