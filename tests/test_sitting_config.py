"""Sitting starts from YAML: repo-root config.yaml or --config. No env."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import default_config_path, load_settings

REPO = Path(__file__).resolve().parents[1]


def _sitting(*args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO)
    return subprocess.run(
        [sys.executable, "-m", "endo_label", *args],
        cwd=str(REPO),
        capture_output=True,
        text=True,
        env=env,
        timeout=10,
    )


def test_invalid_port_refuses_to_start() -> None:
    result = _sitting("--port", "0")
    assert result.returncode == 2
    assert "invalid --port" in result.stderr


def test_missing_config_file_refuses_to_start(tmp_path: Path) -> None:
    missing = tmp_path / "no-such-config.yaml"
    result = _sitting("--config", str(missing))
    assert result.returncode != 0
    err = result.stderr + result.stdout
    assert "config" in err.lower()
    assert str(missing) in err
    assert "not found" in err.lower() or "missing" in err.lower()


def _write_pool(root: Path, clip_id: str, n: int = 1) -> Path:
    clip = root / clip_id
    clip.mkdir(parents=True)
    for i in range(n):
        (clip / f"{i:05d}.jpg").write_bytes(b"fake-jpeg")
    return root


def _write_yaml(
    path: Path, *, frames_root: Path, labels_root: Path, allowlist: list[str]
) -> Path:
    lines = [
        f"frames_root: {frames_root}",
        f"labels_root: {labels_root}",
        "clip_allowlist:",
    ]
    if allowlist:
        lines.extend(f"  - {clip_id}" for clip_id in allowlist)
    else:
        lines[2] = "clip_allowlist: []"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def test_config_flag_loads_frame_pool_allowlist_and_label_roots(tmp_path: Path) -> None:
    frames = _write_pool(tmp_path / "frames", "YAMLCLIP", n=2)
    _write_pool(frames, "OTHERCLIP", n=1)
    labels = tmp_path / "labels"
    yaml_path = _write_yaml(
        tmp_path / "sitting.yaml",
        frames_root=frames,
        labels_root=labels,
        allowlist=["YAMLCLIP"],
    )

    settings = load_settings(yaml_path)
    client = TestClient(create_app(settings))
    clips = client.get("/api/clips")
    assert clips.status_code == 200
    assert clips.json()["clips"] == [{"id": "YAMLCLIP", "frame_count": 2}]

    added = client.post("/api/vocab/phases", json={"name": "Preparation"})
    assert added.status_code == 200
    span = client.post(
        "/api/phase/YAMLCLIP/span",
        json={"phase": "Preparation", "from": 0, "to": 0},
    )
    assert span.status_code == 200
    assert span.json()["frames"]["0"] == "Preparation"

    again = TestClient(create_app(load_settings(yaml_path)))
    got = again.get("/api/phase/YAMLCLIP")
    assert got.status_code == 200
    assert got.json()["frames"]["0"] == "Preparation"


def test_default_config_path_is_repo_root_yaml() -> None:
    assert default_config_path() == REPO / "config.yaml"


def test_missing_repo_root_config_refuses_without_flag() -> None:
    path = default_config_path()
    if path.is_file():
        pytest.skip("repo-root config.yaml present")
    result = _sitting()
    assert result.returncode != 0
    err = result.stderr + result.stdout
    assert str(path) in err
    assert "not found" in err.lower() or "missing" in err.lower()


def test_environment_variables_are_not_sitting_config(tmp_path: Path, monkeypatch) -> None:
    env_frames = _write_pool(tmp_path / "env_frames", "ENVCLIP")
    yaml_frames = _write_pool(tmp_path / "yaml_frames", "YAMLCLIP")
    yaml_path = _write_yaml(
        tmp_path / "sitting.yaml",
        frames_root=yaml_frames,
        labels_root=tmp_path / "labels",
        allowlist=["YAMLCLIP"],
    )
    monkeypatch.setenv("FRAMES_ROOT", str(env_frames))
    monkeypatch.setenv("CLIP_ALLOWLIST", "ENVCLIP")
    monkeypatch.setenv("LABELS_ROOT", str(tmp_path / "env_labels"))

    client = TestClient(create_app(load_settings(yaml_path)))
    clips = client.get("/api/clips").json()["clips"]
    assert clips == [{"id": "YAMLCLIP", "frame_count": 1}]
    ids = {row["id"] for row in clips}
    assert "ENVCLIP" not in ids


def test_empty_allowlist_means_zero_clips(tmp_path: Path) -> None:
    frames = _write_pool(tmp_path / "frames", "HIDDENCLIP")
    yaml_path = _write_yaml(
        tmp_path / "sitting.yaml",
        frames_root=frames,
        labels_root=tmp_path / "labels",
        allowlist=[],
    )
    client = TestClient(create_app(load_settings(yaml_path)))
    clips = client.get("/api/clips")
    assert clips.status_code == 200
    assert clips.json() == {"clips": []}


def test_cors_allows_only_vite_origin(tmp_path: Path) -> None:
    frames = _write_pool(tmp_path / "frames", "CLIPA")
    settings = load_settings(
        _write_yaml(
            tmp_path / "sitting.yaml",
            frames_root=frames,
            labels_root=tmp_path / "labels",
            allowlist=["CLIPA"],
        )
    )
    client = TestClient(create_app(settings))

    allowed = client.options(
        "/api/health",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert allowed.status_code in (200, 204)
    assert allowed.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"

    localhost = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert localhost.headers.get("access-control-allow-origin") == "http://localhost:5173"

    blocked = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert blocked.headers.get("access-control-allow-origin") not in (
        "http://evil.example",
        "*",
    )
