import { useEffect, useRef, useState } from "react";
import { Brush, Check, Eye, EyeOff, Trash2 } from "lucide-react";
import type { KeyedMutator } from "swr";
import {
  classFramePath,
  frameClassTags,
  framePhaseName,
  frameTripletRows,
  isVersionConflict,
  phaseFramePath,
  registryDisablePath,
  saveErrorMessage,
  sendJson,
  toggleClassTag,
  tripletFramePath,
  vocabCandidatePath,
  vocabTripleDeletePath,
  vocabTripleRenamePath,
  vocabTriplesPath,
  withVersion,
  type ClassDoc,
  type PhaseDoc,
  type ScopedVocab,
  type TripletDoc,
  type TripletRow,
  type VocabTriple,
} from "../api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useDeskStore, type EditorKind } from "../deskStore";
import { libraryRowSemanticStyle, nowEmptyText, nowFillStyle } from "../editorCards";
import { cn } from "../lib/utils";
import { labelColor } from "../timeline";
import { AddVocabRow, LibraryList, pickerItemFor, type VocabControls } from "./VocabLibrary";
import { tripleIdentity } from "./lanes";

export function EditorCard({
  card,
  count,
  children,
}
: {
  card: "now" | "library";
  count: number;
  children: React.ReactNode;
}) {
  const title = card === "now" ? "Now" : "Library";
  return (
    <section
      data-card={card}
      className="flex flex-col gap-2 rounded-lg border border-border/70 bg-surface/40 p-3"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

export function ClassEditor({
  clipId,
  frameIndex,
  frameCount,
  classFrames,
  classTags,
  version,
  mutateClass,
  mutateVocab,
  laneVisible,
  onToggleLane,
  controls,
}
: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  classFrames: Record<string, string[]>;
  classTags: string[];
  version: number | undefined;
  mutateClass: KeyedMutator<ClassDoc>;
  mutateVocab: KeyedMutator<ScopedVocab>;
  laneVisible: (name: string) => boolean;
  onToggleLane: (name: string) => void;
  controls: VocabControls;
}) {
  const [error, setError] = useState<string | null>(null);
  const current = frameClassTags(classFrames, frameIndex);
  const brush = useDeskStore((s) => s.brush);
  const toggleBrush = useDeskStore((s) => s.toggleBrush);

  async function writeTags(tags: string[]) {
    setError(null);
    try {
      const doc = await sendJson<ClassDoc>(
        classFramePath(clipId, frameIndex),
        "PUT",
        withVersion({ tags }, version),
      );
      await mutateClass(doc, { revalidate: false });
    } catch (err) {
      if (isVersionConflict(err)) {
        // Stale Clip version: refetch before the retry.
        await mutateClass();
      }
      setError(saveErrorMessage(err));
    }
  }

  async function retractClass(name: string) {
    const item = pickerItemFor(controls.items, "class", { name });
    if (!item || controls.projectId === null) {
      return;
    }
    await sendJson(registryDisablePath(item.id), "POST", { project_id: controls.projectId });
    await mutateVocab();
    await mutateClass();
  }

  return (
    <section data-editor-card="class" className="flex flex-col gap-2">
      <EditorCard card="now" count={current.length}>
        <div data-now="" className="flex flex-wrap gap-1">
          {current.length === 0 ? (
            <p className="text-sm text-muted-foreground">{nowEmptyText("class", frameIndex)}</p>
          ) : null}
          {current.map((name) => (
            <span
              key={name}
              data-label-color={labelColor(name)}
              className="rounded-md px-2 py-1 text-sm font-medium"
              style={nowFillStyle(name)}
            >
              {name}
            </span>
          ))}
        </div>
      </EditorCard>
      <EditorCard card="library" count={classTags.length}>
        <LibraryList
          names={classTags}
          isOnThisFrame={(name) => current.includes(name)}
          inBrush={(name) => brush.class.includes(name)}
          brushIdentity={(name) => ({ kind: "class", name })}
          laneVisible={laneVisible}
          onToggleLane={onToggleLane}
          disabled={frameCount <= 0}
          listName="class_tags"
          renameLabel="Rename class tag"
          deleteLabel={(name) => `Delete class tag ${name}`}
          mutateVocab={mutateVocab}
          controls={controls}
          onRetract={(name) => retractClass(name)}
          onAfterChange={async () => {
            await mutateClass();
          }}
          onPick={(name) => {
            void writeTags(toggleClassTag(current, name));
          }}
          onToggleBrush={(name) => toggleBrush({ kind: "class", name })}
        />
        <AddVocabRow
          listName="class_tags"
          kind="class"
          clipId={clipId}
          names={classTags}
          mutateVocab={mutateVocab}
          ariaLabel="Add class name"
          controls={controls}
        />
      </EditorCard>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

export function PhaseEditor({
  clipId,
  frameIndex,
  frameCount,
  phaseFrames,
  phases,
  version,
  mutatePhase,
  mutateVocab,
  laneVisible,
  onToggleLane,
  controls,
}
: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  phaseFrames: Record<string, string>;
  phases: string[];
  version: number | undefined;
  mutatePhase: KeyedMutator<PhaseDoc>;
  mutateVocab: KeyedMutator<ScopedVocab>;
  laneVisible: (name: string) => boolean;
  onToggleLane: (name: string) => void;
  controls: VocabControls;
}) {
  const [error, setError] = useState<string | null>(null);
  const current = framePhaseName(phaseFrames, frameIndex);
  const brush = useDeskStore((s) => s.brush);
  const toggleBrush = useDeskStore((s) => s.toggleBrush);

  async function writePhase(phase: string | null) {
    setError(null);
    try {
      const doc = await sendJson<PhaseDoc>(
        phaseFramePath(clipId, frameIndex),
        "PUT",
        withVersion({ phase }, version),
      );
      await mutatePhase(doc, { revalidate: false });
    } catch (err) {
      if (isVersionConflict(err)) {
        // Stale Clip version: refetch before the retry.
        await mutatePhase();
      }
      setError(saveErrorMessage(err));
    }
  }

  async function retractPhase(name: string) {
    const item = pickerItemFor(controls.items, "phase", { name });
    if (!item || controls.projectId === null) {
      return;
    }
    await sendJson(registryDisablePath(item.id), "POST", { project_id: controls.projectId });
    await mutateVocab();
    await mutatePhase();
  }

  return (
    <section data-editor-card="phase" className="flex flex-col gap-2">
      <EditorCard card="now" count={current ? 1 : 0}>
        <p
          data-now=""
          data-label-color={current ? labelColor(current) : undefined}
          className={
            current
              ? "inline-flex items-center rounded-md px-2 py-1 text-sm font-medium"
              : "text-sm text-muted-foreground"
          }
          style={current ? nowFillStyle(current) : undefined}
        >
          {current ? (
            <>
              <span aria-hidden className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-white/70" />
              {current}
            </>
          ) : (
            nowEmptyText("phase", frameIndex)
          )}
        </p>
      </EditorCard>
      <EditorCard card="library" count={phases.length}>
        <LibraryList
          names={phases}
          isOnThisFrame={(name) => name === current}
          inBrush={(name) => brush.phase === name}
          brushIdentity={(name) => ({ kind: "phase", name })}
          laneVisible={laneVisible}
          onToggleLane={onToggleLane}
          disabled={frameCount <= 0}
          listName="phases"
          renameLabel="Rename phase"
          deleteLabel={(name) => `Delete phase ${name}`}
          mutateVocab={mutateVocab}
          controls={controls}
          onRetract={(name) => retractPhase(name)}
          onAfterChange={async () => {
            await mutatePhase();
          }}
          onPick={(name) => {
            void writePhase(name === current ? null : name);
          }}
          onToggleBrush={(name) => toggleBrush({ kind: "phase", name })}
        />
        <AddVocabRow
          listName="phases"
          kind="phase"
          clipId={clipId}
          names={phases}
          mutateVocab={mutateVocab}
          ariaLabel="Add phase name"
          controls={controls}
        />
      </EditorCard>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

export function uniqueTripleWords(triples: VocabTriple[], slot: keyof VocabTriple): string[] {
  return [...new Set(triples.map((row) => row[slot]).filter(Boolean))];
}


export function TripletEditor({
  clipId,
  frameIndex,
  frameCount,
  tripletFrames,
  triples,
  version,
  mutateTriplet,
  mutateVocab,
  laneVisible,
  onToggleLane,
  controls,
}
: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  tripletFrames: Record<string, TripletRow[]>;
  triples: VocabTriple[];
  version: number | undefined;
  mutateTriplet: KeyedMutator<TripletDoc>;
  mutateVocab: KeyedMutator<ScopedVocab>;
  laneVisible: (key: string) => boolean;
  onToggleLane: (key: string) => void;
  controls: VocabControls;
}) {
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ instrument: "", verb: "", target: "" });
  const [renameCell, setRenameCell] = useState<{
    row: VocabTriple;
    slot: "instrument" | "verb" | "target";
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const clickTimer = useRef<number | null>(null);
  const brush = useDeskStore((s) => s.brush);
  const toggleBrush = useDeskStore((s) => s.toggleBrush);
  const trashBrush = useDeskStore((s) => s.trashBrush);

  useEffect(() => () => {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
    }
  }, []);

  useEffect(() => {
    setDraft({ instrument: "", verb: "", target: "" });
    setRenameCell(null);
  }, [clipId]);
  const nowRows = frameTripletRows(tripletFrames, frameIndex);
  const onKeys = new Set(nowRows.map(tripleIdentity));
  const instrumentWords = uniqueTripleWords(triples, "instrument");
  const verbWords = uniqueTripleWords(triples, "verb");
  const targetWords = uniqueTripleWords(triples, "target");

  async function toggleRow(row: VocabTriple) {
    if (frameCount <= 0) {
      return;
    }
    setError(null);
    try {
      await sendJson<Record<string, unknown>>(
        tripletFramePath(clipId, frameIndex),
        "POST",
        withVersion(row, version),
      );
      await mutateTriplet();
    } catch (err) {
      if (isVersionConflict(err)) {
        // Stale Clip version: refetch before the retry.
        await mutateTriplet();
      }
      setError(saveErrorMessage(err));
    }
  }

  async function addRowOnly() {
    const instrument = draft.instrument.trim();
    const verb = draft.verb.trim();
    const target = draft.target.trim();
    if (!instrument || !verb || !target) {
      return;
    }
    setError(null);
    try {
      if (controls.canRegistryWrite) {
        await sendJson<unknown>(vocabTriplesPath(), "POST", { instrument, verb, target });
      } else if (controls.canCreateCandidate) {
        await sendJson<unknown>(vocabCandidatePath(), "POST", {
          clip_id: clipId,
          kind: "triplet",
          instrument,
          verb,
          target,
        });
      } else {
        return;
      }
      await mutateVocab();
      setDraft({ instrument: "", verb: "", target: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  async function trashRow(row: VocabTriple) {
    if (!window.confirm(`Delete triple ${tripleIdentity(row)} from every Clip?`)) {
      return;
    }
    setError(null);
    try {
      await trashBrush(
        { kind: "triplet", ...row },
        sendJson<unknown>(vocabTripleDeletePath(row.instrument, row.verb, row.target), "DELETE"),
      );
      await mutateVocab();
      await mutateTriplet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  async function retractRow(row: VocabTriple) {
    const item = pickerItemFor(controls.items, "triplet", row);
    if (!item || controls.projectId === null) {
      return;
    }
    setError(null);
    try {
      await sendJson(registryDisablePath(item.id), "POST", {
        project_id: controls.projectId,
      });
      await mutateVocab();
      await mutateTriplet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  function scheduleToggle(row: VocabTriple) {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
    }
    // ponytail: 300ms click delay so dblclick can rename; drop if rename gets its own control
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      if (frameCount > 0) {
        void toggleRow(row);
      }
    }, 300);
  }

  function startRename(row: VocabTriple, slot: "instrument" | "verb" | "target") {
    if (!controls.canRegistryWrite) {
      return;
    }
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setRenameCell({ row, slot });
    setRenameDraft(row[slot]);
  }

  function commitRename() {
    const current = renameCell;
    const word = renameDraft.trim();
    setRenameCell(null);
    if (!current) {
      return;
    }
    const from = current.row;
    if (!word || word === from[current.slot]) {
      return;
    }
    const to: VocabTriple = {
      ...from,
      [current.slot]: word,
    };
    setError(null);
    void (async () => {
      try {
        await sendJson<unknown>(vocabTripleRenamePath(), "POST", { from, to });
        await mutateVocab();
        await mutateTriplet();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Write failed");
      }
    })();
  }

  return (
    <section data-editor-card="triplet" className="flex flex-col gap-2">
      <EditorCard card="now" count={nowRows.length}>
        <div data-now="" className="flex flex-col gap-1">
          {nowRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{nowEmptyText("triplet", frameIndex)}</p>
          ) : null}
          {nowRows.map((row) => {
            const key = tripleIdentity(row);
            return (
              <div
                key={row.id}
                data-label-color={labelColor(key)}
                className="inline-flex max-w-full items-stretch overflow-hidden rounded-md border text-xs font-medium"
                style={nowFillStyle(key)}
              >
                <span className="truncate px-2 py-1">{row.instrument}</span>
                <span aria-hidden className="w-px shrink-0 bg-white/20" />
                <span className="truncate px-2 py-1">{row.verb}</span>
                <span aria-hidden className="w-px shrink-0 bg-white/20" />
                <span className="truncate px-2 py-1">{row.target}</span>
              </div>
            );
          })}
        </div>
      </EditorCard>
      <EditorCard card="library" count={triples.length}>
        <div className="overflow-x-auto">
          <table aria-label="Library" className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <td colSpan={3} className="p-0 font-normal">
                  <div className="flex items-center gap-1">
                    <div className="grid flex-1 grid-cols-3 divide-x divide-border/40 text-muted-foreground">
                      <span role="columnheader" className="px-2 py-1 font-medium">instrument</span>
                      <span role="columnheader" className="px-2 py-1 font-medium">verb</span>
                      <span role="columnheader" className="px-2 py-1 font-medium">target</span>
                    </div>
                    <div className="w-[84px] shrink-0" aria-hidden="true" />
                  </div>
                </td>
              </tr>
            </thead>
            <tbody>
              {triples.map((row) => {
                const key = tripleIdentity(row);
                const lit = onKeys.has(key);
                const brushed = brush.triplet.some((item) => tripleIdentity(item) === key);
                const isRenaming = renameCell && tripleIdentity(renameCell.row) === key;
                return (
                  <tr key={key} className="group">
                    <td colSpan={3} className="p-0">
                      <div className="flex items-center gap-1">
                        {isRenaming ? (
                          <div
                            className={cn(
                              "grid h-7 min-w-0 flex-1 grid-cols-3 items-center divide-x divide-border/40 border p-0 text-left transition-colors",
                              lit
                                ? "font-medium text-foreground"
                                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                            )}
                            style={libraryRowSemanticStyle(labelColor(key), lit)}
                          >
                            {(["instrument", "verb", "target"] as const).map((slot) => {
                              const isCellEditing = renameCell.slot === slot;
                              return (
                                <div key={slot} className="flex h-full min-w-0 items-center px-2 py-1">
                                  {isCellEditing ? (
                                    <Input
                                      aria-label={`Rename ${slot}`}
                                      value={renameDraft}
                                      autoFocus
                                      className="h-6 px-1 text-xs"
                                      onChange={(e) => setRenameDraft(e.target.value)}
                                      onBlur={() => setRenameCell(null)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          commitRename();
                                        }
                                        if (e.key === "Escape") {
                                          setRenameCell(null);
                                        }
                                      }}
                                    />
                                  ) : (
                                    <div className="flex min-w-0 w-full items-center justify-between">
                                      <span className="flex min-w-0 items-center truncate">
                                        {slot === "instrument" ? (
                                          <span
                                            aria-hidden
                                            className={cn(
                                              "mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm transition-transform",
                                              lit && "ring-1 ring-white/60",
                                            )}
                                            style={{ backgroundColor: labelColor(key) }}
                                          />
                                        ) : null}
                                        <span className="truncate">{row[slot]}</span>
                                      </span>
                                      {slot === "target" && lit ? (
                                        <Check
                                          aria-hidden="true"
                                          data-checkmark=""
                                          size={14}
                                          className="ml-auto mr-1 shrink-0 text-primary"
                                        />
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={cn(
                              "grid h-7 min-w-0 flex-1 grid-cols-3 justify-items-start divide-x divide-border/40 border p-0 font-normal transition-colors",
                              lit
                                ? "font-medium text-foreground"
                                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                            )}
                            style={libraryRowSemanticStyle(labelColor(key), lit)}
                            disabled={frameCount <= 0}
                            aria-label={key}
                            aria-pressed={lit}
                            data-label-color={labelColor(key)}
                            onClick={() => scheduleToggle(row)}
                            onDoubleClick={() => startRename(row, "instrument")}
                          >
                            <span
                              className="flex min-w-0 w-full items-center px-2 py-1"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                startRename(row, "instrument");
                              }}
                            >
                              <span
                                aria-hidden
                                className={cn(
                                  "mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm transition-transform",
                                  lit && "ring-1 ring-white/60",
                                )}
                                style={{ backgroundColor: labelColor(key) }}
                              />
                              <span className="truncate">{row.instrument}</span>
                            </span>
                            <span
                              className="truncate w-full px-2 py-1"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                startRename(row, "verb");
                              }}
                            >
                              {row.verb}
                            </span>
                            <span
                              className="flex min-w-0 w-full items-center justify-between px-2 py-1"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                startRename(row, "target");
                              }}
                            >
                              <span className="truncate">{row.target}</span>
                              {lit ? (
                                <Check
                                  aria-hidden="true"
                                  data-checkmark=""
                                  size={14}
                                  className="ml-auto mr-1 shrink-0 text-primary"
                                />
                              ) : null}
                            </span>
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={laneVisible(key) ? "Hide lane" : "Show lane"}
                          className={laneVisible(key) ? "text-foreground" : "text-muted-foreground"}
                          onClick={() => onToggleLane(key)}
                        >
                          {laneVisible(key) ? <Eye size={14} /> : <EyeOff size={14} />}
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Brush"
                          aria-pressed={brushed}
                          className={brushed ? "text-foreground" : "text-muted-foreground"}
                          onClick={() => toggleBrush({ kind: "triplet", ...row })}
                        >
                          <Brush size={14} />
                        </Button>
                        {controls.canRegistryWrite ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete triple ${key}`}
                            className="opacity-30 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void trashRow(row)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        ) : controls.canEditVocab &&
                          pickerItemFor(controls.items, "triplet", row) ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove triple ${key} from this Project`}
                            title="Remove from this Project"
                            className="opacity-30 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void retractRow(row)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {controls.canRegistryWrite || controls.canCreateCandidate ? (
        <div className="mt-2 flex flex-col gap-1 border-t border-border/50 pt-2">
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-1">
            <Input
              aria-label="instrument"
              placeholder="instrument"
              list="triplet-instrument-words"
              value={draft.instrument}
              className="h-7 text-xs"
              onChange={(event) => setDraft((s) => ({ ...s, instrument: event.target.value }))}
            />
            <Input
              aria-label="verb"
              placeholder="verb"
              list="triplet-verb-words"
              value={draft.verb}
              className="h-7 text-xs"
              onChange={(event) => setDraft((s) => ({ ...s, verb: event.target.value }))}
            />
            <Input
              aria-label="target"
              placeholder="target"
              list="triplet-target-words"
              value={draft.target}
              className="h-7 text-xs"
              onChange={(event) => setDraft((s) => ({ ...s, target: event.target.value }))}
            />
            <Button
              type="button"
              size="sm"
              className="h-7 px-2 text-xs"
              aria-label="Add triplet row"
              onClick={() => void addRowOnly()}
            >
              +
            </Button>
          </div>
        </div>
        ) : null}
        <datalist id="triplet-instrument-words">
          {instrumentWords.map((word) => <option key={word} value={word} />)}
        </datalist>
        <datalist id="triplet-verb-words">
          {verbWords.map((word) => <option key={word} value={word} />)}
        </datalist>
        <datalist id="triplet-target-words">
          {targetWords.map((word) => <option key={word} value={word} />)}
        </datalist>
      </EditorCard>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

export function OtherSummary({
  focus,
  phase,
  classTags,
  triplets,
  onFocus,
}
: {
  focus: EditorKind;
  phase: string | null;
  classTags: string[];
  triplets: TripletRow[];
  onFocus: (kind: EditorKind) => void;
}) {
  const others = (["class", "triplet", "phase"] as const).filter((kind) => kind !== focus);
  return (
    <div aria-label="Other labels" className="shrink-0 border-t border-border pt-2">
      {others.map((kind) => {
        const label = kind === "phase"
          ? `phase: ${phase ?? "unlabeled"}`
          : kind === "class"
            ? `class: ${classTags.length ? classTags.join(", ") : "none"}`
            : `triplet: ${triplets.length ? triplets.map((row) => `${row.instrument}/${row.verb}/${row.target}`).join("; ") : "none"}`;
        return (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant="ghost"
            className="mb-1 w-full justify-start truncate"
            onClick={() => onFocus(kind)}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}
