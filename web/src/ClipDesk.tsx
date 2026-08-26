import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from "react";
import { Button, Checkbox, ComboBox, Input, Label, ListBox, Select, Slider, Table } from "@heroui/react";
import type { Key, Selection } from "@heroui/react";
import { GripVertical, Pause, Play, Plus, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import useSWR, { type KeyedMutator } from "swr";
import {
  classClipPath,
  classFramePath,
  classSpanPath,
  clipDeskPath,
  frameClassTags,
  frameJpegPath,
  framePhaseName,
  frameTripletRows,
  getJson,
  phaseClipPath,
  phaseFramePath,
  phaseSpanPath,
  sendJson,
  tripletClipPath,
  tripletFramePath,
  tripletRowPath,
  tripletSpanPath,
  vocabListPath,
  vocabPath,
  vocabRenamePath,
  type ClassDoc,
  type ClipListResponse,
  type ClipMeta,
  type PhaseDoc,
  type TripletDoc,
  type TripletRow,
  type Vocab,
} from "./api";
import { useDeskStore, type EditorKind } from "./deskStore";

type EditorDragProps = {
  draggable: true;
  onDragStart: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: () => void;
  onDragEnd: () => void;
};

type PlaybackSettings = {
  fps: 1 | 10 | 25;
  skip: number;
};

type TripletSpanRow = {
  instrument: string;
  verb: string;
  target: string;
};

type SpanTarget =
  | { kind: "phase"; name: string }
  | { kind: "class"; name: string }
  | { kind: "triplet"; instrument: string; verb: string; target: string };

type SpanDirection = "write" | "remove";

const PLAYBACK_STORAGE_KEY = "endo_label:desk-playback";
const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = { fps: 1, skip: 1 };

function readPlaybackSettings(): PlaybackSettings {
  if (typeof window === "undefined") {
    return DEFAULT_PLAYBACK_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(PLAYBACK_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PLAYBACK_SETTINGS;
    }
    const value = JSON.parse(raw) as Partial<PlaybackSettings>;
    const fps = value.fps === 10 || value.fps === 25 ? value.fps : 1;
    const skip = typeof value.skip === "number" && Number.isInteger(value.skip)
      ? Math.min(Math.max(1, value.skip), 999)
      : 1;
    return { fps, skip };
  } catch {
    return DEFAULT_PLAYBACK_SETTINGS;
  }
}

function savePlaybackSettings(settings: PlaybackSettings) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(PLAYBACK_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage can be unavailable in private browsing or a restricted iframe.
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
    return true;
  }
  return Boolean(target.closest('[role="textbox"], [role="combobox"], [role="searchbox"], [role="slider"]'));
}

function sliderNumber(value: number | number[]): number {
  return typeof value === "number" ? value : (value[0] ?? 0);
}

function namesFromSelection(selection: Selection, all: string[]): string[] {
  if (selection === "all") {
    return [...all];
  }
  return [...selection].map(String).filter((name) => all.includes(name));
}

// ponytail: delay class PUT so dblclick can cancel the toggle; split row-click vs name-dblclick if 280ms lags span.
const CLASS_CLICK_MS = 280;

function useCancelableDelay() {
  const timer = useRef<number | null>(null);
  const cancel = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  useEffect(() => cancel, [cancel]);
  const schedule = useCallback((fn: () => void) => {
    cancel();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      fn();
    }, CLASS_CLICK_MS);
  }, [cancel]);
  return { schedule, cancel };
}

function completeTriplet(row: TripletSpanRow): boolean {
  return Boolean(row.instrument && row.verb && row.target);
}

function ResizeHandle({
  label,
  direction,
  value,
  onResize,
  reverse = false,
}: {
  label: string;
  direction: "horizontal" | "vertical";
  value: number;
  onResize: (value: number) => void;
  reverse?: boolean;
}) {
  const start = useRef<{ coordinate: number; value: number } | null>(null);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    start.current = {
      coordinate: direction === "horizontal" ? event.clientX : event.clientY,
      value,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) {
      return;
    }
    const coordinate = direction === "horizontal" ? event.clientX : event.clientY;
    const delta = coordinate - start.current.coordinate;
    onResize(start.current.value + (reverse ? -delta : delta));
  }

  function stopResize() {
    start.current = null;
  }

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={direction}
      className={direction === "horizontal" ? "w-1 shrink-0 cursor-col-resize bg-stone-200 hover:bg-emerald-500" : "h-1 shrink-0 cursor-row-resize bg-stone-200 hover:bg-emerald-500"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopResize}
      onPointerCancel={stopResize}
    />
  );
}

