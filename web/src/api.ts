/** Surfaces the Account may use: My Tasks, the review queue, the admin console. */
export type MeCapabilities = { admin: boolean; review: boolean; annotate: boolean };

export type TaskState = "Unassigned" | "Labeling" | "Submitted" | "Reviewing" | "Done";

/** One (Clip, Task type) item the server derives this Account's buttons from. */
export type MyItem = {
  clip_id: string;
  task_type: string;
  state: TaskState | string;
  assignee: string | null;
  reviewer: string | null;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  delivered_at: string | null;
  version: number;
  capabilities: Record<string, boolean>;
};

export type Me = {
  username: string;
  roles: { admin: boolean; reviewer: boolean; annotator: boolean };
  capabilities: MeCapabilities;
  item?: MyItem;
};

export type MyItemsResponse = { items: MyItem[] };

export type ItemAction = "submit" | "recall" | "pass" | "reject" | "re_review";

/** The HTTP status carries the meaning a save path needs; the message is for people. */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** A 409 on a save is a stale Clip version: refetch, then let the user retry. */
export const STALE_SAVE_NOTICE =
  "Someone else saved this Clip first. Refreshed — retry your edit.";

export function isVersionConflict(error: unknown): boolean {
  return error instanceof HttpError && error.status === 409;
}

export function saveErrorMessage(error: unknown): string {
  if (isVersionConflict(error)) {
    return STALE_SAVE_NOTICE;
  }
  return error instanceof Error ? error.message : "Write failed";
}

/** A save body carries the held version, so a stale write is a 409, not a silent clobber. */
export function withVersion<T extends object>(
  body: T,
  version: number | undefined,
): T & { version?: number } {
  return version === undefined ? body : { ...body, version };
}

export function mePath(clipId?: string, taskType?: string): string {
  if (clipId === undefined || taskType === undefined) {
    return "/api/me";
  }
  const query = new URLSearchParams({ clip_id: clipId, task_type: taskType });
  return `/api/me?${query.toString()}`;
}

export function myItemsPath(): string {
  return "/api/me/items";
}

export function itemActionPath(
  clipId: string,
  taskType: string,
  action: ItemAction,
): string {
  return `/api/items/${encodeURIComponent(clipId)}/${encodeURIComponent(taskType)}/${action}`;
}

export type ClipRow = { id: string; kind: "jpeg" | "video"; frame_count: number; fps: number };

export type ClipListResponse = { clips: ClipRow[] };

export type ClipMeta = {
  id: string;
  kind: "jpeg" | "video";
  frame_count: number;
  fps: number;
  frames: { index: number; stem: string }[];
};

// Every Clip doc carries the Clip version it was read at: a save echoes it back,
// and a mismatch is a 409.
export type PhaseDoc = { clip_id: string; frames: Record<string, string>; version?: number };

export type ClassDoc = {
  clip_id: string;
  frames: Record<string, string[]>;
  version?: number;
};

export type TripletRow = {
  id: number;
  instrument: string;
  verb: string;
  target: string;
};

