"""Transcode seam: JPEG Clip media builds a cached mp4, reuses on fresh source."""

from __future__ import annotations

import base64
import os
import shutil
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import endo_label.catalog as catalog
from endo_label.config import Settings
from tests.sitting_http import authed_client

# 1x1 white JPEG. Real pixels so ffmpeg can decode it in the smoke test.
_ONE_PX_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/"
    "2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/"
    "8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/"
    "9oACAEBAAA/AL+A/9k="
)


def _sitting(tmp_path: Path, jpeg_bytes: bytes = _ONE_PX_JPEG) -> TestClient:
    frames = tmp_path / "frames"
    clip = frames / "CLIPA"
    clip.mkdir(parents=True)
    (clip / "00001.jpg").write_bytes(jpeg_bytes)
    (clip / "00002.jpg").write_bytes(jpeg_bytes)
    return authed_client(
        Settings(
            frames_root=frames,
            clip_allowlist=("CLIPA",),
            annotations_root=tmp_path / "mask",
            labels_root=tmp_path / "labels",
            predictor_backend="fake",
        )
    )


def _cache_path(tmp_path: Path) -> Path:
    # Default derived cache root: labels_root.parent / "video-cache"
    return tmp_path / "video-cache" / "CLIPA.mp4"


def test_jpeg_media_transcodes_once_and_serves_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[tuple[Path, ...], Path, str]] = []

    def fake_transcode(frames: list[Path], out: Path, ffmpeg: str) -> None:
        calls.append((tuple(frames), out, ffmpeg))
        out.write_bytes(b"fake-mp4-cache")

    monkeypatch.setattr(catalog, "_run_transcode", fake_transcode)
    client = _sitting(tmp_path)

    first = client.get("/api/clips/CLIPA/media")
    assert first.status_code == 200
    assert first.headers["content-type"] == "video/mp4"
    cache = _cache_path(tmp_path)
    assert cache.is_file()
    assert first.content == b"fake-mp4-cache"

    second = client.get("/api/clips/CLIPA/media")
    assert second.status_code == 200
    assert len(calls) == 1, "second open must reuse the cache"
    assert calls[0][0] == (tmp_path / "frames/CLIPA/00001.jpg", tmp_path / "frames/CLIPA/00002.jpg")


def test_media_rebuilds_cache_when_source_frames_change(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[tuple[Path, ...], Path, str]] = []

    def fake_transcode(frames: list[Path], out: Path, ffmpeg: str) -> None:
        calls.append((tuple(frames), out, ffmpeg))
        out.write_bytes(b"fake-mp4-cache")

    monkeypatch.setattr(catalog, "_run_transcode", fake_transcode)
    client = _sitting(tmp_path)
    assert client.get("/api/clips/CLIPA/media").status_code == 200
    assert len(calls) == 1

    frame = tmp_path / "frames/CLIPA/00002.jpg"
    future = time.time() + 60
    os.utime(frame, (future, future))
    assert client.get("/api/clips/CLIPA/media").status_code == 200
    assert len(calls) == 2, "changed frame must invalidate the cache"


def test_missing_ffmpeg_fails_clearly(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(catalog.shutil, "which", lambda _name: None)
    client = _sitting(tmp_path)
    r = client.get("/api/clips/CLIPA/media")
    assert r.status_code == 500
    assert "ffmpeg" in r.json()["detail"].lower()
    assert not _cache_path(tmp_path).exists()


def test_transcode_failure_is_visible(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def failing_transcode(frames: list[Path], out: Path, ffmpeg: str) -> None:
        raise catalog.TranscodeError("ffmpeg transcode failed: boom")

    monkeypatch.setattr(catalog, "_run_transcode", failing_transcode)
    client = _sitting(tmp_path)
    r = client.get("/api/clips/CLIPA/media")
    assert r.status_code == 500
    assert "boom" in r.json()["detail"]


def test_media_does_not_touch_frame_pool(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_transcode(frames: list[Path], out: Path, ffmpeg: str) -> None:
        out.write_bytes(b"fake-mp4-cache")

    monkeypatch.setattr(catalog, "_run_transcode", fake_transcode)
    client = _sitting(tmp_path)
    frame = tmp_path / "frames/CLIPA/00001.jpg"
    before = frame.stat().st_mtime_ns
    assert client.get("/api/clips/CLIPA/media").status_code == 200
    assert client.get("/api/clips/CLIPA/frames/0").status_code == 200
    assert client.get("/api/clips/CLIPA").status_code == 200
    assert frame.stat().st_mtime_ns == before


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not on PATH")
def test_real_transcode_produces_playable_two_frame_mp4(tmp_path: Path) -> None:
    client = _sitting(tmp_path)
    r = client.get("/api/clips/CLIPA/media")
    assert r.status_code == 200
    assert r.headers["content-type"] == "video/mp4"
    cache = _cache_path(tmp_path)
    assert cache.is_file()
    frame_count, fps = catalog.video_clock(cache)
    assert frame_count == 2
    assert fps == 25
    # cache survives a second open without rework
    mt = cache.stat().st_mtime_ns
    again = client.get("/api/clips/CLIPA/media")
    assert again.status_code == 200
    assert cache.stat().st_mtime_ns == mt