export function ClipDesk() {
  const { clipId } = useParams();
  const {
    data: clipList,
    error: clipListError,
    isLoading: clipsLoading,
  } = useSWR("/api/clips", getJson<ClipListResponse>);
  const { data, error, isLoading } = useSWR(
    clipId ? `/api/clips/${encodeURIComponent(clipId)}` : null,
    getJson<ClipMeta>,
  );
  const { data: phaseDoc, mutate: mutatePhase } = useSWR(
    clipId ? phaseClipPath(clipId) : null,
    getJson<PhaseDoc>,
  );
  const { data: classDoc, mutate: mutateClass } = useSWR(
    clipId ? classClipPath(clipId) : null,
    getJson<ClassDoc>,
  );
  const { data: tripletDoc, mutate: mutateTriplet } = useSWR(
    clipId ? tripletClipPath(clipId) : null,
    getJson<TripletDoc>,
  );
  const { data: vocab, mutate: mutateVocab } = useSWR(
    vocabPath(),
    getJson<Vocab>,
  );
  const storedClipId = useDeskStore((s) => s.clipId);
  const storedIndex = useDeskStore((s) => s.frameIndex);
  const openClip = useDeskStore((s) => s.openClip);
  const scrub = useDeskStore((s) => s.scrub);
  const layout = useDeskStore((s) => s.layout);
  const setLayout = useDeskStore((s) => s.setLayout);
  const editorOrder = layout.editorOrder;
  const setEditorOrder = useDeskStore((s) => s.setEditorOrder);
  const spanStart = useDeskStore((s) => s.spanStart);
  const setSpanStart = useDeskStore((s) => s.setSpanStart);
  const [draggedEditor, setDraggedEditor] = useState<EditorKind | null>(null);
  const [spanError, setSpanError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playback, setPlayback] = useState<PlaybackSettings>(() => readPlaybackSettings());
  const [tripletSpanRows, setTripletSpanRows] = useState<TripletSpanRow[]>([]);
  const [spanPayload, setSpanPayload] = useState<SpanTarget[]>([]);
  const [spanDirection, setSpanDirection] = useState<SpanDirection>("write");
  const spanBusy = useRef(false);
  const frameIndex = storedClipId === clipId ? storedIndex : 0;
  const currentPhase = data ? framePhaseName(phaseDoc?.frames ?? {}, frameIndex) : null;
  const currentTags = data ? frameClassTags(classDoc?.frames ?? {}, frameIndex) : [];

  const spanTargets = useMemo<SpanTarget[]>(() => [
    ...(currentPhase ? [{ kind: "phase" as const, name: currentPhase }] : []),
    ...currentTags.map((name) => ({ kind: "class" as const, name })),
    ...tripletSpanRows.filter(completeTriplet).map((row) => ({
      kind: "triplet" as const,
      instrument: row.instrument,
      verb: row.verb,
      target: row.target,
    })),
  ], [currentPhase, currentTags, tripletSpanRows]);
  const hudTargets = spanStart?.clipId === clipId && spanPayload.length ? spanPayload : spanTargets;

  useEffect(() => {
    savePlaybackSettings(playback);
  }, [playback]);

  useEffect(() => {
    setPlaying(false);
    setTripletSpanRows([]);
    setSpanPayload([]);
    setSpanDirection("write");
  }, [clipId]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = window.setInterval(() => {
      const state = useDeskStore.getState();
      if (!clipId || state.clipId !== clipId || state.frameCount <= 0) {
        setPlaying(false);
        return;
      }
      const last = state.frameCount - 1;
      const next = Math.min(state.frameIndex + playback.skip, last);
      state.scrub(next);
      if (next >= last) {
        setPlaying(false);
      }
    }, 1000 / playback.fps);
    return () => window.clearInterval(timer);
  }, [clipId, playback.fps, playback.skip, playing]);

  const togglePlayback = useCallback(() => {
    if (!data || data.frame_count <= 0 || frameIndex >= data.frame_count - 1) {
      setPlaying(false);
      return;
    }
    setPlaying((current) => !current);
  }, [data, frameIndex]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === " ") {
        if (clipId && data && data.frame_count > 0) {
          event.preventDefault();
          togglePlayback();
        }
        return;
      }
      if (!clipId || !data || data.frame_count <= 0) {
        return;
      }
      const isStart = key === "[" || key === "i";
      const isEnd = key === "]" || key === "o";
      if (!isStart && !isEnd) {
        return;
      }
      if (isStart) {
        if (!spanTargets.length) {
          return;
        }
        event.preventDefault();
        setSpanError(null);
        setSpanStart({ clipId, frameIndex });
        setSpanPayload(spanTargets);
        return;
      }
      const payload = spanStart?.clipId === clipId && spanPayload.length ? spanPayload : spanTargets;
      if (!payload.length) {
        return;
      }
      event.preventDefault();
      setSpanError(null);
      if (spanBusy.current) {
        return;
      }
      const start = spanStart?.clipId === clipId ? spanStart.frameIndex : frameIndex;
      spanBusy.current = true;
      const remove = spanDirection === "remove";
      void (async () => {
        try {
          for (const target of payload) {
            if (target.kind === "phase") {
              const doc = await sendJson<PhaseDoc>(phaseSpanPath(clipId), "POST", {
                phase: remove ? null : target.name,
                from: start,
                to: frameIndex,
              });
              await mutatePhase(doc, { revalidate: false });
              continue;
            }
            if (target.kind === "class") {
              const doc = await sendJson<ClassDoc>(classSpanPath(clipId), "POST", {
                tag: target.name,
                from: start,
                to: frameIndex,
                on: !remove,
              });
              await mutateClass(doc, { revalidate: false });
              continue;
            }
            const doc = await sendJson<TripletDoc>(tripletSpanPath(clipId), "POST", {
              instrument: target.instrument,
              verb: target.verb,
              target: target.target,
              from: start,
              to: frameIndex,
              op: remove ? "remove" : "add",
            });
            await mutateTriplet(doc, { revalidate: false });
          }
          setSpanStart(null);
          setSpanPayload([]);
          setPlaying(false);
        } catch (err) {
          setSpanError(err instanceof Error ? err.message : "Write failed");
        } finally {
          spanBusy.current = false;
        }
      })();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [clipId, data, frameIndex, mutateClass, mutatePhase, mutateTriplet, setSpanStart, spanDirection, spanPayload, spanStart, spanTargets, togglePlayback]);

  function moveEditor(target: EditorKind) {
    if (!draggedEditor || draggedEditor === target) {
      return;
    }
    const next = [...editorOrder];
    const from = next.indexOf(draggedEditor);
    const to = next.indexOf(target);
    if (from < 0 || to < 0) {
      return;
    }
    next.splice(from, 1);
    next.splice(to, 0, draggedEditor);
    setEditorOrder(next);
    setDraggedEditor(null);
  }

  useLayoutEffect(() => {
    if (data) {
      openClip(data.id, data.frame_count);
    }
  }, [data, openClip]);

  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-stone-100 text-stone-900">
      <header className="flex shrink-0 items-center gap-3 border-b border-stone-300 px-3 py-2">
        <span className="text-sm font-semibold tracking-wide">endo_label</span>
        <span className="text-stone-300" aria-hidden="true">/</span>
        <h1 className="text-sm font-semibold">{data?.id ?? "Workbench"}</h1>
        {data ? <p className="text-sm text-stone-600">Frame {frameIndex} of {data.frame_count}</p> : null}
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav
          aria-label="Clips"
          className="flex shrink-0 flex-col overflow-y-auto border-r border-stone-300 bg-white"
          style={{ width: layout.clipRailWidth }}
        >
          <div className="border-b border-stone-200 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Clips</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
            {clipsLoading ? <p className="p-2 text-sm text-stone-500">Loading Clips…</p> : null}
            {clipListError ? <p className="p-2 text-sm text-red-800">Could not load Clips</p> : null}
            {!clipsLoading && !clipListError && clipList?.clips.length === 0 ? <p className="p-2 text-sm text-stone-500">No Clips on the allowlist.</p> : null}
            {clipList?.clips.map((clip) => (
              <Link
                key={clip.id}
                to={clipDeskPath(clip.id)}
                aria-current={clip.id === clipId ? "page" : undefined}
                className={`flex items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors ${clip.id === clipId ? "bg-emerald-100 font-semibold text-emerald-950" : "text-stone-700 hover:bg-stone-100"}`}
              >
                <span className="truncate">{clip.id}</span>
                <span className="ml-2 shrink-0 text-xs text-stone-500">{clip.frame_count} Frames</span>
              </Link>
            ))}
          </div>
        </nav>
        <ResizeHandle
          label="Resize Clip rail"
          direction="horizontal"
          value={layout.clipRailWidth}
          onResize={(value) => setLayout({ clipRailWidth: value })}
        />
        <section aria-label="Frame viewer" className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-black">
          {error ? (
            <div className="p-6 text-center text-stone-100"><h2 className="mb-2 text-lg font-semibold">{clipId}</h2><p>{error instanceof Error ? error.message : "Clip not found"}</p></div>
          ) : isLoading ? (
            <p className="text-stone-100">Loading Clip…</p>
          ) : data?.frame_count ? (
            <img
              className="h-full w-full object-contain"
              src={frameJpegPath(data.id, frameIndex)}
              alt={`Frame ${frameIndex}`}
            />
          ) : data ? (
            <p className="text-stone-100">This Clip has no Frames.</p>
          ) : (
            <div className="p-6 text-center text-stone-100"><h2 className="mb-2 text-xl font-semibold">Choose a Clip</h2><p className="text-stone-300">Select a Clip from the left rail to begin labeling.</p></div>
          )}
        </section>
        <ResizeHandle
          label="Resize editor rail"
          direction="horizontal"
          value={layout.editorRailWidth}
          reverse
          onResize={(value) => setLayout({ editorRailWidth: value })}
        />
        <div
          className="flex shrink-0 flex-col gap-4 overflow-y-auto border-l border-stone-300 p-3"
          style={{ width: layout.editorRailWidth }}
        >
          {data ? editorOrder.map((kind) => {
            const dragProps: EditorDragProps = {
              draggable: true,
              onDragStart: () => setDraggedEditor(kind),
              onDragOver: (event: DragEvent<HTMLElement>) => event.preventDefault(),
              onDrop: () => moveEditor(kind),
              onDragEnd: () => setDraggedEditor(null),
            };
            if (kind === "class") {
              return (
                <ClassTable
                  key={data.id}
                  clipId={data.id}
                  frameIndex={frameIndex}
                  frameCount={data.frame_count}
                  classFrames={classDoc?.frames ?? {}}
                  classTags={vocab?.class_tags ?? []}
                  mutateClass={mutateClass}
                  mutateVocab={mutateVocab}
                  dragProps={dragProps}
                />
              );
            }
            if (kind === "triplet") {
              return (
                <TripletTable
                  key={`${data.id}-triplet`}
                  clipId={data.id}
                  frameIndex={frameIndex}
                  frameCount={data.frame_count}
                  tripletFrames={tripletDoc?.frames ?? {}}
                  instruments={vocab?.instruments ?? []}
                  verbs={vocab?.verbs ?? []}
                  targets={vocab?.targets ?? []}
                  mutateTriplet={mutateTriplet}
                  mutateVocab={mutateVocab}
                  dragProps={dragProps}
                  onSpanRows={setTripletSpanRows}
                />
              );
            }
            return (
              <PhaseTable
                key={`${data.id}-phase`}
                clipId={data.id}
                frameIndex={frameIndex}
                frameCount={data.frame_count}
                phaseFrames={phaseDoc?.frames ?? {}}
                phases={vocab?.phases ?? []}
                mutatePhase={mutatePhase}
                mutateVocab={mutateVocab}
                dragProps={dragProps}
              />
            );
          }) : <EmptyEditors />}
        </div>
      </div>
      <ResizeHandle
        label="Resize Frame controls"
        direction="vertical"
        value={layout.bottomBarHeight}
        reverse
        onResize={(value) => setLayout({ bottomBarHeight: value })}
      />
      <footer aria-label="Frame transport" className="flex shrink-0 items-center gap-3 overflow-x-auto border-t border-stone-300 bg-white px-4 py-2" style={{ height: layout.bottomBarHeight }}>
        <Button
          isIconOnly
          size="sm"
          aria-label={playing ? "Pause" : "Play"}
          isDisabled={!data || data.frame_count <= 0 || (!playing && frameIndex >= data.frame_count - 1)}
          onPress={togglePlayback}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </Button>
        <Select
          className="w-24"
          value={String(playback.fps)}
          onChange={(value) => {
            const fps = Number(value);
            if (fps === 1 || fps === 10 || fps === 25) {
              setPlayback((current) => ({ ...current, fps }));
            }
          }}
        >
          <Label>fps</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="1" textValue="1">1</ListBox.Item>
              <ListBox.Item id="10" textValue="10">10</ListBox.Item>
              <ListBox.Item id="25" textValue="25">25</ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
        <div className="flex shrink-0 items-center gap-1 text-sm">
          <Label>skip every</Label>
          <Input
            aria-label="Skip every N Frames"
            className="w-16"
            type="number"
            min={1}
            max={999}
            step={1}
            value={String(playback.skip)}
            onChange={(event) => {
              const skip = Number(event.target.value);
              if (Number.isInteger(skip) && skip >= 1 && skip <= 999) {
                setPlayback((current) => ({ ...current, skip }));
              }
            }}
          />
          <span>Frames</span>
        </div>
        <Slider
          className="min-w-40 flex-1"
          minValue={0}
          maxValue={Math.max(0, (data?.frame_count ?? 0) - 1)}
          step={1}
          value={data?.frame_count ? frameIndex : 0}
          isDisabled={!data || data.frame_count <= 0}
          onChange={(value) => scrub(sliderNumber(value))}
        >
          <Label>Frame index</Label>
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        <output className="w-24 shrink-0 text-right text-sm text-stone-600">{data ? `Frame ${frameIndex} of ${data.frame_count}` : "No Clip"}</output>
        <div role="region" aria-label="Span HUD" className="flex min-w-64 max-w-[42rem] items-center gap-2 text-xs text-stone-600">
          <Button
            size="sm"
            variant={spanDirection === "write" ? "primary" : "ghost"}
            aria-pressed={spanDirection === "write"}
            onPress={() => setSpanDirection("write")}
          >
            Write to span
          </Button>
          <Button
            size="sm"
            variant={spanDirection === "remove" ? "primary" : "ghost"}
            aria-pressed={spanDirection === "remove"}
            onPress={() => setSpanDirection("remove")}
          >
            Remove from span
          </Button>
          {hudTargets.length ? (
            <>
              <span className="font-medium text-stone-800">
                {hudTargets.map((target) => target.kind === "class"
                  ? `class: ${target.name}`
                  : target.kind === "phase"
                    ? `phase: ${target.name}`
                    : `triplet: ${target.instrument} / ${target.verb} / ${target.target}`).join(" · ")}
              </span>
              {spanStart && spanStart.clipId === clipId
                ? ` · from Frame ${spanStart.frameIndex} · press ] or O to ${spanDirection === "remove" ? "remove" : "write"}`
                : ` · ] or O ${spanDirection === "remove" ? "removes" : "writes"} this Frame`}
            </>
          ) : "No span target"}
          {spanError ? <span className="ml-2 text-red-800">{spanError}</span> : null}
        </div>
      </footer>
    </main>
  );
}

