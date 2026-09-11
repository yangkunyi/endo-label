import type { KeyedMutator } from "swr";
import { sendJson, vocabListPath, type ScopedVocab, type VocabPickerItem } from "../api";
import type { EditorKind } from "../deskStore";

/** What the desk may offer for the focused Clip's Project word list. */
export type VocabControls = {
  canRegistryWrite: boolean;
  canEditVocab: boolean;
  canCreateCandidate: boolean;
  projectId: number | null;
  items: VocabPickerItem[];
};

/** The desk's word-list capabilities for the focused Clip's Project. */
export function vocabControlsOf(vocab: ScopedVocab | undefined): VocabControls {
  return {
    canRegistryWrite: vocab?.permissions?.registry_write ?? false,
    canEditVocab: vocab?.permissions?.vocab_edit ?? false,
    canCreateCandidate: vocab?.permissions?.candidate_create ?? false,
    projectId: vocab?.project_id ?? null,
    items: vocab?.items ?? [],
  };
}

/** The visible registry item behind an already-labeled name, if the Project enables it. */
export function pickerItemFor(
  items: VocabPickerItem[],
  kind: EditorKind,
  target: { name?: string; instrument?: string; verb?: string; target?: string },
): VocabPickerItem | undefined {
  return items.find((row) => {
    if (row.candidate || row.kind !== kind) {
      return false;
    }
    if (kind === "triplet") {
      return (
        row.instrument === target.instrument &&
        row.verb === target.verb &&
        row.target === target.target
      );
    }
    return row.name === target.name;
  });
}

export async function ensureVocabName(
  listName: string,
  raw: string,
  names: string[],
  mutateVocab: KeyedMutator<ScopedVocab>,
): Promise<string | null> {
  const name = raw.trim();
  if (!name) {
    return null;
  }
  if (names.includes(name)) {
    return name;
  }
  await sendJson<unknown>(vocabListPath(listName), "POST", { name });
  // The registry write answers the legacy desk-wide set; the desk shows the
  // Clip's Project set, so revalidate the scoped key instead of injecting it.
  await mutateVocab();
  return name;
}
