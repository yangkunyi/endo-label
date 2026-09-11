import { useEffect, useRef, useState } from "react";
import { Brush, Check, Eye, EyeOff, Trash2 } from "lucide-react";
import type { KeyedMutator } from "swr";
import {
  sendJson,
  vocabCandidatePath,
  vocabDeletePath,
  vocabListPath,
  vocabRenamePath,
  type ScopedVocab,
  type Vocab,
  type VocabPickerItem,
} from "../api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useDeskStore } from "../deskStore";
import type { BrushIdentity, EditorKind } from "../deskStore";
import { libraryRowSemanticStyle } from "../editorCards";
import { cn } from "../lib/utils";
import { labelColor } from "../timeline";

/** What the desk may offer for the focused Clip's Project word list. */
export type VocabControls = {
  canRegistryWrite: boolean;
  canEditVocab: boolean;
  canCreateCandidate: boolean;
  projectId: number | null;
  items: VocabPickerItem[];
};

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

export function LibraryList({
  names,
  isOnThisFrame,
  inBrush,
  onPick,
  onToggleBrush,
  brushIdentity,
  laneVisible,
  onToggleLane,
  disabled,
  listName,
  renameLabel,
  deleteLabel,
  mutateVocab,
  onAfterChange,
  controls,
  onRetract,
  label = "Library",
  colorNames = true,
}: {
  names: string[];
  isOnThisFrame: (name: string) => boolean;
  inBrush: (name: string) => boolean;
  onPick: (name: string) => void;
  onToggleBrush: (name: string) => void;
  brushIdentity: (name: string) => BrushIdentity;
  laneVisible: (name: string) => boolean;
  onToggleLane: (name: string) => void;
  disabled: boolean;
  listName: string;
  renameLabel: string;
  deleteLabel: (name: string) => string;
  mutateVocab: KeyedMutator<ScopedVocab>;
  onAfterChange?: () => Promise<void>;
  controls: VocabControls;
  onRetract?: (name: string) => void;
  label?: string;
  colorNames?: boolean;
}) {
  const clickTimer = useRef<number | null>(null);
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trashBrush = useDeskStore((s) => s.trashBrush);

  useEffect(() => () => {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
    }
  }, []);

  async function run(op: () => Promise<void>) {
    setError(null);
    try {
      await op();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  function schedulePick(name: string) {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
    }
    // ponytail: 300ms click delay so dblclick can rename; drop if rename gets its own control
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      if (!disabled) {
        onPick(name);
      }
    }, 300);
  }

  function startRename(name: string) {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setRenameFrom(name);
    setRenameDraft(name);
  }

  return (
    <>
      <ul aria-label={label} className="space-y-1">
        {names.map((name) => {
          const on = isOnThisFrame(name);
          return (
            <li key={name} className="group flex items-center gap-1">
              {renameFrom === name ? (
                <Input
                  aria-label={renameLabel}
                  value={renameDraft}
                  autoFocus
                  className="h-7 text-xs"
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onBlur={() => setRenameFrom(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const from = renameFrom;
                      const to = renameDraft.trim();
                      setRenameFrom(null);
                      if (!from || to === from) {
                        return;
                      }
                      void run(async () => {
                        const next = await sendJson<Vocab>(vocabRenamePath(listName), "POST", { from, to });
                        await mutateVocab(next, { revalidate: false });
                        await onAfterChange?.();
                      });
                    }
                    if (event.key === "Escape") {
                      setRenameFrom(null);
                    }
                  }}
                />
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "min-w-0 flex-1 justify-start border transition-colors",
                    on
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                  style={libraryRowSemanticStyle(labelColor(name), on)}
                  aria-pressed={on}
                  data-label-color={colorNames ? labelColor(name) : undefined}
                  onClick={() => schedulePick(name)}
                  onDoubleClick={() => {
                    if (controls.canRegistryWrite) {
                      startRename(name);
                    }
                  }}
                >
                  {colorNames ? (
                    <span
                      aria-hidden
                      className={cn(
                        "mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm transition-transform",
                        on && "ring-1 ring-white/60",
                      )}
                      style={{ backgroundColor: labelColor(name) }}
                    />
                  ) : null}
                  <span className="truncate">{name}</span>
                  {on ? (
                    <Check
                      aria-hidden="true"
                      data-checkmark=""
                      size={14}
                      className="ml-auto mr-1 shrink-0 text-primary"
                    />
                  ) : null}
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={laneVisible(name) ? "Hide lane" : "Show lane"}
                className={laneVisible(name) ? "text-foreground" : "text-muted-foreground"}
                onClick={() => onToggleLane(name)}
              >
                {laneVisible(name) ? <Eye size={14} /> : <EyeOff size={14} />}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Brush"
                aria-pressed={inBrush(name)}
                className={inBrush(name) ? "text-foreground" : "text-muted-foreground"}
                onClick={() => onToggleBrush(name)}
              >
                <Brush size={14} />
              </Button>
              {controls.canRegistryWrite ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={deleteLabel(name)}
                  className="opacity-30 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    if (!window.confirm(`${deleteLabel(name)} from every Clip?`)) {
                      return;
                    }
                    void run(async () => {
                      await trashBrush(
                        brushIdentity(name),
                        sendJson<unknown>(vocabDeletePath(listName, name), "DELETE"),
                      );
                      await mutateVocab();
                      await onAfterChange?.();
                    });
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              ) : controls.canEditVocab &&
                onRetract &&
                controls.items.some(
                  (row) =>
                    !row.candidate &&
                    row.kind === (listName === "phases" ? "phase" : "class") &&
                    row.name === name,
                ) ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${name} from this Project`}
                  title="Remove from this Project"
                  className="opacity-30 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void run(async () => {
                    await onRetract(name);
                    await onAfterChange?.();
                  })}
                >
                  <Trash2 size={14} />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </>
  );
}

export function AddVocabRow({
  listName,
  kind,
  clipId,
  names,
  mutateVocab,
  ariaLabel,
  controls,
}: {
  listName: string;
  kind: EditorKind;
  clipId: string;
  names: string[];
  mutateVocab: KeyedMutator<ScopedVocab>;
  ariaLabel: string;
  controls: VocabControls;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addOnly() {
    const raw = draft.trim();
    if (!raw) {
      return;
    }
    setError(null);
    try {
      if (controls.canRegistryWrite) {
        await ensureVocabName(listName, raw, names, mutateVocab);
      } else if (controls.canCreateCandidate) {
        if (!names.includes(raw)) {
          await sendJson(vocabCandidatePath(), "POST", { clip_id: clipId, kind, name: raw });
          await mutateVocab();
        }
      } else {
        return;
      }
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  if (!controls.canRegistryWrite && !controls.canCreateCandidate) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-border/50 pt-2">
      <div className="flex items-center gap-1">
        <Input
          aria-label={ariaLabel}
          placeholder="Type to add"
          value={draft}
          className="h-7 text-xs"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addOnly();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-xs"
          aria-label={ariaLabel}
          onClick={() => void addOnly()}
        >
          +
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