function EmptyEditors() {
  return (
    <>
      {(["class", "triplet", "phase"] as const).map((title) => (
        <div key={title} data-editor-card={title}>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-2 text-sm text-stone-500">Choose a Clip to edit this Task type.</p>
        </div>
      ))}
    </>
  );
}

function EditorShell({
  title,
  addLabel,
  onAdd,
  dragProps,
  children,
}: {
  title: EditorKind;
  addLabel: string;
  onAdd: () => void;
  dragProps?: EditorDragProps;
  children: ReactNode;
}) {
  return (
    <div
      data-editor-card={title}
      className="flex shrink-0 flex-col gap-2"
      onDragOver={dragProps?.onDragOver}
      onDrop={dragProps?.onDrop}
    >
      <div className="flex items-center gap-2">
        {dragProps ? (
          <span
            draggable
            aria-label={`Reorder ${title}`}
            className="cursor-grab active:cursor-grabbing"
            onDragStart={dragProps.onDragStart}
            onDragEnd={dragProps.onDragEnd}
          >
            <GripVertical size={15} aria-hidden="true" />
          </span>
        ) : null}
        <h2 className="flex-1 text-lg font-semibold">{title}</h2>
        <Button isIconOnly size="sm" variant="secondary" aria-label={addLabel} onPress={onAdd}>
          <Plus size={16} />
        </Button>
      </div>
      {children}
    </div>
  );
}

