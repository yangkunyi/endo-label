"""Sitting starts from YAML: repo-root config.yaml or --config. No env."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from endo_label.app import create_app
from endo_label.config import ConfigError, default_config_path, load_settings
from tests.sitting_http import authed_client

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


def test_sitting_help_names_default_ports() -> None:
    result = _sitting("--help")
    assert result.returncode == 0
    assert "7880" in result.stdout
    assert "7881" in result.stdout
    assert "default: 7880" in result.stdout


def test_sitting_binds_7880_unless_port_passed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    frames = _write_pool(tmp_path / "frames", "CLIPA")
    yaml_path = _write_yaml(
        tmp_path / "sitting.yaml",
        frames_root=frames,
        labels_root=tmp_path / "labels",
        allowlist=["CLIPA"],
    )
    captured: dict[str, object] = {}

    def fake_run(app, *, host: str, port: int, workers: int) -> None:
        captured["host"] = host
        captured["port"] = port
        captured["workers"] = workers
        captured["app"] = app

    monkeypatch.setattr("endo_label.__main__.uvicorn.run", fake_run)
    from endo_label.__main__ import main

    main(["--config", str(yaml_path)])
    assert captured["host"] == "127.0.0.1"
    assert captured["port"] == 7880
    assert captured["workers"] == 1

    captured.clear()
    main(["--config", str(yaml_path), "--port", "7999"])
    assert captured["port"] == 7999
    assert captured["host"] == "127.0.0.1"


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
    ]
    if allowlist:
        lines.extend(
            [
                "projects:",
                "  - name: Test",
                "    hospital: Test hospital",
                "    clips:",
            ]
        )
        for clip_id in allowlist:
            lines.extend(
                [
                    f"      - id: {clip_id}",
                    "        kind: jpeg",
                    f"        path: {frames_root / clip_id}",
                ]
            )
    else:
        lines.append("clip_allowlist: []")
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
    client = authed_client(settings)
    clips = client.get("/api/clips")
    assert clips.status_code == 200
    assert clips.json()["clips"] == [
        {"id": "YAMLCLIP", "kind": "jpeg", "frame_count": 2, "fps": 25},
    ]

    added = client.post("/api/vocab/phases", json={"name": "Preparation"})
    assert added.status_code == 200
    span = client.post(
        "/api/phase/YAMLCLIP/span",
        json={"phase": "Preparation", "from": 0, "to": 0},
    )
    assert span.status_code == 200
    assert span.json()["frames"]["0"] == "Preparation"

    again = authed_client(load_settings(yaml_path))
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

    client = authed_client(load_settings(yaml_path))
    clips = client.get("/api/clips").json()["clips"]
    assert clips == [{"id": "YAMLCLIP", "kind": "jpeg", "frame_count": 1, "fps": 25}]
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
    client = authed_client(load_settings(yaml_path))
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
    client = authed_client(settings)

    for origin in (
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ):
        allowed = client.options(
            "/api/health",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )
        assert allowed.status_code in (200, 204)
        assert allowed.headers.get("access-control-allow-origin") == origin

        got = client.get("/api/health", headers={"Origin": origin})
        assert got.headers.get("access-control-allow-origin") == origin

    blocked = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert blocked.headers.get("access-control-allow-origin") not in (
        "http://evil.example",
        "*",
    )


def _worker_yaml(tmp_path: Path, body: str) -> Path:
    config = tmp_path / "config.yaml"
    config.write_text(body, encoding="utf-8")
    return config


def test_worker_backends_parse_from_yaml(tmp_path: Path) -> None:
    config = _worker_yaml(
        tmp_path,
        "frames_root: /tmp/f\n"
        "predictor_backend: sam31\n"
        "gpu_id: 2\n"
        "scribble_backend: scribble\n"
        "scribble_model_path: models/scribble.pt\n"
        "scribble_sam2_checkpoint: models/sam2.pt\n"
        "scribble_gpu_id: 3\n",
    )
    settings = load_settings(config)
    assert settings.predictor_backend == "sam31"
    assert settings.gpu_id == 2
    assert settings.scribble_backend == "scribble"
    assert settings.scribble_model_path == tmp_path / "models" / "scribble.pt"
    assert settings.scribble_sam2_checkpoint == tmp_path / "models" / "sam2.pt"
    assert settings.scribble_gpu_id == 3


def test_worker_backends_default_fake_without_yaml_keys(tmp_path: Path) -> None:
    config = _worker_yaml(tmp_path, "frames_root: /tmp/f\n")
    settings = load_settings(config)
    assert settings.predictor_backend == "fake"
    assert settings.scribble_backend == "fake"
    assert settings.scribble_model_path is None


def test_unknown_worker_backend_refuses(tmp_path: Path) -> None:
    config = _worker_yaml(tmp_path, "frames_root: /tmp/f\npredictor_backend: vlm\n")
    with pytest.raises(ConfigError, match="predictor_backend"):
        load_settings(config)


def test_sam31_paths_default_to_old_tool_kit(tmp_path: Path) -> None:
    config = _worker_yaml(tmp_path, "frames_root: /tmp/f\npredictor_backend: sam31\n")
    settings = load_settings(config)
    assert settings.sam31_checkpoint == Path(
        "/data3/yky/sam3_1_label_tool/sam31_label_kit/ckpt/sam3.1_multiplex.pt"
    )
    assert settings.sam31_repo == Path("/data3/yky/sam3_1_label_tool/sam3")


def test_mask_session_caps_and_timeout_parse_from_yaml(tmp_path: Path) -> None:
    config = _worker_yaml(
        tmp_path,
        "frames_root: /tmp/f\n"
        "mask_sessions_per_user: 3\n"
        "mask_sessions_global: 9\n"
        "mask_inference_timeout: 12.5\n",
    )
    settings = load_settings(config)
    assert settings.mask_sessions_per_user == 3
    assert settings.mask_sessions_global == 9
    assert settings.mask_inference_timeout == 12.5


def test_mask_session_caps_default_two_and_eight(tmp_path: Path) -> None:
    config = _worker_yaml(tmp_path, "frames_root: /tmp/f\n")
    settings = load_settings(config)
    assert settings.mask_sessions_per_user == 2
    assert settings.mask_sessions_global == 8
    assert settings.mask_inference_timeout == 30.0
