"""In-memory Session facade: single active Session + Predict + Propagate Job."""

from __future__ import annotations

import threading
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Literal

from endo_label import catalog
from endo_label.mask import annotations
from endo_label.config import Settings
from endo_label.mask.mask_codec import (
    MASK_FORMAT,
    is_rle_mask,
    public_mask_fields,
)
from endo_label.mask.predictor import MAX_TRACKS, DetectedInstance, FakePredictor, Predictor, color_for_track
from endo_label.mask.scribble import (
    SCRIBBLE_WIDTH_MAX,
    SCRIBBLE_WIDTH_MIN,
    ScribbleModel,
    build_scribble,
)

PropagateDirection = Literal["forward", "backward", "both"]
VALID_DIRECTIONS = frozenset({"forward", "backward", "both"})
VALID_REVIEW = frozenset({"accepted", "rejected"})


class SessionError(Exception):
    """Base session failure."""


class SessionConflict(SessionError):
    """Concept change needs reset, or a Propagate Job blocks the edit."""


class SessionBusy(SessionError):
    """Another inference holds the global lock; try again shortly."""


class SessionNotFound(SessionError):
    """No active Session."""


class SessionClipNotFound(SessionError):
    """Clip id not in catalog."""


class SessionFrameNotFound(SessionError):
    """Frame index out of range for the Session clip."""


class BadPredictRequest(SessionError):
    """Invalid Predict payload (e.g. empty concept text)."""


class TrackNotFound(SessionError):
    """Track id not in the active Session."""


class JobNotFound(SessionError):
    """Propagate Job id unknown."""


class BadPropagateRequest(SessionError):
    """Invalid Propagate payload."""


class BadReviewRequest(SessionError):
    """Invalid Review Decision payload."""


def _copy_mask(mask: dict[str, Any]) -> dict[str, Any]:
    """Independent copy of an rle_fg payload (counts/size lists included)."""
    out = dict(mask)
    out["size"] = list(out.get("size") or [])
    out["counts"] = list(out.get("counts") or [])
    return out


@dataclass
class _CellSnapshot:
    """Pre-edit state of one Track-on-Frame, for Undo (no Redo)."""

    track_id: int
    frame_index: int
    track_existed: bool
    mask: dict[str, Any] | None
    score: float | None
    geometric_memory: list[dict[str, Any]]
    scribble_mask: dict[str, Any] | None


class WorkerNotReady(SessionError):
    """SAM 3.1 worker failed to load or is not ready (OOM / checkpoint)."""


class PredictorRuntimeError(SessionError):
    """Model error during Predict/Propagate (not load readiness)."""