function SelectionCheck({ label }: { label: string }) {
  return (
    <Checkbox slot="selection" aria-label={label} variant="secondary">
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox.Content>
    </Checkbox>
  );
}

function RowRemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button
      isIconOnly
      size="sm"
      variant="ghost"
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
      onPress={onPress}
    >
      <X size={14} />
    </Button>
  );
}

function VocabNameCell({
  name,
  renameFrom,
  renameDraft,
  renameLabel,
  onDraft,
  onCommit,
  onCancel,
  onStart,
}: {
  name: string;
  renameFrom: string | null;
  renameDraft: string;
  renameLabel: string;
  onDraft: (value: string) => void;
  onCommit: () => Promise<void>;
  onCancel: () => void;
  onStart: (name: string) => void;
}) {
  if (renameFrom === name) {
    return (
      <Input
        autoFocus
        aria-label={renameLabel}
        value={renameDraft}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void onCommit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          void onCommit();
        }}
      />
    );
  }
  return (
    <span
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onStart(name);
      }}
    >
      {name}
    </span>
  );
}

async function ensureVocabName(
  listName: "phases" | "class_tags" | "instruments" | "verbs" | "targets",
  raw: string,
  names: string[],
  mutateVocab: KeyedMutator<Vocab>,
): Promise<string | null> {
  const name = raw.trim();
  if (!name) {
    return null;
  }
  if (names.includes(name)) {
    return name;
  }
  try {
    const created = await sendJson<Vocab>(vocabListPath(listName), "POST", { name });
    await mutateVocab(created, { revalidate: false });
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("already present")) {
      throw err;
    }
  }
  return name;
}