export type TripletDoc = {
  clip_id: string;
  frames: Record<string, TripletRow[]>;
  version?: number;
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

/** What the current Account may do with this Clip's Project word list. */
export type VocabPermissions = {
  vocab_edit: boolean;
  registry_write: boolean;
  candidate_create: boolean;
};

/** One picker row as the scoped desk vocab returns it. */
export type VocabPickerItem = {
  id: number;
  kind: RegistryKind;
  name: string;
  instrument: string;
  verb: string;
  target: string;
  candidate: boolean;
};

/** The desk picker for one Clip: its Project's enabled words plus candidates. */
export type ScopedVocab = Vocab & {
  clip_id?: string;
  project_id?: number;
  permissions?: VocabPermissions;
  items?: VocabPickerItem[];
};

export type RegistryKind = "phase" | "class" | "triplet";

export type RegistryItem = {
  id: number;
  kind: RegistryKind;
  name: string;
  instrument: string;
  verb: string;
  target: string;
  archived: boolean;
};

export type RegistryCandidate = {
  id: number;
  project_id: number;
  kind: RegistryKind;
  name: string;
  instrument: string;
  verb: string;
  target: string;
};

export type RegistryProject = {
  id: number;
  name: string;
  enabled_ids: number[];
  candidates: RegistryCandidate[];
};

export type RegistryBrowse = {
  items: RegistryItem[];
  projects: RegistryProject[];
};

export type RegistryVisible = { items: RegistryItem[] };

export type AdminUser = {
  id: number;
  username: string;
  roles: { admin: boolean; reviewer: boolean; annotator: boolean };
  disabled: boolean;
};

export type AdminUsersResponse = { users: AdminUser[] };

export type CreateUserResponse = { user: AdminUser; temporary_password: string };

export type ProjectRow = {
  id: number;
  name: string;
  hospital: string;
  clips: { id: string; kind: string }[];
  /** Admins only: the Accounts this Project's work may be assigned to. */
  members?: string[];
};

export type ProjectsResponse = { projects: ProjectRow[] };

export type ProjectMembersResponse = { members: string[] };

export type ProjectResponse = {
  project: { id: number; name: string; hospital: string };
};

export type TagsResponse = { tags: string[] };

export type ClipTagsResponse = { clip_id: string; tags: string[] };

export type ItemFilters = { project?: string; tag?: string };

/**
 * Whose Clips the directory answers with: `mine` is every Account's default,
 * and `all` is the admin's alone — the server refuses it from anyone else.
 */
export type ClipScope = "mine" | "all";

export type ClipFilters = ItemFilters & { scope?: ClipScope };

export type MaskProvenance = { mask_handoff?: boolean };

export type MaskRle = {
  format: string;
  size: number[];
  counts: number[];
  source?: string;
  track_id?: number;
  model_provenance?: MaskProvenance | null;
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

export type AnnotationSummaryFrame = {
  frame_stem: string;
  frame_index: number | null;
  mask_count: number;
  /** Track ids holding a mask on this Frame: the mask strip and Track Lanes read it. */
  track_ids?: number[];
};

export type AnnotationSummary = {
  clip_id: string;
  tracks: TrackRow[];
  /** Covered Frames only (the mask store keeps no row for an uncovered Frame). */
  frame_count: number;
  frames?: AnnotationSummaryFrame[];
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

export type UndoResponse = {
  undone: boolean;
  session: SessionPublic;
};

export type PropagateDirection = "forward" | "backward" | "both";

export type PropagateJobPublic = {
  job_id: string;
  session_id: string;
  clip_id: string;
  direction: PropagateDirection;
  start_frame_index: number;
  max_frames: number | null;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  frames_done: number;
  frames_total: number;
  current_frame_index: number | null;
  error: string | null;
};

export type WorkerHealth = {
  ready: boolean;
  status: string;
  backend?: string;
  message?: string | null;
};

export type HealthResponse = {
  ok: boolean;
  service: string;
  version: string;
  worker: WorkerHealth;
};

export function healthPath(): string {
  return "/api/health";
}

export function clipDeskPath(clipId: string): string {
  return `/clips/${encodeURIComponent(clipId)}`;
}

export function frameJpegPath(clipId: string, frameIndex: number): string {
  return `/api/clips/${encodeURIComponent(clipId)}/frames/${frameIndex}`;
}

/** One Clip's metadata: its Frame count, kind and source. */
export function clipMetaPath(clipId: string): string {
  return `/api/clips/${encodeURIComponent(clipId)}`;
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

export function vocabPath(clipId?: string): string {
  if (!clipId) {
    return "/api/vocab";
  }
  const query = new URLSearchParams({ clip_id: clipId });
  return `/api/vocab?${query.toString()}`;
}

export function vocabCandidatePath(): string {
  return "/api/vocab/candidates";
}

export function registryPath(): string {
  return "/api/registry";
}

export function adminUsersPath(): string {
  return "/api/admin/users";
}

export function adminUserPath(username: string): string {
  return `/api/admin/users/${encodeURIComponent(username)}`;
}

export function projectsPath(): string {
  return "/api/projects";
}

export function projectPath(projectId: number): string {
  return `/api/projects/${projectId}`;
}

export function adminProjectMembersPath(projectId: number): string {
  return `/api/admin/projects/${projectId}/members`;
}

export function adminProjectMemberPath(projectId: number, username: string): string {
  return `${adminProjectMembersPath(projectId)}/${encodeURIComponent(username)}`;
}

export function tagsPath(): string {
  return "/api/tags";
}

export function clipTagsPath(clipId: string): string {
  return `/api/clips/${encodeURIComponent(clipId)}/tags`;
}

export function itemsPath(filters: ItemFilters = {}): string {
  const query = new URLSearchParams();
  if (filters.project) {
    query.set("project", filters.project);
  }
  if (filters.tag) {
    query.set("tag", filters.tag);
  }
  const suffix = query.toString();
  return suffix ? `/api/items?${suffix}` : "/api/items";
}

export function clipsPath(filters: ClipFilters = {}): string {
  const query = new URLSearchParams();
  if (filters.project) {
    query.set("project", filters.project);
  }
  if (filters.tag) {
    query.set("tag", filters.tag);
  }
  if (filters.scope) {
    query.set("scope", filters.scope);
  }
  const suffix = query.toString();
  return suffix ? `/api/clips?${suffix}` : "/api/clips";
}

export function deliverPath(clipId: string, taskType: string): string {
  return `/api/items/${encodeURIComponent(clipId)}/${encodeURIComponent(taskType)}/deliver`;
}

export function registryVisiblePath(projectId: number): string {
  return `/api/registry/visible?project_id=${projectId}`;
}

export function registryRenamePath(vocabId: number): string {
  return `/api/registry/${vocabId}/rename`;
}

export function registryArchivePath(vocabId: number): string {
  return `/api/registry/${vocabId}/archive`;
}

export function registryRestorePath(vocabId: number): string {
  return `/api/registry/${vocabId}/restore`;
}

export function registryEnablePath(vocabId: number): string {
  return `/api/registry/${vocabId}/enable`;
}

export function registryDisablePath(vocabId: number): string {
  return `/api/registry/${vocabId}/disable`;
}

export function registryCandidatesPath(): string {
  return "/api/registry/candidates";
}

export function registryCandidatePath(candidateId: number): string {
  return `/api/registry/candidates/${candidateId}`;
}

export function registryPromotePath(candidateId: number): string {
  return `/api/registry/candidates/${candidateId}/promote`;
}

export function registryLabel(item: {
  kind: string;
  name: string;
  instrument: string;
  verb: string;
  target: string;
}): string {
  if (item.kind === "triplet") {
    return `${item.instrument} / ${item.verb} / ${item.target}`;
  }
  return item.name;
}

export function sessionPath(frameIndex?: number, clipId?: string): string {
  const params = new URLSearchParams();
  if (frameIndex != null) {
    params.set("frame_index", String(frameIndex));
  }
  if (clipId) {
    params.set("clip_id", clipId);
  }
  const query = params.toString();
  return query ? `/api/session?${query}` : "/api/session";
}

export function sessionPredictPath(): string {
  return "/api/session/predict";
}

export function sessionPointPath(
  trackId: number,
  frameIndex: number,
  pointIndex: number,
  clipId?: string,
): string {
  const base = `/api/session/tracks/${trackId}/frames/${frameIndex}/points/${pointIndex}`;
  return clipId ? `${base}?clip_id=${encodeURIComponent(clipId)}` : base;
}

export function sessionFrameMaskPath(
  trackId: number,
  frameIndex: number,
  clipId?: string,
): string {
  const base = `/api/session/tracks/${trackId}/frames/${frameIndex}`;
  return clipId ? `${base}?clip_id=${encodeURIComponent(clipId)}` : base;
}

export function sessionTrackPath(trackId: number, clipId?: string): string {
  const base = `/api/session/tracks/${trackId}`;
  return clipId ? `${base}?clip_id=${encodeURIComponent(clipId)}` : base;
}

export function sessionUndoPath(): string {
  return "/api/session/undo";
}

export function sessionPropagatePath(): string {
  return "/api/session/propagate";
}

export function jobPath(jobId: string): string {
  return `/api/jobs/${encodeURIComponent(jobId)}`;
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
  const response = await fetch(url, { credentials: "include" });
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
    credentials: "include",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new HttpError(response.status, await readError(response));
  }
  return response.json() as Promise<T>;
}