def _copy_points(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Copy leftover Geometric Prompts as {x, y, positive}."""
    return [
        {"x": p["x"], "y": p["y"], "positive": p["positive"]} for p in points
    ]


def _prompt_points(
    points: list[list[float]], point_labels: list[int]
) -> list[dict[str, Any]]:
    """HTTP this-request points as Geometric Memory items."""
    return [
        {"x": float(pt[0]), "y": float(pt[1]), "positive": lab == 1}
        for pt, lab in zip(points, point_labels)
    ]


def _merge_geometry_points(
    stored: list[dict[str, Any]],
    points: list[list[float]],
    point_labels: list[int],
) -> tuple[list[list[float]], list[int]]:
    """Stored leftover points first, then this request."""
    merged_pts = [[float(p["x"]), float(p["y"])] for p in stored]
    merged_labs = [1 if p["positive"] else 0 for p in stored]
    merged_pts.extend([list(pt) for pt in points])
    merged_labs.extend(list(point_labels))
    return merged_pts, merged_labs


def _mask_payload(
    *,
    mask: dict[str, Any],
    source: str,
    review_decision: str | None = None,
    model_provenance: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Attach Source / Review Decision / Model Provenance to an rle_fg mask."""
    out = public_mask_fields(mask)
    out["format"] = out.get("format") or MASK_FORMAT
    out["source"] = source
    out["review_decision"] = review_decision
    if model_provenance is not None:
        out["model_provenance"] = dict(model_provenance)
    return out


@dataclass
class TrackState:
    track_id: int
    label: str
    color: str
    score: float | None
    # frame_index -> mask payload dict
    masks: dict[int, dict[str, Any]] = field(default_factory=dict)
    # frame_index -> leftover Geometric Prompts (Session only)
    geometric_memory: dict[int, list[dict[str, Any]]] = field(default_factory=dict)

    def to_public(self, *, frame_index: int | None = None) -> dict[str, Any]:
        out: dict[str, Any] = {
            "track_id": self.track_id,
            "label": self.label,
            "color": self.color,
            "score": self.score,
        }
        if frame_index is not None and frame_index in self.masks:
            out["mask"] = self.masks[frame_index]
        if frame_index is not None:
            out["geometric_memory"] = _copy_points(
                self.geometric_memory.get(frame_index, [])
            )
        return out


@dataclass
class SessionState:
    session_id: str
    clip_id: str
    concept_text: str | None = None
    tracks: list[TrackState] = field(default_factory=list)
    # (track_id, frame_index) -> last silhouette loaded into Scribble
    # mask-memory. Session-owned mirror; ScribbleModel has no getter, and Undo
    # needs the pre-edit silhouette to restore through load/clear only.
    scribble_memory: dict[tuple[int, int], dict[str, Any]] = field(
        default_factory=dict
    )
    # One-way Undo stack: pre-edit cell snapshots, newest last.
    undo_stack: list[_CellSnapshot] = field(default_factory=list)


@dataclass
class PredictResult:
    frame_index: int
    empty: bool
    message: str | None
    tracks: list[dict[str, Any]]


@dataclass
class PropagateJob:
    job_id: str
    session_id: str
    clip_id: str
    direction: str
    start_frame_index: int
    max_frames: int | None
    status: str  # queued | running | completed | failed
    progress: float = 0.0
    frames_done: int = 0
    frames_total: int = 0
    current_frame_index: int | None = None
    error: str | None = None
    # Frames still to fill (seed already present); processed on status poll.
    pending_frames: list[int] = field(default_factory=list)
    # track_id -> seed pixel mask at start_frame_index
    seed_masks: dict[int, dict[str, Any]] = field(default_factory=dict)
    # Owner Account (Sessions are keyed by (account, Clip)).
    account_id: int = 0

    def to_public(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "session_id": self.session_id,
            "clip_id": self.clip_id,
            "direction": self.direction,
            "start_frame_index": self.start_frame_index,
            "max_frames": self.max_frames,
            "status": self.status,
            "progress": self.progress,
            "frames_done": self.frames_done,
            "frames_total": self.frames_total,
            "current_frame_index": self.current_frame_index,
            "error": self.error,
        }


class SessionManager:
    """Sessions keyed by (Account, Clip) over one shared predictor.

    The predictor instance is process-global and holds per-Clip inference
    state, so every inference call runs under one lock. Sessions survive Clip
    switches and are dropped least-recently-used past the configured caps.
    """

    def __init__(
        self,
        settings: Settings,
        predictor: Predictor | None = None,
        scribble: ScribbleModel | None = None,
    ) -> None:
        self._settings = settings
        self._predictor: Predictor = predictor if predictor is not None else FakePredictor()
        self._scribble: ScribbleModel = (
            scribble if scribble is not None else build_scribble(settings)
        )
        # (account_id, clip_id) -> SessionState. OrderedDict is the LRU order.
        self._sessions: OrderedDict[tuple[int, str], SessionState] = OrderedDict()
        # Session this call operates on; guarded by the lock.
        self._current_key: tuple[int, str] | None = None
        # account_id -> the Clip whose Session that Account touched last.
        self._active_clip: dict[int, str] = {}
        # Clip the shared predictor has open (None when no model Session).
        self._predictor_clip: str | None = None
        self._jobs: dict[str, PropagateJob] = {}
        self._active_job_id: str | None = None
        # FastAPI sync routes run on a threadpool. Overlapping inference calls
        # duplicate SAM2 state for the same obj_id, so one RLock serializes
        # inference and Session bookkeeping; Predict waits on it with a
        # timeout instead of blocking forever.
        self._lock = threading.RLock()

    @property
    def _session(self) -> SessionState | None:
        if self._current_key is None:
            return None
        return self._sessions.get(self._current_key)

    @_session.setter
    def _session(self, value: SessionState | None) -> None:
        if self._current_key is None:
            return
        if value is None:
            self._sessions.pop(self._current_key, None)
        else:
            self._sessions[self._current_key] = value
            self._sessions.move_to_end(self._current_key)

    @property
    def active(self) -> bool:
        return bool(self._sessions)

    def worker_health(self) -> dict[str, Any]:
        h = dict(self._predictor.health())
        h["session_active"] = self.active
        return h

    # --- keying, LRU, predictor Clip ------------------------------------

    def _session_caps(self) -> tuple[int, int]:
        per_user = int(getattr(self._settings, "mask_sessions_per_user", 2) or 2)
        global_cap = int(getattr(self._settings, "mask_sessions_global", 8) or 8)
        return max(1, per_user), max(1, global_cap)

    def _inference_timeout(self) -> float:
        raw = getattr(self._settings, "mask_inference_timeout", 30.0)
        try:
            seconds = float(raw)
        except (TypeError, ValueError):
            seconds = 30.0
        return seconds if seconds > 0 else 30.0

    def active_clip(self, account_id: int) -> str | None:
        """Clip of the Session this Account touched last, if any."""
        return self._active_clip.get(int(account_id))

    def _resolve_clip(self, account_id: int, clip_id: str | None) -> str | None:
        if clip_id:
            return str(clip_id)
        return self._active_clip.get(int(account_id))

    def _set_current(self, key: tuple[int, str]) -> None:
        self._current_key = key
        self._active_clip[key[0]] = key[1]
        if key in self._sessions:
            self._sessions.move_to_end(key)

    def _select_session(
        self, account_id: int, clip_id: str | None, *, auto_open: bool
    ) -> SessionState:
        """Point the manager at this Account's Session, opening it if allowed."""
        resolved = self._resolve_clip(account_id, clip_id)
        if resolved is None:
            raise SessionNotFound("no active Session")
        key = (int(account_id), resolved)
        if key not in self._sessions:
            if not auto_open:
                raise SessionNotFound(f"No Session on clip {resolved!r}")
            self._open_session(int(account_id), resolved, load_annotations=True)
        self._set_current(key)
        session = self._session
        assert session is not None
        return session

    def _open_session(
        self, account_id: int, clip_id: str, *, load_annotations: bool
    ) -> SessionState:
        key = (int(account_id), str(clip_id))
        existing = self._sessions.get(key)
        if existing is not None:
            self._set_current(key)
            if load_annotations and not existing.tracks:
                self._hydrate_from_annotations(clip_id)
            return existing
        health = self._predictor.health()
        if not health.get("ready", True):
            raise WorkerNotReady(
                health.get("message")
                or "SAM 3.1 worker is not ready"
            )
        try:
            catalog.clip_meta(self._settings, clip_id)
        except catalog.ClipNotFound as exc:
            raise SessionClipNotFound(clip_id) from exc

        session = SessionState(session_id=str(uuid.uuid4()), clip_id=clip_id)
        self._sessions[key] = session
        self._set_current(key)
        try:
            self._ensure_predictor_clip(clip_id)
            if load_annotations:
                self._hydrate_from_annotations(clip_id)
        except Exception:
            # A Session that never opened must not linger: the next open would
            # find it "existing" and answer 201 with a Session the predictor
            # does not hold.
            self._sessions.pop(key, None)
            if self._current_key == key:
                self._current_key = None
            if self._active_clip.get(key[0]) == key[1]:
                self._active_clip.pop(key[0], None)
            raise
        self._enforce_caps()
        return session

    def _ensure_predictor_clip(self, clip_id: str) -> None:
        """Make the shared predictor hold this Clip's model Session."""
        if self._predictor_clip == clip_id:
            return
        try:
            source = catalog.source_path(self._settings, clip_id)
        except catalog.ClipNotFound as exc:
            raise SessionClipNotFound(clip_id) from exc
        try:
            self._predictor.open_clip(clip_id=clip_id, frames_dir=str(source))
        except Exception as exc:
            raise WorkerNotReady(str(exc)) from exc
        self._predictor_clip = clip_id

    def _enforce_caps(self) -> None:
        """Evict least-recently-used Sessions past the global / per-user caps."""
        per_user, global_cap = self._session_caps()
        while len(self._sessions) > global_cap:
            self._evict(next(iter(self._sessions)))
        while True:
            counts: dict[int, int] = {}
            for account_id, _clip in self._sessions:
                counts[account_id] = counts.get(account_id, 0) + 1
            over = next(
                (acct for acct, count in counts.items() if count > per_user),
                None,
            )
            if over is None:
                return
            self._evict(next(key for key in self._sessions if key[0] == over))

    def _evict(self, key: tuple[int, str]) -> None:
        session = self._sessions.pop(key, None)
        if session is None:
            return
        if self._active_clip.get(key[0]) == key[1]:
            self._active_clip.pop(key[0], None)
        if self._current_key == key:
            self._current_key = None
        self._fail_active_job("Session evicted", session_id=session.session_id)
        try:
            self._scribble.clear_memory(session_id=session.session_id)
        except Exception:
            pass
        if self._predictor_clip == session.clip_id and not any(
            other.clip_id == session.clip_id
            for other_key, other in self._sessions.items()
            if other_key != key
        ):
            try:
                self._predictor.close_clip()
            except Exception:
                pass
            self._predictor_clip = None

    # --- public reads ---------------------------------------------------

    def get_public(
        self,
        *,
        account_id: int | None = None,
        clip_id: str | None = None,
        frame_index: int | None = None,
    ) -> dict[str, Any]:
        if account_id is None:
            s = self._session
        else:
            resolved = self._resolve_clip(account_id, clip_id)
            if resolved is None:
                return {"active": False}
            key = (int(account_id), resolved)
            s = self._sessions.get(key)
            if s is None:
                return {"active": False}
            self._set_current(key)
        if s is None:
            return {"active": False}
        return {
            "active": True,
            "session_id": s.session_id,
            "clip_id": s.clip_id,
            "concept_text": s.concept_text,
            "tracks": [t.to_public(frame_index=frame_index) for t in s.tracks],
            "propagate_job_id": self._active_job_id
            if self._job_is_blocking(s.session_id)
            else None,
        }

    # --- Session lifecycle ----------------------------------------------

    def create(
        self,
        account_id: int,
        clip_id: str,
        *,
        load_annotations: bool = False,
    ) -> dict[str, Any]:
        with self._lock:
            self._open_session(
                int(account_id), clip_id, load_annotations=load_annotations
            )
            return self.get_public()

    def close(self, account_id: int, clip_id: str | None = None) -> dict[str, Any]:
        with self._lock:
            self._select_session(account_id, clip_id, auto_open=False)
            return self._close_unlocked()

    def _close_unlocked(self) -> dict[str, Any]:
        if self._session is None:
            raise SessionNotFound("no active Session")
        s = self._session
        self._fail_active_job("Session closed", session_id=s.session_id)
        if self._predictor_clip == s.clip_id and not any(
            other.clip_id == s.clip_id
            for key, other in self._sessions.items()
            if key != self._current_key
        ):
            try:
                self._predictor.close_clip()
            except Exception:
                pass
            self._predictor_clip = None
        self._scribble_clear_session()
        self._session = None
        return {"active": False}

    def reset(self, account_id: int, clip_id: str | None = None) -> dict[str, Any]:
        with self._lock:
            self._select_session(account_id, clip_id, auto_open=False)
            return self._reset_unlocked()

    def _reset_unlocked(self) -> dict[str, Any]:
        if self._session is None:
            raise SessionNotFound("no active Session")
        self._ensure_not_propagating()
        s = self._session
        self._ensure_predictor_clip(s.clip_id)
        try:
            self._predictor.reset_clip()
        except Exception as exc:
            raise WorkerNotReady(str(exc)) from exc
        self._scribble_clear_session()
        self._session = SessionState(
            session_id=s.session_id,
            clip_id=s.clip_id,
        )
        return self.get_public()

    def predict_concept(
        self,
        *,
        account_id: int,
        clip_id: str | None = None,
        frame_index: int,
        text: str,
    ) -> PredictResult:
        """Backward-compatible Concept-only Predict."""
        return self.predict(
            account_id=account_id,
            clip_id=clip_id,
            frame_index=frame_index,
            text=text,
        )

    def predict(
        self,
        *,
        account_id: int,
        clip_id: str | None = None,
        frame_index: int,
        text: str | None = None,
        points: list[list[float]] | None = None,
        point_labels: list[int] | None = None,
        boxes: list[list[float]] | None = None,
        box_labels: list[int] | None = None,
        scribbles: list[list[list[float]]] | None = None,
        scribble_labels: list[int] | None = None,
        scribble_widths: list[int] | None = None,
        track_id: int | None = None,
        clear_old_points: bool = False,
        clear_old_boxes: bool = False,
        use_mask_prior: bool = False,
    ) -> PredictResult:
        # Predict waits synchronously for the shared predictor; on timeout the
        # UI shows the agreed "someone else is inferring" error.
        acquired = self._lock.acquire(timeout=self._inference_timeout())
        if not acquired:
            raise SessionBusy(
                "Another inference is running; try again later"
            )
        try:
            self._select_session(account_id, clip_id, auto_open=True)
            return self._predict_unlocked(
                frame_index=frame_index,
                text=text,
                points=points,
                point_labels=point_labels,
                boxes=boxes,
                box_labels=box_labels,
                scribbles=scribbles,
                scribble_labels=scribble_labels,
                scribble_widths=scribble_widths,
                track_id=track_id,
                clear_old_points=clear_old_points,
                clear_old_boxes=clear_old_boxes,
                use_mask_prior=use_mask_prior,
            )
        finally:
            self._lock.release()

    def _predict_unlocked(
        self,
        *,
        frame_index: int,
        text: str | None = None,
        points: list[list[float]] | None = None,
        point_labels: list[int] | None = None,
        boxes: list[list[float]] | None = None,
        box_labels: list[int] | None = None,
        scribbles: list[list[list[float]]] | None = None,
        scribble_labels: list[int] | None = None,
        scribble_widths: list[int] | None = None,
        track_id: int | None = None,
        clear_old_points: bool = False,
        clear_old_boxes: bool = False,
        use_mask_prior: bool = False,
    ) -> PredictResult:
        # HTTP clear_old_* stay on the wire; ADR 0007 attach ignores them.
        del clear_old_points, clear_old_boxes
        if self._session is None:
            raise SessionNotFound("no active Session")
        self._ensure_not_propagating()

        pts = list(points or [])
        pt_labs = list(point_labels or [])
        bxs = list(boxes or [])
        bx_labs = list(box_labels or [])
        scribs = list(scribbles or [])
        scrib_labs = list(scribble_labels or [])
        scrib_widths = list(scribble_widths) if scribble_widths is not None else None

        concept = (text or "").strip()
        has_text = bool(concept)
        has_scribble = bool(scribs)
        has_geo = bool(pts) or bool(bxs) or has_scribble

        # Mask Prior alone (refine with prior, no new geometry) needs track_id
        if not has_text and not has_geo:
            if use_mask_prior and track_id is not None:
                has_geo = True  # treat as geometry refine path
            else:
                raise BadPredictRequest(
                    "Predict requires a Concept Prompt (text) and/or Geometric "
                    "Prompts (points) or Scribbles"
                )

        self._validate_geometry(pts, pt_labs, bxs, bx_labs)
        self._validate_scribbles(scribs, scrib_labs)
        self._validate_scribble_widths(scribs, scrib_widths)

        s = self._session
        try:
            catalog.frame_path(self._settings, s.clip_id, frame_index)
        except catalog.ClipNotFound as exc:
            raise SessionClipNotFound(s.clip_id) from exc
        except catalog.FrameNotFound as exc:
            raise SessionFrameNotFound(str(frame_index)) from exc

        if has_text:
            if s.concept_text is not None and concept != s.concept_text:
                raise SessionConflict(
                    "Concept Prompt changed; call POST /api/session/reset before "
                    "Predict with a new concept"
                )

        # Concept-only: multi-instance replace (existing ticket 03 path)
        if has_text and not has_geo:
            return self._run_concept(frame_index=frame_index, concept=concept)

        # Geometry path (optionally with concept text locked on Session)
        return self._run_geometry(
            frame_index=frame_index,
            concept=concept if has_text else None,
            points=pts,
            point_labels=pt_labs,
            boxes=bxs,
            box_labels=bx_labs,
            scribbles=scribs,
            scribble_labels=scrib_labs,
            scribble_widths=scrib_widths,
            track_id=track_id,
            use_mask_prior=use_mask_prior,
        )

    def update_track_label(
        self,
        account_id: int,
        track_id: int,
        label: str,
        clip_id: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._select_session(account_id, clip_id, auto_open=False)
            return self._update_track_label_unlocked(track_id, label)

    def _update_track_label_unlocked(
        self, track_id: int, label: str
    ) -> dict[str, Any]:
        if self._session is None:
            raise SessionNotFound("no active Session")
        self._ensure_not_propagating()
        track = self._find_track(track_id)
        cleaned = (label or "").strip()
        if not cleaned:
            raise BadPredictRequest("Track Label must be non-empty")
        track.label = cleaned
        # ADR 0025: a Track Label patch writes Annotation immediately.
        self._persist_session()
        return self.get_public()

    def delete_track(
        self, account_id: int, track_id: int, clip_id: str | None = None
    ) -> dict[str, Any]:
        with self._lock:
            self._select_session(account_id, clip_id, auto_open=False)
            return self._delete_track_unlocked(track_id)

    def _delete_track_unlocked(self, track_id: int) -> dict[str, Any]:
        if self._session is None:
            raise SessionNotFound("no active Session")
        self._ensure_not_propagating()
        s = self._session
        before = len(s.tracks)
        s.tracks = [t for t in s.tracks if t.track_id != track_id]
        if len(s.tracks) == before:
            raise TrackNotFound(f"Track not found: {track_id}")
        self._scribble_clear_track(track_id=track_id)
        self._prune_undo_track(track_id)
        try:
            self._predictor.remove_track(track_id)
        except Exception:
            pass
        # ADR 0025: the Track delete is a mask edit, so Annotation loses the
        # Track and every mask under it right away. The desk reads the mask
        # store for the picture, the mask strip and the Track Lanes, so a delete
        # that only touched the Session would leave a phantom behind.
        self._persist_session()
        return self.get_public()

    def clear_frame_mask(
        self,
        account_id: int,
        track_id: int,
        frame_index: int,
        clip_id: str | None = None,
    ) -> dict[str, Any]:
        """Drop Active-Track pixel mask on one Frame; Track stays."""
        with self._lock:
            self._select_session(account_id, clip_id, auto_open=False)
            return self._clear_frame_mask_unlocked(track_id, frame_index)

    def _clear_frame_mask_unlocked(
        self, track_id: int, frame_index: int
    ) -> dict[str, Any]:
        if self._session is None:
            raise SessionNotFound("no active Session")
        self._ensure_not_propagating()
        s = self._session
        try:
            catalog.frame_path(self._settings, s.clip_id, frame_index)
        except catalog.ClipNotFound as exc:
            raise SessionClipNotFound(s.clip_id) from exc
        except catalog.FrameNotFound as exc:
            raise SessionFrameNotFound(str(frame_index)) from exc

        track = self._find_track(track_id)
        if frame_index not in track.masks:
            raise TrackNotFound(
                f"Track {track_id} has no mask on frame {frame_index}"
            )
        s.undo_stack.append(
            _CellSnapshot(
                track_id=track_id,
                frame_index=frame_index,
                track_existed=True,
                mask=_copy_mask(track.masks[frame_index]),
                score=track.score,
                geometric_memory=_copy_points(
                    track.geometric_memory.get(frame_index, [])
                ),
                scribble_mask=_copy_mask(cell)
                if (cell := s.scribble_memory.get((track_id, frame_index)))
                else None,
            )
        )
        del track.masks[frame_index]
        track.geometric_memory.pop(frame_index, None)
        self._scribble_clear_cell(
            track_id=track_id, frame_index=frame_index
        )
        try:
            self._predictor.clear_frame_mask(
                frame_index=frame_index, track_id=track_id
            )
        except Exception:
            pass
        self._persist_session()
        return self.get_public(frame_index=frame_index)

    def drop_geometric_point(
        self,
        account_id: int,
        track_id: int,
        frame_index: int,
        point_index: int,
        clip_id: str | None = None,
    ) -> dict[str, Any]:
        """Drop one leftover point, then Predict remaining list (maybe empty) + Prior."""
        with self._lock:
            self._select_session(account_id, clip_id, auto_open=False)
            return self._drop_geometric_point_unlocked(
                track_id, frame_index, point_index
            )

    def _drop_geometric_point_unlocked(
        self, track_id: int, frame_index: int, point_index: int
    ) -> dict[str, Any]:
        if self._session is None:
            raise SessionNotFound("no active Session")
        self._ensure_not_propagating()
        s = self._session
        try:
            catalog.frame_path(self._settings, s.clip_id, frame_index)
        except catalog.ClipNotFound as exc:
            raise SessionClipNotFound(s.clip_id) from exc
        except catalog.FrameNotFound as exc:
            raise SessionFrameNotFound(str(frame_index)) from exc

        track = self._find_track(track_id)
        stored = _copy_points(track.geometric_memory.get(frame_index, []))
        if point_index < 0 or point_index >= len(stored):
            raise TrackNotFound(
                f"Track {track_id} has no leftover point {point_index} "
                f"on frame {frame_index}"
            )
        remaining = stored[:point_index] + stored[point_index + 1 :]
        self._run_geometry(
            frame_index=frame_index,
            concept=None,
            points=[],
            point_labels=[],
            boxes=[],
            box_labels=[],
            scribbles=[],
            scribble_labels=[],
            scribble_widths=None,
            track_id=track_id,
            geometric_memory=remaining,
        )
        return self.get_public(frame_index=frame_index)

    def undo(
        self,
        *,
        account_id: int,
        clip_id: str | None = None,
        frame_index: int,
    ) -> dict[str, Any]:
        """Restore this Frame's last committed cell edit; empty stack is a no-op."""
        with self._lock:
            self._select_session(account_id, clip_id, auto_open=False)
            return self._undo_unlocked(frame_index=frame_index)

    def _undo_unlocked(self, *, frame_index: int) -> dict[str, Any]:
        if self._session is None:
            raise SessionNotFound("no active Session")
        self._ensure_not_propagating()
        s = self._session
        try:
            catalog.frame_path(self._settings, s.clip_id, frame_index)
        except catalog.ClipNotFound as exc:
            raise SessionClipNotFound(s.clip_id) from exc
        except catalog.FrameNotFound as exc:
            raise SessionFrameNotFound(str(frame_index)) from exc

        pos = next(
            (
                i
                for i in range(len(s.undo_stack) - 1, -1, -1)
                if s.undo_stack[i].frame_index == frame_index
            ),
            None,
        )
        if pos is None:
            return {
                "undone": False,
                "session": self.get_public(frame_index=frame_index),
            }

        snap = s.undo_stack.pop(pos)
        track = next(
            (t for t in s.tracks if t.track_id == snap.track_id), None
        )
        if track is None:
            # Stale snapshot (Track removed outside its stack entries).
            return {
                "undone": False,
                "session": self.get_public(frame_index=frame_index),
            }
        track.score = snap.score
        if snap.mask is None:
            track.masks.pop(frame_index, None)
            track.geometric_memory.pop(frame_index, None)
            self._scribble_clear_cell(
                track_id=track.track_id, frame_index=frame_index
            )
            if not snap.track_existed and not track.masks:
                # The undone edit created this Track and nothing is left.
                s.tracks.remove(track)
                self._scribble_clear_track(track_id=track.track_id)
                self._prune_undo_track(track.track_id)
                try:
                    self._predictor.remove_track(track.track_id)
                except Exception:
                    pass
        else:
            track.masks[frame_index] = _copy_mask(snap.mask)
            track.geometric_memory[frame_index] = _copy_points(
                snap.geometric_memory
            )
            self._scribble_clear_cell(
                track_id=track.track_id, frame_index=frame_index
            )
            if snap.scribble_mask is not None:
                self._scribble_load(
                    track_id=track.track_id,
                    frame_index=frame_index,
                    mask=snap.scribble_mask,
                )
        # ADR 0025: Undo restore writes Annotation immediately.
        self._persist_session()
        return {
            "undone": True,
            "session": self.get_public(frame_index=frame_index),
        }

    def start_propagate(
        self,
        account_id: int,
        clip_id: str | None = None,
        *,
        direction: str,
        start_frame_index: int,
        max_frames: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._select_session(account_id, clip_id, auto_open=True)
            return self._start_propagate_unlocked(
                direction=direction,
                start_frame_index=start_frame_index,
                max_frames=max_frames,
            )

    def _start_propagate_unlocked(
        self,
        *,
        direction: str,
        start_frame_index: int,
        max_frames: int | None = None,
    ) -> dict[str, Any]:
        if self._session is None:
            raise SessionNotFound("no active Session")
        self._ensure_not_propagating(global_job=True)

        direction = (direction or "").strip().lower()
        if direction not in VALID_DIRECTIONS:
            raise BadPropagateRequest(
                "direction must be one of: forward, backward, both"
            )
        if max_frames is not None and max_frames < 0:
            raise BadPropagateRequest("max_frames must be >= 0 when set")

        s = self._session
        try:
            meta = catalog.clip_meta(self._settings, s.clip_id)
        except catalog.ClipNotFound as exc:
            raise SessionClipNotFound(s.clip_id) from exc

        frame_count = int(meta["frame_count"])
        if frame_count == 0:
            raise BadPropagateRequest("Clip has no frames")
        if start_frame_index < 0 or start_frame_index >= frame_count:
            raise SessionFrameNotFound(str(start_frame_index))

        seed_masks: dict[int, dict[str, Any]] = {}
        for track in s.tracks:
            mask = track.masks.get(start_frame_index)
            if not mask:
                continue
            if is_rle_mask(mask):
                seed_masks[track.track_id] = public_mask_fields(mask)

        if not seed_masks:
            raise BadPropagateRequest(
                f"No Track masks on start frame {start_frame_index}; "
                "Predict a seed before Propagate"
            )

        # Ensure model Session knows Mask Prior / Annotation seeds
        for tid, seed in seed_masks.items():
            try:
                self._predictor.seed_track(
                    frame_index=start_frame_index,
                    track_id=tid,
                    mask=seed,
                )
            except Exception as exc:
                raise PredictorRuntimeError(str(exc)) from exc

        targets = self._planned_frames(
            direction=direction,
            start=start_frame_index,
            max_frames=max_frames,
            frame_count=frame_count,
        )

        job = PropagateJob(
            job_id=str(uuid.uuid4()),
            session_id=s.session_id,
            clip_id=s.clip_id,
            account_id=self._current_key[0] if self._current_key else 0,
            direction=direction,
            start_frame_index=start_frame_index,
            max_frames=max_frames,
            status="queued",
            progress=0.0,
            frames_done=0,
            frames_total=len(targets),
            current_frame_index=start_frame_index,
            pending_frames=targets,
            seed_masks=seed_masks,
        )
        if job.frames_total == 0:
            job.status = "completed"
            job.progress = 1.0

        self._jobs[job.job_id] = job
        self._active_job_id = (
            job.job_id if job.status in ("queued", "running") else None
        )
        if job.status == "completed":
            # Zero-range job still counts as successful Propagate for auto-save.
            self._maybe_auto_save(job)
        return job.to_public()

    def get_job(self, account_id: int, job_id: str) -> dict[str, Any]:
        job = self._jobs.get(job_id)
        if job is None or int(job.account_id) != int(account_id):
            raise JobNotFound(f"Propagate Job not found: {job_id}")
        if job.status in ("queued", "running"):
            # One frame per poll; the lock keeps concurrent polls from
            # double-consuming pending_frames.
            with self._lock:
                key = (int(job.account_id), job.clip_id)
                if key in self._sessions:
                    self._set_current(key)
                self._advance_job_stream(job)
        return job.to_public()

    def save_annotations(
        self, account_id: int, clip_id: str | None = None
    ) -> dict[str, Any]:
        """Explicit Save: write full Session Annotation to disk (replace)."""
        with self._lock:
            self._select_session(account_id, clip_id, auto_open=False)
            return self._save_annotations_unlocked()

    def _save_annotations_unlocked(self) -> dict[str, Any]:
        if self._session is None:
            raise SessionNotFound("no active Session")
        s = self._session
        try:
            catalog.clip_meta(self._settings, s.clip_id)
        except catalog.ClipNotFound as exc:
            raise SessionClipNotFound(s.clip_id) from exc

        return annotations.save_rows(
            self._settings, s.clip_id, self._tracks_as_dicts()
        )

    def set_review(
        self,
        account_id: int,
        *,
        clip_id: str,
        frame_index: int,
        track_id: int,
        decision: str | None,
    ) -> dict[str, Any]:
        with self._lock:
            self._select_session(account_id, clip_id, auto_open=False)
            return self._set_review_unlocked(
                clip_id=clip_id,
                frame_index=frame_index,
                track_id=track_id,
                decision=decision,
            )

    def _set_review_unlocked(
        self,
        *,
        clip_id: str,
        frame_index: int,
        track_id: int,
        decision: str | None,
    ) -> dict[str, Any]:
        """Accept/reject/unset live Track-on-Frame; keep mask. Persist on Save."""
        if decision is not None:
            decision = decision.strip().lower()
            if decision not in VALID_REVIEW:
                raise BadReviewRequest(
                    "decision must be accepted, rejected, or null"
                )

        if self._session is None or self._session.clip_id != clip_id:
            raise SessionNotFound("no Session on this Clip")

        self._ensure_not_propagating()
        try:
            catalog.frame_path(self._settings, clip_id, frame_index)
        except catalog.ClipNotFound as exc:
            raise SessionClipNotFound(clip_id) from exc
        except catalog.FrameNotFound as exc:
            raise SessionFrameNotFound(str(frame_index)) from exc

        track = self._find_track(track_id)
        mask = track.masks.get(frame_index)
        if not mask:
            raise TrackNotFound(
                f"Track {track_id} has no mask on frame {frame_index}"
            )
        mask["review_decision"] = decision
        return {
            "clip_id": clip_id,
            "frame_index": frame_index,
            "track_id": track_id,
            "review_decision": decision,
            "source": mask.get("source"),
            "mask": dict(mask),
        }

    def _tracks_as_dicts(self) -> list[dict[str, Any]]:
        assert self._session is not None
        out: list[dict[str, Any]] = []
        for t in self._session.tracks:
            out.append(
                {
                    "track_id": t.track_id,
                    "label": t.label,
                    "color": t.color,
                    "score": t.score,
                    "masks": {fi: dict(m) for fi, m in t.masks.items()},
                }
            )
        return out

    def _maybe_auto_save(self, job: PropagateJob) -> None:
        if not self._settings.auto_save_on_propagate:
            return
        if self._session is None or self._session.session_id != job.session_id:
            return
        s = self._session
        annotations.auto_save_rows(
            self._settings, s.clip_id, self._tracks_as_dicts()
        )

    def _advance_job_stream(self, job: PropagateJob) -> None:
        """Fill one pending frame per poll so progress is visible."""
        if self._session is None or self._session.session_id != job.session_id:
            job.status = "failed"
            job.error = "Session no longer active"
            if self._active_job_id == job.job_id:
                self._active_job_id = None
            return

        s = self._session
        self._ensure_predictor_clip(s.clip_id)
        total = job.frames_total
        if job.status == "queued":
            job.status = "running"

        if not job.pending_frames:
            job.status = "completed"
            job.progress = 1.0
            if self._active_job_id == job.job_id:
                self._active_job_id = None
            self._maybe_auto_save(job)
            return

        try:
            fi = job.pending_frames.pop(0)
            job.current_frame_index = fi
            for tid, seed in job.seed_masks.items():
                track = next((t for t in s.tracks if t.track_id == tid), None)
                if track is None:
                    continue
                existing = track.masks.get(fi)
                if existing is not None and annotations.is_protected(existing):
                    # Protected Mask: never overwrite (ADR 0003)
                    continue
                out_mask = self._predictor.propagate_span(
                    clip_id=s.clip_id,
                    seed_frame_index=job.start_frame_index,
                    target_frame_index=fi,
                    target_frame_indices=job.pending_frames,
                    seed_mask=seed,
                    track_id=tid,
                )
                track.masks[fi] = _mask_payload(
                    mask=out_mask, source="propagated"
                )
            job.frames_done += 1
            job.progress = (
                1.0 if total == 0 else round(job.frames_done / total, 4)
            )
            if not job.pending_frames:
                job.status = "completed"
                job.progress = 1.0
                if self._active_job_id == job.job_id:
                    self._active_job_id = None
                self._maybe_auto_save(job)
        except Exception as exc:  # pragma: no cover - defensive
            job.status = "failed"
            job.error = str(exc)
            if self._active_job_id == job.job_id:
                self._active_job_id = None

    @staticmethod
    def _planned_frames(
        *,
        direction: str,
        start: int,
        max_frames: int | None,
        frame_count: int,
    ) -> list[int]:
        """Frame indices to fill (excluding seed). Order: forward then backward."""
        limit = frame_count if max_frames is None else max_frames
        out: list[int] = []
        if direction in ("forward", "both"):
            for step in range(1, limit + 1):
                fi = start + step
                if fi >= frame_count:
                    break
                out.append(fi)
        if direction in ("backward", "both"):
            for step in range(1, limit + 1):
                fi = start - step
                if fi < 0:
                    break
                out.append(fi)
        return out

    def _job_is_blocking(self, session_id: str | None = None) -> bool:
        if self._active_job_id is None:
            return False
        job = self._jobs.get(self._active_job_id)
        if job is None:
            return False
        if session_id is not None and job.session_id != session_id:
            return False
        return job.status in ("queued", "running")

    def _ensure_not_propagating(self, *, global_job: bool = False) -> None:
        session_id = None
        if not global_job and self._session is not None:
            session_id = self._session.session_id
        if self._job_is_blocking(session_id):
            raise SessionConflict(
                "A Propagate Job is running; wait for it to finish before "
                "Predict, prompt edits, or reset"
            )

    def _fail_active_job(
        self, message: str, session_id: str | None = None
    ) -> None:
        if self._active_job_id is None:
            return
        job = self._jobs.get(self._active_job_id)
        if job is None:
            self._active_job_id = None
            return
        if session_id is not None and job.session_id != session_id:
            return
        if job.status in ("queued", "running"):
            job.status = "failed"
            job.error = message
        self._active_job_id = None

    def _hydrate_from_annotations(self, clip_id: str) -> None:
        """Load saved Annotation rows into the Session Track-on-Frame table."""
        assert self._session is not None
        loaded = annotations.load_rows(self._settings, clip_id)
        if not loaded:
            return

        tracks: list[TrackState] = []
        for t in loaded:
            tid = int(t["track_id"])
            masks: dict[int, dict[str, Any]] = {}
            for fi, m in (t.get("masks") or {}).items():
                masks[int(fi)] = _mask_payload(
                    mask=m,
                    source=str(m.get("source") or "manual"),
                    review_decision=m.get("review_decision"),
                )
            tracks.append(
                TrackState(
                    track_id=tid,
                    label=t.get("label") or f"track-{tid}",
                    color=t.get("color") or color_for_track(tid),
                    score=t.get("score"),
                    masks=masks,
                )
            )
        # Model seed deferred to Predict (use_mask_prior) / Propagate
        # start (seed_track there) so hydrate cannot wipe multi-object state.
        self._session.tracks = sorted(tracks, key=lambda row: row.track_id)

    def _run_concept(self, *, frame_index: int, concept: str) -> PredictResult:
        s = self._session
        assert s is not None
        self._ensure_predictor_clip(s.clip_id)

        try:
            detections = self._predictor.predict_concept(
                clip_id=s.clip_id,
                frame_index=frame_index,
                text=concept,
            )
        except Exception as exc:
            raise PredictorRuntimeError(str(exc)) from exc

        if not detections:
            # Soft empty: keep Session; clear tracks; do not lock concept
            s.tracks = []
            self._scribble_clear_session()
            s.undo_stack.clear()
            return PredictResult(
                frame_index=frame_index,
                empty=True,
                message=f"No instances found for concept {concept!r}",
                tracks=[],
            )

        s.concept_text = concept
        tracks = self._tracks_from_detections(detections, frame_index)
        s.tracks = tracks
        self._scribble_clear_session()
        s.undo_stack.clear()
        self._persist_session()

        public_tracks = [t.to_public(frame_index=frame_index) for t in tracks]
        return PredictResult(
            frame_index=frame_index,
            empty=False,
            message=None,
            tracks=public_tracks,
        )

    def _run_geometry(
        self,
        *,
        frame_index: int,
        concept: str | None,
        points: list[list[float]],
        point_labels: list[int],
        boxes: list[list[float]],
        box_labels: list[int],
        scribbles: list[list[list[float]]],
        scribble_labels: list[int],
        scribble_widths: list[int] | None,
        track_id: int | None,
        use_mask_prior: bool = False,
        geometric_memory: list[dict[str, Any]] | None = None,
    ) -> PredictResult:
        s = self._session
        assert s is not None
        self._ensure_predictor_clip(s.clip_id)

        has_pos_point = any(lab == 1 for lab in point_labels)
        has_pos_box = any(lab == 1 for lab in box_labels)
        has_pos_scribble = any(lab == 1 for lab in scribble_labels)
        if track_id is None and not has_pos_point and not has_pos_box and not has_pos_scribble:
            raise BadPredictRequest(
                "Predict needs at least one positive point or stroke "
                "(or a track_id to refine with negatives / Mask Prior)"
            )

        target: TrackState | None = None
        base_mask: dict[str, Any] | None = None
        if track_id is not None:
            target = self._find_track(track_id)
            # ADR 0007: attach whenever a Track-on-Frame row exists.
            if frame_index in target.masks:
                prior = target.masks[frame_index]
                if is_rle_mask(prior):
                    base_mask = public_mask_fields(prior)
            if use_mask_prior and not base_mask:
                raise BadPredictRequest(
                    f"use_mask_prior requires a mask on track {track_id} "
                    f"frame {frame_index} (session or load_annotations)"
                )

        if target is None and len(s.tracks) >= MAX_TRACKS:
            raise BadPredictRequest(f"max {MAX_TRACKS} Tracks")

        # Pre-assign Track id so real model obj_id matches Session Track.
        model_track_id = (
            track_id if target is not None else self._next_track_id()
        )

        used_scribble = False
        pre_scribble_mask = base_mask
        if scribbles:
            scribble_health = self._scribble.health()
            if not scribble_health.get("ready", True):
                raise WorkerNotReady(
                    scribble_health.get("message")
                    or "Scribble worker is not ready"
                )
            if base_mask is not None:
                self._scribble_load(
                    track_id=model_track_id,
                    frame_index=frame_index,
                    mask=base_mask,
                )
            try:
                frame_file = catalog.frame_path(
                    self._settings, s.clip_id, frame_index
                )
                scribble_mask = self._scribble.predict(
                    scribbles=scribbles,
                    scribble_labels=scribble_labels,
                    session_id=s.session_id,
                    track_id=model_track_id,
                    frame_index=frame_index,
                    frame_path=str(frame_file),
                    scribble_widths=scribble_widths,
                )
            except Exception as exc:
                raise PredictorRuntimeError(str(exc)) from exc
            if not scribble_mask:
                self._rollback_scribble_memory(
                    track_id=model_track_id,
                    frame_index=frame_index,
                    prior_mask=pre_scribble_mask,
                )
                public = [t.to_public(frame_index=frame_index) for t in s.tracks]
                return PredictResult(
                    frame_index=frame_index,
                    empty=True,
                    message="No mask from Scribble Model",
                    tracks=public,
                )
            base_mask = scribble_mask
            used_scribble = True

        stored: list[dict[str, Any]] = []
        if geometric_memory is not None:
            stored = _copy_points(geometric_memory)
        elif target is not None:
            stored = _copy_points(target.geometric_memory.get(frame_index, []))
        send_pts, send_labs = _merge_geometry_points(
            stored, points, point_labels
        )

        try:
            out_mask = self._predictor.predict_geometry(
                clip_id=s.clip_id,
                frame_index=frame_index,
                points=send_pts,
                point_labels=send_labs,
                boxes=boxes,
                box_labels=box_labels,
                base_mask=base_mask,
                track_id=model_track_id,
            )
        except Exception as exc:
            if used_scribble:
                self._rollback_scribble_memory(
                    track_id=model_track_id,
                    frame_index=frame_index,
                    prior_mask=pre_scribble_mask,
                )
            raise PredictorRuntimeError(str(exc)) from exc

        if not out_mask:
            if used_scribble:
                self._rollback_scribble_memory(
                    track_id=model_track_id,
                    frame_index=frame_index,
                    prior_mask=pre_scribble_mask,
                )
            public = [t.to_public(frame_index=frame_index) for t in s.tracks]
            return PredictResult(
                frame_index=frame_index,
                empty=True,
                message="No mask from Geometric Prompts",
                tracks=public,
            )

        provenance = {"mask_handoff": True} if used_scribble else None
        leftover = stored + _prompt_points(points, point_labels)

        # Snapshot the pre-edit cell for Undo: silhouette + Source, leftover
        # pins, and the Scribble mask-memory silhouette. The mirror still holds
        # the pre-edit silhouette here (re-anchor happens after the commit).
        pre_scribble = s.scribble_memory.get((model_track_id, frame_index))
        s.undo_stack.append(
            _CellSnapshot(
                track_id=model_track_id,
                frame_index=frame_index,
                track_existed=target is not None,
                mask=_copy_mask(target.masks[frame_index])
                if target is not None and frame_index in target.masks
                else None,
                score=target.score if target is not None else None,
                geometric_memory=_copy_points(
                    target.geometric_memory.get(frame_index, [])
                )
                if target is not None
                else [],
                scribble_mask=_copy_mask(pre_scribble)
                if pre_scribble is not None
                else None,
            )
        )

        if target is not None:
            # Geometric refine after prior mask → refined; first seed → manual
            source = "refined" if frame_index in target.masks else "manual"
            target.masks[frame_index] = _mask_payload(
                mask=out_mask, source=source, model_provenance=provenance
            )
            target.geometric_memory[frame_index] = leftover
            target.score = None  # geometric refine has no concept score
        else:
            tid = model_track_id
            label = concept if concept else f"track-{tid}"
            mask = _mask_payload(
                mask=out_mask, source="manual", model_provenance=provenance
            )
            target = TrackState(
                track_id=tid,
                label=label,
                color=color_for_track(tid),
                score=None,
                masks={frame_index: mask},
                geometric_memory={frame_index: leftover},
            )
            s.tracks.append(target)

        if used_scribble:
            # Re-anchor mask-memory to the SAM silhouette; keep stroke ink.
            self._scribble_load(
                track_id=model_track_id,
                frame_index=frame_index,
                mask=out_mask,
            )

        if concept:
            s.concept_text = concept

        self._persist_session()
        public_tracks = [t.to_public(frame_index=frame_index) for t in s.tracks]
        return PredictResult(
            frame_index=frame_index,
            empty=False,
            message=None,
            tracks=public_tracks,
        )

    def _persist_session(self) -> None:
        """Replace this Clip's Annotation with the live Session tracks."""
        assert self._session is not None
        s = self._session
        annotations.save_rows(self._settings, s.clip_id, self._tracks_as_dicts())

    def _scribble_load(
        self, *, track_id: int, frame_index: int, mask: dict[str, Any]
    ) -> None:
        """Load Scribble mask-memory and mirror the silhouette for Undo."""
        assert self._session is not None
        self._scribble.load_memory(
            session_id=self._session.session_id,
            track_id=track_id,
            frame_index=frame_index,
            mask=mask,
        )
        self._session.scribble_memory[(track_id, frame_index)] = _copy_mask(
            mask
        )

    def _scribble_clear_cell(self, *, track_id: int, frame_index: int) -> None:
        assert self._session is not None
        self._scribble.clear_memory(
            session_id=self._session.session_id,
            track_id=track_id,
            frame_index=frame_index,
        )
        self._session.scribble_memory.pop((track_id, frame_index), None)

    def _scribble_clear_track(self, *, track_id: int) -> None:
        assert self._session is not None
        self._scribble.clear_memory(
            session_id=self._session.session_id, track_id=track_id
        )
        for key in [
            k for k in self._session.scribble_memory if k[0] == track_id
        ]:
            self._session.scribble_memory.pop(key, None)

    def _scribble_clear_session(self) -> None:
        assert self._session is not None
        self._scribble.clear_memory(session_id=self._session.session_id)
        self._session.scribble_memory.clear()

    def _prune_undo_track(self, track_id: int) -> None:
        assert self._session is not None
        self._session.undo_stack = [
            snap
            for snap in self._session.undo_stack
            if snap.track_id != track_id
        ]

    def _rollback_scribble_memory(
        self,
        *,
        track_id: int,
        frame_index: int,
        prior_mask: dict[str, Any] | None,
    ) -> None:
        """Drop failed ink; restore the pre-request silhouette as mask-memory."""
        self._scribble_clear_cell(track_id=track_id, frame_index=frame_index)
        if prior_mask is not None:
            self._scribble_load(
                track_id=track_id,
                frame_index=frame_index,
                mask=prior_mask,
            )

    def _find_track(self, track_id: int) -> TrackState:
        assert self._session is not None
        for t in self._session.tracks:
            if t.track_id == track_id:
                return t
        raise TrackNotFound(f"Track not found: {track_id}")

    def _next_track_id(self) -> int:
        assert self._session is not None
        if not self._session.tracks:
            return 1
        return max(t.track_id for t in self._session.tracks) + 1

    def _tracks_from_detections(
        self,
        detections: list[DetectedInstance],
        frame_index: int,
    ) -> list[TrackState]:
        tracks: list[TrackState] = []
        used: set[int] = set()
        next_tid = 1
        for det in detections:
            if det.track_id is not None and det.track_id not in used:
                tid = int(det.track_id)
            else:
                while next_tid in used:
                    next_tid += 1
                tid = next_tid
                next_tid += 1
            used.add(tid)
            mask = _mask_payload(mask=det.mask, source="manual")
            tracks.append(
                TrackState(
                    track_id=tid,
                    label=det.label,
                    color=color_for_track(tid),
                    score=det.score,
                    masks={frame_index: mask},
                )
            )
        return tracks

    @staticmethod
    def _validate_geometry(
        points: list[list[float]],
        point_labels: list[int],
        boxes: list[list[float]],
        box_labels: list[int],
    ) -> None:
        if len(points) != len(point_labels):
            raise BadPredictRequest(
                "points and point_labels must have the same length"
            )
        if boxes:
            raise BadPredictRequest("boxes are not a desk Geometric Prompt")
        if len(boxes) != len(box_labels):
            raise BadPredictRequest(
                "boxes and box_labels must have the same length"
            )

        for i, pt in enumerate(points):
            if len(pt) != 2:
                raise BadPredictRequest(
                    f"point[{i}] must be [x, y] in relative coords"
                )
            if not all(0.0 <= float(v) <= 1.0 for v in pt):
                raise BadPredictRequest(
                    "point coordinates must be relative values in [0, 1]"
                )
            lab = point_labels[i]
            if lab not in (0, 1):
                raise BadPredictRequest(
                    "point_labels must be 0 (negative) or 1 (positive)"
                )

    @staticmethod
    def _validate_scribbles(
        scribbles: list[list[list[float]]],
        scribble_labels: list[int],
    ) -> None:
        if len(scribbles) != len(scribble_labels):
            raise BadPredictRequest(
                "scribbles and scribble_labels must have the same length"
            )
        for i, poly in enumerate(scribbles):
            if not poly:
                raise BadPredictRequest(
                    f"scribble[{i}] must be a polyline of [x, y] points"
                )
            for j, pt in enumerate(poly):
                if len(pt) != 2:
                    raise BadPredictRequest(
                        f"scribble[{i}][{j}] must be [x, y] in relative coords"
                    )
                if not all(0.0 <= float(v) <= 1.0 for v in pt):
                    raise BadPredictRequest(
                        "scribble coordinates must be relative values in [0, 1]"
                    )
            lab = scribble_labels[i]
            if lab not in (0, 1):
                raise BadPredictRequest(
                    "scribble_labels must be 0 (negative) or 1 (positive)"
                )

    @staticmethod
    def _validate_scribble_widths(
        scribbles: list[list[list[float]]],
        scribble_widths: list[int] | None,
    ) -> None:
        if scribble_widths is None:
            return
        if len(scribble_widths) != len(scribbles):
            raise BadPredictRequest(
                "scribble_widths must have the same length as scribbles"
            )
        for width in scribble_widths:
            if (
                not isinstance(width, int)
                or isinstance(width, bool)
                or width < SCRIBBLE_WIDTH_MIN
                or width > SCRIBBLE_WIDTH_MAX
            ):
                raise BadPredictRequest(
                    "scribble_widths must be integers from 1 to 40"
                )