function NameCombo({
  ariaLabel,
  names,
  value,
  listName,
  mutateVocab,
  onCommit,
}: {
  ariaLabel: string;
  names: string[];
  value: string;
  listName: "instruments" | "verbs" | "targets";
  mutateVocab: KeyedMutator<Vocab>;
  onCommit: (name: string) => Promise<void>;
}) {
  const [text, setText] = useState(value);
  const busy = useRef(false);

  useEffect(() => {
    setText(value);
  }, [value]);

  async function commit(raw: string) {
    const name = raw.trim();
    if (!name || busy.current) {
      return;
    }
    busy.current = true;
    try {
      const added = await ensureVocabName(listName, name, names, mutateVocab);
      if (added) {
        setText(added);
        if (added !== value) {
          await onCommit(added);
        }
      }
    } finally {
      busy.current = false;
    }
  }

  return (
    <ComboBox
      aria-label={ariaLabel}
      allowsCustomValue
      allowsEmptyCollection
      inputValue={text}
      menuTrigger="focus"
      selectedKey={names.includes(value) ? value : null}
      onInputChange={setText}
      onSelectionChange={(key: Key | null) => {
        if (key != null) {
          void commit(String(key));
        }
      }}
    >
      <ComboBox.InputGroup>
        <Input
          aria-label={ariaLabel}
          onBlur={() => {
            if (text.trim() && text.trim() !== value) {
              void commit(text);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void commit(text);
            }
          }}
        />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox>
          {names.map((name) => (
            <ListBox.Item key={name} id={name} textValue={name}>
              {name}
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}

function PhaseTable({
  clipId,
  frameIndex,
  frameCount,
  phaseFrames,
  phases,
  mutatePhase,
  mutateVocab,
  dragProps,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  phaseFrames: Record<string, string>;
  phases: string[];
  mutatePhase: KeyedMutator<PhaseDoc>;
  mutateVocab: KeyedMutator<Vocab>;
  dragProps?: EditorDragProps;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const currentPhase = framePhaseName(phaseFrames, frameIndex);
  const selectedKeys: Selection = currentPhase ? new Set([currentPhase]) : new Set();

  async function run(op: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await op();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    } finally {
      setBusy(false);
    }
  }

  async function commitRename() {
    if (renameFrom == null) {
      return;
    }
    const from = renameFrom;
    const to = renameDraft.trim();
    setRenameFrom(null);
    if (to === from) {
      return;
    }
    await run(async () => {
      const next = await sendJson<Vocab>(vocabRenamePath("phases"), "POST", { from, to });
      await mutateVocab(next, { revalidate: false });
      await mutatePhase();
    });
  }

  return (
    <EditorShell title="phase" addLabel="Add phase" dragProps={dragProps} onAdd={() => setDraft("")}>
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="phase"
            selectionMode="single"
            selectedKeys={selectedKeys}
            onSelectionChange={(selection) => {
              if (busy || frameCount <= 0 || renameFrom != null) {
                return;
              }
              const name = namesFromSelection(selection, phases)[0];
              if (!name || name === currentPhase) {
                return;
              }
              void run(async () => {
                const doc = await sendJson<PhaseDoc>(phaseFramePath(clipId, frameIndex), "PUT", { phase: name });
                await mutatePhase(doc, { revalidate: false });
              });
            }}
          >
            <Table.Header>
              <Table.Column isRowHeader>phase</Table.Column>
              <Table.Column />
            </Table.Header>
            <Table.Body>
              {phases.map((name) => (
                <Table.Row key={name} id={name}>
                  <Table.Cell>
                    <VocabNameCell
                      name={name}
                      renameFrom={renameFrom}
                      renameDraft={renameDraft}
                      renameLabel="Rename phase"
                      onDraft={setRenameDraft}
                      onCommit={commitRename}
                      onCancel={() => setRenameFrom(null)}
                      onStart={(value) => {
                        setError(null);
                        setRenameFrom(value);
                        setRenameDraft(value);
                      }}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <RowRemoveButton
                      label={`Clear ${name}`}
                      onPress={() => {
                        if (busy || frameCount <= 0) {
                          return;
                        }
                        void run(async () => {
                          const doc = await sendJson<PhaseDoc>(phaseFramePath(clipId, frameIndex), "PUT", { phase: null });
                          await mutatePhase(doc, { revalidate: false });
                        });
                      }}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
              {draft != null ? (
                <Table.Row id="__draft__">
                  <Table.Cell>
                    <Input
                      autoFocus
                      aria-label="New phase name"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void run(async () => {
                            const name = await ensureVocabName("phases", draft, phases, mutateVocab);
                            if (!name) {
                              return;
                            }
                            const doc = await sendJson<PhaseDoc>(phaseFramePath(clipId, frameIndex), "PUT", { phase: name });
                            await mutatePhase(doc, { revalidate: false });
                            setDraft(null);
                          });
                        }
                      }}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <RowRemoveButton label="Cancel new phase" onPress={() => setDraft(null)} />
                  </Table.Cell>
                </Table.Row>
              ) : null}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
    </EditorShell>
  );
}

function ClassTable({
  clipId,
  frameIndex,
  frameCount,
  classFrames,
  classTags,
  mutateClass,
  mutateVocab,
  dragProps,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  classFrames: Record<string, string[]>;
  classTags: string[];
  mutateClass: KeyedMutator<ClassDoc>;
  mutateVocab: KeyedMutator<Vocab>;
  dragProps?: EditorDragProps;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const { schedule, cancel } = useCancelableDelay();
  const current = frameClassTags(classFrames, frameIndex);
  const selectedKeys: Selection = new Set(current);

  async function run(op: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await op();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    } finally {
      setBusy(false);
    }
  }

  async function commitRename() {
    if (renameFrom == null) {
      return;
    }
    const from = renameFrom;
    const to = renameDraft.trim();
    setRenameFrom(null);
    if (to === from) {
      return;
    }
    await run(async () => {
      const next = await sendJson<Vocab>(vocabRenamePath("class_tags"), "POST", { from, to });
      await mutateVocab(next, { revalidate: false });
      await mutateClass();
    });
  }

  return (
    <EditorShell title="class" addLabel="Add class tag" dragProps={dragProps} onAdd={() => setDraft("")}>
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="class"
            selectionMode="multiple"
            selectedKeys={selectedKeys}
            onSelectionChange={(selection) => {
              if (busy || frameCount <= 0 || renameFrom != null) {
                return;
              }
              const tags = namesFromSelection(selection, classTags);
              const same = tags.length === current.length && tags.every((tag) => current.includes(tag));
              if (same) {
                return;
              }
              schedule(() => {
                void run(async () => {
                  const doc = await sendJson<ClassDoc>(classFramePath(clipId, frameIndex), "PUT", { tags });
                  await mutateClass(doc, { revalidate: false });
                });
              });
            }}
          >
            <Table.Header>
              <Table.Column isRowHeader>class</Table.Column>
              <Table.Column />
            </Table.Header>
            <Table.Body>
              {classTags.map((name) => (
                <Table.Row key={name} id={name}>
                  <Table.Cell>
                    <VocabNameCell
                      name={name}
                      renameFrom={renameFrom}
                      renameDraft={renameDraft}
                      renameLabel="Rename class tag"
                      onDraft={setRenameDraft}
                      onCommit={commitRename}
                      onCancel={() => setRenameFrom(null)}
                      onStart={(value) => {
                        cancel();
                        setError(null);
                        setRenameFrom(value);
                        setRenameDraft(value);
                      }}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <RowRemoveButton
                      label={`Turn off ${name}`}
                      onPress={() => {
                        if (busy || frameCount <= 0 || !current.includes(name)) {
                          return;
                        }
                        void run(async () => {
                          const doc = await sendJson<ClassDoc>(
                            classFramePath(clipId, frameIndex),
                            "PUT",
                            { tags: current.filter((tag) => tag !== name) },
                          );
                          await mutateClass(doc, { revalidate: false });
                        });
                      }}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
              {draft != null ? (
                <Table.Row id="__draft__">
                  <Table.Cell>
                    <Input
                      autoFocus
                      aria-label="New class tag"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void run(async () => {
                            const name = await ensureVocabName("class_tags", draft, classTags, mutateVocab);
                            if (!name) {
                              return;
                            }
                            const tags = current.includes(name) ? current : [...current, name];
                            const doc = await sendJson<ClassDoc>(classFramePath(clipId, frameIndex), "PUT", { tags });
                            await mutateClass(doc, { revalidate: false });
                            setDraft(null);
                          });
                        }
                      }}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <RowRemoveButton label="Cancel new class tag" onPress={() => setDraft(null)} />
                  </Table.Cell>
                </Table.Row>
              ) : null}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
    </EditorShell>
  );
}

function TripletTable({
  clipId,
  frameIndex,
  frameCount,
  tripletFrames,
  instruments,
  verbs,
  targets,
  mutateTriplet,
  mutateVocab,
  dragProps,
  onSpanRows,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  tripletFrames: Record<string, TripletRow[]>;
  instruments: string[];
  verbs: string[];
  targets: string[];
  mutateTriplet: KeyedMutator<TripletDoc>;
  mutateVocab: KeyedMutator<Vocab>;
  dragProps?: EditorDragProps;
  onSpanRows: (rows: TripletSpanRow[]) => void;
}) {
  const [drafts, setDrafts] = useState<{ localId: string; instrument: string; verb: string; target: string }[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [error, setError] = useState<string | null>(null);
  const posting = useRef(new Set<string>());
  const current = frameTripletRows(tripletFrames, frameIndex);

  useEffect(() => {
    setDrafts([]);
    setSelectedKeys(new Set());
    onSpanRows([]);
  }, [clipId, frameIndex, onSpanRows]);

  function reportSpan(nextKeys: Selection, nextDrafts = drafts) {
    const selected = new Set(nextKeys === "all" ? current.map((row) => String(row.id)) : [...nextKeys].map(String));
    const rows: TripletSpanRow[] = [
      ...current.filter((row) => selected.has(String(row.id))),
      ...nextDrafts.filter((row) => selected.has(row.localId) && completeTriplet(row)),
    ];
    onSpanRows(rows);
  }

  async function run(op: () => Promise<void>) {
    setError(null);
    try {
      await op();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  async function persistDraft(draft: { localId: string; instrument: string; verb: string; target: string }) {
    if (!completeTriplet(draft) || frameCount <= 0 || posting.current.has(draft.localId)) {
      return;
    }
    posting.current.add(draft.localId);
    try {
      await sendJson<TripletRow>(tripletFramePath(clipId, frameIndex), "POST", {
        instrument: draft.instrument,
        verb: draft.verb,
        target: draft.target,
      });
      await mutateTriplet();
      setDrafts((rows) => rows.filter((row) => row.localId !== draft.localId));
    } finally {
      posting.current.delete(draft.localId);
    }
  }

  async function patchRow(row: TripletRow, patch: Partial<TripletSpanRow>) {
    const next = {
      instrument: patch.instrument ?? row.instrument,
      verb: patch.verb ?? row.verb,
      target: patch.target ?? row.target,
    };
    if (!completeTriplet(next)) {
      return;
    }
    const doc = await sendJson<TripletDoc>(tripletRowPath(clipId, frameIndex, row.id), "PUT", next);
    await mutateTriplet(doc, { revalidate: false });
  }

  return (
    <EditorShell
      title="triplet"
      addLabel="Add triplet row"
      dragProps={dragProps}
      onAdd={() => setDrafts((rows) => [...rows, { localId: `draft-${Date.now()}`, instrument: "", verb: "", target: "" }])}
    >
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="triplet"
            selectionMode="multiple"
            selectedKeys={selectedKeys}
            onSelectionChange={(selection) => {
              setSelectedKeys(selection);
              reportSpan(selection);
            }}
          >
            <Table.Header>
              <Table.Column>
                <SelectionCheck label="Select all triplet rows" />
              </Table.Column>
              <Table.Column isRowHeader>instrument</Table.Column>
              <Table.Column>verb</Table.Column>
              <Table.Column>target</Table.Column>
              <Table.Column />
            </Table.Header>
            <Table.Body>
              {current.map((row) => (
                <Table.Row key={row.id} id={String(row.id)}>
                  <Table.Cell>
                    <SelectionCheck label={`Select row ${row.id}`} />
                  </Table.Cell>
                  <Table.Cell>
                    <NameCombo
                      ariaLabel="instrument"
                      names={instruments}
                      value={row.instrument}
                      listName="instruments"
                      mutateVocab={mutateVocab}
                      onCommit={(name) => run(() => patchRow(row, { instrument: name }))}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <NameCombo
                      ariaLabel="verb"
                      names={verbs}
                      value={row.verb}
                      listName="verbs"
                      mutateVocab={mutateVocab}
                      onCommit={(name) => run(() => patchRow(row, { verb: name }))}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <NameCombo
                      ariaLabel="target"
                      names={targets}
                      value={row.target}
                      listName="targets"
                      mutateVocab={mutateVocab}
                      onCommit={(name) => run(() => patchRow(row, { target: name }))}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <RowRemoveButton
                      label="Delete row"
                      onPress={() => {
                        void run(async () => {
                          const doc = await sendJson<TripletDoc>(tripletRowPath(clipId, frameIndex, row.id), "DELETE");
                          await mutateTriplet(doc, { revalidate: false });
                        });
                      }}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
              {drafts.map((draft) => (
                <Table.Row key={draft.localId} id={draft.localId}>
                  <Table.Cell>
                    <SelectionCheck label="Select draft row" />
                  </Table.Cell>
                  <Table.Cell>
                    <NameCombo
                      ariaLabel="instrument"
                      names={instruments}
                      value={draft.instrument}
                      listName="instruments"
                      mutateVocab={mutateVocab}
                      onCommit={(name) => run(async () => {
                        let next = { ...draft, instrument: name };
                        setDrafts((rows) => {
                          const current = rows.find((row) => row.localId === draft.localId) ?? draft;
                          next = { ...current, instrument: name };
                          return rows.map((row) => row.localId === draft.localId ? next : row);
                        });
                        await persistDraft(next);
                      })}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <NameCombo
                      ariaLabel="verb"
                      names={verbs}
                      value={draft.verb}
                      listName="verbs"
                      mutateVocab={mutateVocab}
                      onCommit={(name) => run(async () => {
                        let next = { ...draft, verb: name };
                        setDrafts((rows) => {
                          const current = rows.find((row) => row.localId === draft.localId) ?? draft;
                          next = { ...current, verb: name };
                          return rows.map((row) => row.localId === draft.localId ? next : row);
                        });
                        await persistDraft(next);
                      })}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <NameCombo
                      ariaLabel="target"
                      names={targets}
                      value={draft.target}
                      listName="targets"
                      mutateVocab={mutateVocab}
                      onCommit={(name) => run(async () => {
                        let next = { ...draft, target: name };
                        setDrafts((rows) => {
                          const current = rows.find((row) => row.localId === draft.localId) ?? draft;
                          next = { ...current, target: name };
                          return rows.map((row) => row.localId === draft.localId ? next : row);
                        });
                        await persistDraft(next);
                      })}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <RowRemoveButton
                      label="Delete row"
                      onPress={() => setDrafts((rows) => rows.filter((row) => row.localId !== draft.localId))}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
    </EditorShell>
  );
}
