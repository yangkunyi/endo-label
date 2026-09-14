"""FastAPI entry for the surgical video label desk."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from endo_label import catalog
from endo_label.auth import require_label_assignee
from endo_label.mask import annotations
from endo_label.config import Settings, load_settings
from endo_label.mask.predictor import build_predictor
from endo_label.mask.scribble import build_scribble
from endo_label.mask.session import (
    BadPredictRequest,
    BadPropagateRequest,
    BadReviewRequest,
    JobNotFound,
    SessionBusy,
    SessionClipNotFound,
    SessionConflict,
    SessionFrameNotFound,
    SessionManager,
    SessionNotFound,
    TrackNotFound,
    PredictorRuntimeError,
    WorkerNotReady,
)

SERVICE_NAME = "endo_label"
SERVICE_VERSION = "0.1.0"


class CreateSessionBody(BaseModel):
    clip_id: str = Field(..., min_length=1)
    # Hydrate Session Tracks from saved Annotation (Mask Prior / Propagate seed).
    load_annotations: bool = False


class PredictBody(BaseModel):
    """Predict on current Frame.

    Coordinates for points/boxes/scribbles are **relative** image space in
    ``[0, 1]``: origin top-left, ``x`` right, ``y`` down. Point is ``[x, y]``;
    box is ``[x0, y0, x1, y1]``; scribble is a polyline of ``[x, y]`` vertices.
    Labels: ``1`` positive, ``0`` negative.

    ``use_mask_prior``: condition on the existing Track mask for this Frame
    (session or Annotation loaded via ``load_annotations``). No file upload.
    Strokes are Scribble Prompts: Session runs the Scribble Model, then Mask
    Handoff of the complete mask as SAM 3.1 Mask Prior.
    ``scribble_widths``: per-stroke full diameter on the 1024 letterbox
    (integers 1–40, same length as ``scribbles``). Omit to mean 8.
    """

    clip_id: str | None = None
    frame_index: int = Field(..., ge=0)
    text: str | None = None
    points: list[list[float]] | None = None
    point_labels: list[int] | None = None
    boxes: list[list[float]] | None = None
    box_labels: list[int] | None = None
    scribbles: list[list[list[float]]] | None = None
    scribble_labels: list[int] | None = None
    scribble_widths: list[int] | None = None
    track_id: int | None = None
    clear_old_points: bool = False
    clear_old_boxes: bool = False
    use_mask_prior: bool = False


class UpdateTrackBody(BaseModel):
    label: str = Field(..., min_length=1)


class UndoBody(BaseModel):
    """Undo this Frame's last committed mask edit (Predict / pin delete / Clear).

    Empty Undo stack is a 200 no-op; there is no Redo.
    """

    clip_id: str | None = None
    frame_index: int = Field(..., ge=0)


class PropagateBody(BaseModel):
    """Start a Propagate Job for the active Session.

    ``direction``: ``forward`` | ``backward`` | ``both``.
    ``max_frames``: optional cap on steps per direction from the start frame.
    """

    clip_id: str | None = None
    direction: str = Field(..., min_length=1)
    start_frame_index: int = Field(..., ge=0)
    max_frames: int | None = Field(default=None, ge=0)


class ReviewBody(BaseModel):
    """Per Track-on-Frame Review Decision.

    ``decision``: ``accepted`` | ``rejected`` | null (clear).
    """

    frame_index: int = Field(..., ge=0)
    track_id: int = Field(..., ge=1)
    decision: str | None = None


def create_app(
    settings: Settings | None = None,
    session_manager: SessionManager | None = None,
) -> FastAPI:
    cfg = settings if settings is not None else load_settings()
    sessions = session_manager if session_manager is not None else SessionManager(
        cfg, build_predictor(cfg), scribble=build_scribble(cfg)
    )

    app = FastAPI(title=SERVICE_NAME, version=SERVICE_VERSION)
    app.state.settings = cfg
    app.state.sessions = sessions

    def _account(request: Request):
        return int(request.state.account.id)

    def _write_clip(request: Request, clip_id: str | None) -> str:
        """Clip a mask write targets, after the assignment ownership check."""
        resolved = clip_id or sessions.active_clip(_account(request))
        if not resolved:
            raise HTTPException(status_code=404, detail="No active Session")
        require_label_assignee(request, resolved, "mask")
        return resolved
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict:
        worker = sessions.worker_health()
        return {
            "ok": True,
            "service": SERVICE_NAME,
            "version": SERVICE_VERSION,
            "worker": worker,
        }

    @app.get("/api/clips")
    def get_clips(
        request: Request,
        project: str | None = None,
        tag: str | None = None,
        scope: str | None = None,
    ) -> dict:
        """The Clip directory: `mine` for everyone, `all` for the admin alone.

        An Account only ever holds its own Clips, and the filter is this
        server's, not the browser's: `scope=all` from a non-admin is refused
        rather than quietly narrowed to `mine`.
        """
        account = request.state.account
        if scope == "all" and not account.admin:
            raise HTTPException(
                status_code=403,
                detail="Only an admin can see every Clip.",
            )
        return {
            "clips": catalog.list_clips(
                cfg,
                project=project,
                tag=tag,
                account_id=int(account.id),
                scope=scope or "mine",
            )
        }

    @app.get("/api/clips/{clip_id}")
    def get_clip(clip_id: str) -> dict:
        try:
            return catalog.clip_meta(cfg, clip_id)
        except catalog.ClipNotFound:
            raise HTTPException(status_code=404, detail=f"Clip not found: {clip_id}") from None

    @app.get("/api/clips/{clip_id}/frames/{frame_index}")
    def get_frame(clip_id: str, frame_index: int) -> FileResponse:
        try:
            path = catalog.frame_path(cfg, clip_id, frame_index)
        except catalog.ClipNotFound:
            raise HTTPException(status_code=404, detail=f"Clip not found: {clip_id}") from None
        except catalog.FrameNotFound:
            raise HTTPException(
                status_code=404,
                detail=f"Frame index out of range: {frame_index}",
            ) from None
        return FileResponse(path, media_type="image/jpeg")

    @app.get("/api/clips/{clip_id}/media")
    def get_clip_media(clip_id: str) -> FileResponse:
        try:
            path = catalog.media_path(cfg, clip_id)
        except catalog.ClipNotFound:
            raise HTTPException(status_code=404, detail=f"Clip not found: {clip_id}") from None
        except catalog.TranscodeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from None
        suffix = path.suffix.lower()
        media_type = "video/webm" if suffix == ".webm" else "video/mp4"
        return FileResponse(path, media_type=media_type)

    @app.get("/api/session")
    def get_session(
        request: Request,
        frame_index: int | None = None,
        clip_id: str | None = None,
    ) -> dict:
        return sessions.get_public(
            account_id=_account(request),
            clip_id=clip_id,
            frame_index=frame_index,
        )

    @app.post("/api/session", status_code=201)
    def create_session(body: CreateSessionBody, request: Request) -> dict:
        try:
            return sessions.create(
                _account(request),
                body.clip_id,
                load_annotations=body.load_annotations,
            )
        except SessionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from None
        except WorkerNotReady as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None
        except SessionClipNotFound:
            raise HTTPException(
                status_code=404, detail=f"Clip not found: {body.clip_id}"
            ) from None

    @app.delete("/api/session")
    def close_session(request: Request, clip_id: str | None = None) -> dict:
        try:
            return sessions.close(_account(request), clip_id)
        except SessionNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None

    @app.post("/api/session/reset")
    def reset_session(request: Request, clip_id: str | None = None) -> dict:
        try:
            return sessions.reset(_account(request), clip_id)
        except SessionNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except SessionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from None
        except WorkerNotReady as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None

    @app.post("/api/session/predict")
    def predict(body: PredictBody, request: Request) -> dict:
        clip_id = _write_clip(request, body.clip_id)
        try:
            result = sessions.predict(
                account_id=_account(request),
                clip_id=clip_id,
                frame_index=body.frame_index,
                text=body.text,
                points=body.points,
                point_labels=body.point_labels,
                boxes=body.boxes,
                box_labels=body.box_labels,
                scribbles=body.scribbles,
                scribble_labels=body.scribble_labels,
                scribble_widths=body.scribble_widths,
                track_id=body.track_id,
                clear_old_points=body.clear_old_points,
                clear_old_boxes=body.clear_old_boxes,
                use_mask_prior=body.use_mask_prior,
            )
        except SessionBusy as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None
        except SessionNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except SessionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from None
        except SessionFrameNotFound:
            raise HTTPException(
                status_code=404,
                detail=f"Frame index out of range: {body.frame_index}",
            ) from None
        except SessionClipNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except TrackNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except BadPredictRequest as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None
        except WorkerNotReady as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None
        except PredictorRuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from None

        return {
            "frame_index": result.frame_index,
            "empty": result.empty,
            "message": result.message,
            "tracks": result.tracks,
        }

    @app.post("/api/session/propagate", status_code=202)
    def start_propagate(body: PropagateBody, request: Request) -> dict:
        clip_id = _write_clip(request, body.clip_id)
        try:
            return sessions.start_propagate(
                _account(request),
                clip_id,
                direction=body.direction,
                start_frame_index=body.start_frame_index,
                max_frames=body.max_frames,
            )
        except SessionNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except SessionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from None
        except SessionFrameNotFound:
            raise HTTPException(
                status_code=404,
                detail=f"Frame index out of range: {body.start_frame_index}",
            ) from None
        except SessionClipNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except BadPropagateRequest as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None
        except WorkerNotReady as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None
        except PredictorRuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from None

    @app.get("/api/jobs/{job_id}")
    def get_job(job_id: str, request: Request) -> dict:
        try:
            return sessions.get_job(_account(request), job_id)
        except JobNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None

    @app.patch("/api/session/tracks/{track_id}")
    def update_track(
        track_id: int,
        body: UpdateTrackBody,
        request: Request,
        clip_id: str | None = None,
    ) -> dict:
        _write_clip(request, clip_id)
        try:
            return sessions.update_track_label(
                _account(request), track_id, body.label, clip_id
            )
        except SessionNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except SessionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from None
        except TrackNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except BadPredictRequest as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None

    @app.delete("/api/session/tracks/{track_id}")
    def delete_track(
        track_id: int, request: Request, clip_id: str | None = None
    ) -> dict:
        _write_clip(request, clip_id)
        try:
            return sessions.delete_track(_account(request), track_id, clip_id)
        except SessionNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except SessionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from None
        except TrackNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None

    @app.delete("/api/session/tracks/{track_id}/frames/{frame_index}")
    def clear_frame_mask(
        track_id: int,
        frame_index: int,
        request: Request,
        clip_id: str | None = None,
    ) -> dict:
        _write_clip(request, clip_id)
        try:
            return sessions.clear_frame_mask(
                _account(request), track_id, frame_index, clip_id
            )
        except SessionNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except SessionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from None
        except TrackNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except SessionFrameNotFound:
            raise HTTPException(
                status_code=404,
                detail=f"Frame index out of range: {frame_index}",
            ) from None
        except SessionClipNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None

    @app.delete(
        "/api/session/tracks/{track_id}/frames/{frame_index}/points/{point_index}"
    )
    def drop_geometric_point(
        track_id: int,
        frame_index: int,
        point_index: int,
        request: Request,
        clip_id: str | None = None,
    ) -> dict:
        _write_clip(request, clip_id)
        try:
            return sessions.drop_geometric_point(
                _account(request), track_id, frame_index, point_index, clip_id
            )
        except SessionNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except SessionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from None
        except TrackNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except SessionFrameNotFound:
            raise HTTPException(
                status_code=404,
                detail=f"Frame index out of range: {frame_index}",
            ) from None
        except SessionClipNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except BadPredictRequest as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None
        except WorkerNotReady as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None
        except PredictorRuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from None

    @app.post("/api/session/undo")
    def undo(body: UndoBody, request: Request) -> dict:
        _write_clip(request, body.clip_id)
        try:
            return sessions.undo(
                account_id=_account(request),
                clip_id=body.clip_id,
                frame_index=body.frame_index,
            )
        except SessionNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except SessionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from None
        except SessionFrameNotFound:
            raise HTTPException(
                status_code=404,
                detail=f"Frame index out of range: {body.frame_index}",
            ) from None
        except SessionClipNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None

    @app.post("/api/session/save")
    def save_annotations(
        request: Request, clip_id: str | None = None
    ) -> dict:
        _write_clip(request, clip_id)
        try:
            return sessions.save_annotations(_account(request), clip_id)
        except SessionNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except SessionClipNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None

    @app.get("/api/clips/{clip_id}/annotations")
    def get_annotations_summary(clip_id: str) -> dict:
        try:
            catalog.clip_meta(cfg, clip_id)
        except catalog.ClipNotFound:
            raise HTTPException(
                status_code=404, detail=f"Clip not found: {clip_id}"
            ) from None
        try:
            return annotations.summary(cfg, clip_id)
        except annotations.AnnotationNotFound:
            raise HTTPException(
                status_code=404,
                detail=f"No Annotation saved for clip {clip_id}",
            ) from None

    @app.get("/api/clips/{clip_id}/annotations/frames/{frame_index}")
    def get_frame_annotations(clip_id: str, frame_index: int) -> dict:
        try:
            catalog.clip_meta(cfg, clip_id)
        except catalog.ClipNotFound:
            raise HTTPException(
                status_code=404, detail=f"Clip not found: {clip_id}"
            ) from None
        try:
            return annotations.frame_annotations(cfg, clip_id, frame_index)
        except annotations.AnnotationNotFound:
            raise HTTPException(
                status_code=404,
                detail=f"No Annotation saved for clip {clip_id}",
            ) from None
        except catalog.FrameNotFound:
            raise HTTPException(
                status_code=404,
                detail=f"Frame index out of range: {frame_index}",
            ) from None

    @app.post("/api/clips/{clip_id}/review")
    def review_track_on_frame(
        clip_id: str, body: ReviewBody, request: Request
    ) -> dict:
        _write_clip(request, clip_id)
        try:
            return sessions.set_review(
                _account(request),
                clip_id=clip_id,
                frame_index=body.frame_index,
                track_id=body.track_id,
                decision=body.decision,
            )
        except SessionNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except SessionClipNotFound:
            raise HTTPException(
                status_code=404, detail=f"Clip not found: {clip_id}"
            ) from None
        except SessionFrameNotFound:
            raise HTTPException(
                status_code=404,
                detail=f"Frame index out of range: {body.frame_index}",
            ) from None
        except TrackNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        except SessionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from None
        except BadReviewRequest as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None

    return app

