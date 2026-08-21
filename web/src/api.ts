export type ClipRow = { id: string; frame_count: number };

export type ClipListResponse = { clips: ClipRow[] };

export type ClipMeta = {
  id: string;
  frame_count: number;
  frames: { index: number; stem: string }[];
};

export type PhaseDoc = { clip_id: string; frames: Record<string, string> };

export type ClassDoc = { clip_id: string; frames: Record<string, string[]> };

export type Vocab = {
  phases: string[];
  class_tags: string[];
};

export function clipDeskPath(clipId: string): string {
  return `/clips/${encodeURIComponent(clipId)}`;
}

export function frameJpegPath(clipId: string, frameIndex: number): string {
  return `/api/clips/${encodeURIComponent(clipId)}/frames/${frameIndex}`;
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

export function vocabPath(): string {
  return "/api/vocab";
}

export function vocabListPath(listName: string): string {
  return `/api/vocab/${encodeURIComponent(listName)}`;
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

export async function sendJson<T>(
  url: string,
  method: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<T>;
}
