"""Sitting serves the built desk from the same origin as /api."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from endo_label.config import Settings
from tests.sitting_http import authed_client

REPO = Path(__file__).resolve().parents[1]
DESK_HTML = (
    "<!doctype html><html><head><title>endo_label</title></head>"
    '<body><div id="root"></div>'
    '<script src="/assets/desk.js"></script></body></html>'
)


def _settings(tmp_path: Path) -> Settings:
    frames = tmp_path / "frames"
    clip = frames / "CLIPA"
    clip.mkdir(parents=True)
    (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
    (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    return Settings(
        frames_root=frames,
        clip_allowlist=("CLIPA",),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
    )


def _write_dist(path: Path) -> Path:
    path.mkdir(parents=True)
    (path / "index.html").write_text(DESK_HTML, encoding="utf-8")
    assets = path / "assets"
    assets.mkdir()
    (assets / "desk.js").write_text("window.__DESK__=true;", encoding="utf-8")
    return path


def _client(tmp_path: Path, *, web_dist: Path | None = None) -> TestClient:
    dist = web_dist if web_dist is not None else _write_dist(tmp_path / "dist")
    return authed_client(_settings(tmp_path), web_dist=dist)


def _two_worlds(tmp_path: Path) -> tuple[TestClient, TestClient]:
    """The same sitting, once with a built desk and once without one."""
    built = _client(tmp_path / "built")
    bare = _client(tmp_path / "bare", web_dist=tmp_path / "bare" / "no-such-dist")
    return built, bare


_UNMATCHED_API = (
    "/api",
    "/api/does-not-exist",
    "/api/session/redo",
    "/api/deeply/nested/missing",
)
_ANY_METHOD = ("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")


def test_built_desk_is_served_at_root_and_api_stays_compose_http(tmp_path: Path) -> None:
    client = _client(tmp_path)
    desk = client.get("/")
    assert desk.status_code == 200
    assert "text/html" in desk.headers["content-type"]
    assert b'id="root"' in desk.content
    assert b"endo_label" in desk.content
    clips = client.get("/api/clips")
    assert clips.status_code == 200
    assert clips.json()["clips"] == [{"id": "CLIPA", "kind": "jpeg", "frame_count": 2, "fps": 25}]


def test_refresh_clip_desk_returns_spa_not_404(tmp_path: Path) -> None:
    client = _client(tmp_path)
    desk = client.get("/clips/CLIPA")
    assert desk.status_code == 200
    assert "text/html" in desk.headers["content-type"]
    assert desk.content == DESK_HTML.encode("utf-8")
    catalog = client.get("/api/clips/CLIPA")
    assert catalog.status_code == 200
    assert catalog.json()["id"] == "CLIPA"


def test_desk_asset_is_served(tmp_path: Path) -> None:
    client = _client(tmp_path)
    asset = client.get("/assets/desk.js")
    assert asset.status_code == 200
    assert asset.content == b"window.__DESK__=true;"


def test_unknown_api_path_is_json_404_not_desk(tmp_path: Path) -> None:
    client = _client(tmp_path)
    missing = client.get("/api/does-not-exist")
    assert missing.status_code == 404
    assert "application/json" in missing.headers["content-type"]
    assert "root" not in missing.text


def test_unmatched_api_path_answers_the_same_with_and_without_a_built_desk(
    tmp_path: Path,
) -> None:
    """The invariant: building the desk adds the desk's routes and changes no API answer."""
    with_desk, without_desk = _two_worlds(tmp_path)
    for path in _UNMATCHED_API:
        for method in _ANY_METHOD:
            built = with_desk.request(method, path)
            bare = without_desk.request(method, path)
            assert built.status_code == bare.status_code, (method, path)
            assert (
                built.headers["content-type"] == bare.headers["content-type"]
            ), (method, path)
            assert built.status_code == 404, (method, path)
            assert "application/json" in built.headers["content-type"]


def test_wrong_method_on_a_real_api_path_does_not_become_404(tmp_path: Path) -> None:
    """The decision: a real endpoint keeps answering 405 to a wrong method.

    An all-method ``/api/{rest:path}`` catch-all would full-match the path ahead of the
    real route's partial match and answer 404 here, in both worlds.
    """
    with_desk, without_desk = _two_worlds(tmp_path)
    for client in (with_desk, without_desk):
        wrong = client.post("/api/health")
        assert wrong.status_code == 405, wrong.text
        assert "application/json" in wrong.headers["content-type"]


def test_sitting_without_built_desk_still_serves_api(tmp_path: Path) -> None:
    client = _client(tmp_path, web_dist=tmp_path / "no-such-dist")
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["ok"] is True
    assert client.get("/api/clips").json()["clips"] == [{"id": "CLIPA", "kind": "jpeg", "frame_count": 2, "fps": 25}]
    assert client.get("/").status_code == 404


@pytest.mark.skipif(
    not (REPO / "web" / "dist" / "index.html").is_file(),
    reason="web/dist not built",
)
def test_default_sitting_serves_repo_web_dist(tmp_path: Path) -> None:
    client = authed_client(_settings(tmp_path))
    desk = client.get("/")
    assert desk.status_code == 200
    assert b'id="root"' in desk.content
    clip = client.get("/clips/CLIPA")
    assert clip.status_code == 200
    assert b'id="root"' in clip.content
    assert client.get("/api/clips").json()["clips"] == [{"id": "CLIPA", "kind": "jpeg", "frame_count": 2, "fps": 25}]


def test_phase_class_triplet_on_sitting_without_session(tmp_path: Path) -> None:
    client = _client(tmp_path)
    assert client.get("/").status_code == 200
    assert client.get("/api/session").json().get("active") is False
    assert client.get("/api/clips/CLIPA/frames/0").content == b"fake-jpeg-0"
    assert client.post("/api/vocab/phases", json={"name": "Preparation"}).status_code == 200
    assert client.post("/api/vocab/class_tags", json={"name": "grasper"}).status_code == 200
    assert client.post(
        "/api/vocab/triples",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    ).status_code == 200
    span = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    assert span.status_code == 200
    cl = client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper"]})
    assert cl.status_code == 200
    tr = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert tr.status_code == 200
    assert client.get("/api/session").json().get("active") is False
    assert client.get("/api/phase/CLIPA").json()["frames"]["0"] == "Preparation"
    assert client.get("/api/class/CLIPA").json()["frames"]["0"] == ["grasper"]
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"][0]["id"] == 1
