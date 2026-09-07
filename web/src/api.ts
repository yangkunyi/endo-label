export type ClipRow = { id: string; kind: "jpeg" | "video"; frame_count: number; fps: number };

export type ClipListResponse = { clips: ClipRow[] };

export type ClipMeta = {
  id: string;
  kind: "jpeg" | "video";
  frame_count: number;
  fps: number;
  frames: { index: number; stem: string }[];
};

export type PhaseDoc = { clip_id: string; frames: Record<string, string> };

export type ClassDoc = { clip_id: string; frames: Record<string, string[]> };

export type TripletRow = {
  id: number;
  instrument: string;
  verb: string;
  target: string;
};

export type TripletDoc = {
  clip_id: string;
  frames: Record<string, TripletRow[]>;
};

export type VocabTriple = {
  instrument: string;
  verb: string;
  target: string;
};

export type Vocab = {
  phases: string[];
  class_tags: string[];
  triples: VocabTriple[];
};

export type MaskRle = {
  format: string;
  size: number[];
  counts: number[];
  source?: string;
  track_id?: number;
};

export type LeftoverPoint = { x: number; y: number; positive: boolean };

export type TrackRow = {
  track_id: number;
  label: string;
  color: string;
  score: number | null;
  mask?: MaskRle;
  geometric_memory?: LeftoverPoint[];
};

export type SessionPublic = {
  active: boolean;
  session_id?: string;
  clip_id?: string;
  tracks?: TrackRow[];
};

export type AnnotationSummary = {
  clip_id: string;
  tracks: TrackRow[];
  frame_count: number;
};

export type FrameAnnotations = {
  clip_id: string;
  frame_index: number;
  frame_stem: string;
  masks: Array<MaskRle & { track_id: number }>;
};

export type PredictResult = {
  frame_index: number;
  empty: boolean;
  message: string | null;
  tracks: TrackRow[];
};

export function clipDeskPath(clipId: string): string {
  return `/clips/${encodeURIComponent(clipId)}`;
}

export function frameJpegPath(clipId: string, frameIndex: number): string {
  return `/api/clips/${encodeURIComponent(clipId)}/frames/${frameIndex}`;
}

export function clipMediaPath(clipId: string): string {
  return `/api/clips/${encodeURIComponent(clipId)}/media`;
}

export function phaseClipPath(clipId: string): string {
  return `/api/phase/${encodeURIComponent(clipId)}`;
}

export function phaseSpanPath(clipId: string): string {
  return `/api/phase/${encodeURIComponent(clipId)}/span`;
}

export function phaseFramePath(clipId: string, frameIndex: number): string {
  return `/api/phase/${encodeURIComponent(clipId)}/frames/${frameIndex}`;
}

export function classClipPath(clipId: string): string {
  return `/api/class/${encodeURIComponent(clipId)}`;
}

export function classFramePath(clipId: string, frameIndex: number): string {
  return `/api/class/${encodeURIComponent(clipId)}/frames/${frameIndex}`;
}

export function classSpanPath(clipId: string): string {
  return `/api/class/${encodeURIComponent(clipId)}/span`;
}

export function tripletClipPath(clipId: string): string {
  return `/api/triplet/${encodeURIComponent(clipId)}`;
}

export function tripletFramePath(clipId: string, frameIndex: number): string {
  return `/api/triplet/${encodeURIComponent(clipId)}/frames/${frameIndex}`;
}

export function tripletSpanPath(clipId: string): string {
  return `/api/triplet/${encodeURIComponent(clipId)}/span`;
}

export function tripletRowPath(
  clipId: string,
  frameIndex: number,
  tripletId: number,
): string {
  return `/api/triplet/${encodeURIComponent(clipId)}/frames/${frameIndex}/${tripletId}`;
}

export function vocabPath(): string {
  return "/api/vocab";
}

export function sessionPath(frameIndex?: number): string {
  if (frameIndex == null) {
    return "/api/session";
  }
  return `/api/session?frame_index=${frameIndex}`;
}

export function sessionPredictPath(): string {
  return "/api/session/predict";
}

export function sessionPointPath(
  trackId: number,
  frameIndex: number,
  pointIndex: number,
): string {
  return `/api/session/tracks/${trackId}/frames/${frameIndex}/points/${pointIndex}`;
}

export function annotationSummaryPath(clipId: string): string {
  return `/api/clips/${encodeURIComponent(clipId)}/annotations`;
}

export function annotationFramePath(clipId: string, frameIndex: number): string {
  return `/api/clips/${encodeURIComponent(clipId)}/annotations/frames/${frameIndex}`;
}

export function vocabListPath(listName: string): string {
  return `/api/vocab/${encodeURIComponent(listName)}`;
}

export function vocabRenamePath(listName: string): string {
  return `/api/vocab/${encodeURIComponent(listName)}/rename`;
}

export function vocabDeletePath(listName: string, name: string): string {
  return `/api/vocab/${encodeURIComponent(listName)}/${encodeURIComponent(name)}`;
}

export function vocabTriplesPath(): string {
  return "/api/vocab/triples";
}

export function vocabTripleRenamePath(): string {
  return "/api/vocab/triples/rename";
}

export function vocabTripleDeletePath(
  instrument: string,
  verb: string,
  target: string,
): string {
  const query = new URLSearchParams({ instrument, verb, target });
  return `/api/vocab/triples?${query.toString()}`;
}

export function framePhaseName(
  frames: Record<string, string>,
  index: number,
): string | null {
  const name = frames[String(index)];
  return name ? name : null;
}

export function frameClassTags(
  frames: Record<string, string[]>,
  index: number,
): string[] {
  const tags = frames[String(index)];
  return Array.isArray(tags) ? tags : [];
}

export function toggleClassTag(tags: string[], name: string): string[] {
  if (tags.includes(name)) {
    return tags.filter((tag) => tag !== name);
  }
  return [...tags, name];
}

export function frameTripletRows(
  frames: Record<string, TripletRow[]>,
  index: number,
): TripletRow[] {
  const rows = frames[String(index)];
  return Array.isArray(rows) ? rows : [];
}

export function errorDetail(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
  }
  return fallback;
}

async function readError(response: Response): Promise<string> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return errorDetail(body, `HTTP ${response.status}`);
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<T>;
}

export async function getJsonAllow404<T>(url: string): Promise<T | null> {
  const response = await fetch(url);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<T>;
}

export async function sendJson<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<T>;
}
