export type ClipRow = { id: string; frame_count: number };

export type ClipListResponse = { clips: ClipRow[] };

export type ClipMeta = {
  id: string;
  frame_count: number;
  frames: { index: number; stem: string }[];
};

export function clipDeskPath(clipId: string): string {
  return `/clips/${encodeURIComponent(clipId)}`;
}

export function frameJpegPath(clipId: string, frameIndex: number): string {
  return `/api/clips/${encodeURIComponent(clipId)}/frames/${frameIndex}`;
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

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    throw new Error(errorDetail(body, `HTTP ${response.status}`));
  }
  return response.json() as Promise<T>;
}
