"""Compose seam: Project creation and Clip registration."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.__main__ import main
from endo_label.app import create_app
from endo_label.config import load_settings
from tests.sitting_http import ADMIN_PASSWORD, ADMIN_USERNAME, authed_client, login, seed_admin


def _jpeg_clip(root: Path, clip_id: str, n: int = 2) -> Path:
    clip = root / clip_id
    clip.mkdir(parents=True)
    for index in range(n):
        (clip / f"{index + 1:05d}.jpg").write_bytes(f"jpeg-{clip_id}-{index}".encode())
    return clip


def _bare_yaml(tmp_path: Path, *, extra: str = "") -> Path:
    frames = tmp_path / "frames"
    frames.mkdir(exist_ok=True)
    yaml_path = tmp_path / "sitting.yaml"
    yaml_path.write_text(
        "\n".join(
            [
                f"frames_root: {frames}",
                f"labels_root: {tmp_path / 'labels'}",
                extra,
            ]
        ).rstrip()
        + "\n",
        encoding="utf-8",
    )
    return yaml_path


def test_creating_a_project_and_registering_media_shows_in_projects_and_clip_directory(
    tmp_path: Path, capsys
) -> None:
    yaml_path = _bare_yaml(tmp_path)
    media = _jpeg_clip(tmp_path / "frames", "CASE01")
    main(
        [
            "create-project",
            "West China Chole",
            "--hospital",
            "West China",
            "--config",
            str(yaml_path),
        ]
    )
    created = capsys.readouterr().out
    assert "West China Chole" in created
    main(
        [
            "register-clip",
            "CASE01",
            "--project",
            "West China Chole",
            "--kind",
            "jpeg",
            "--path",
            str(media),
            "--config",
            str(yaml_path),
        ]
    )
    registered = capsys.readouterr().out
    assert "CASE01" in registered

    client = authed_client(load_settings(yaml_path))
    projects = client.get("/api/projects")
    assert projects.status_code == 200
    assert projects.json()["projects"] == [
        {
            "id": 1,
            "name": "West China Chole",
            "hospital": "West China",
            "clips": [{"id": "CASE01", "kind": "jpeg"}],
            "members": [],
        }
    ]
    clips = client.get("/api/clips")
    assert clips.status_code == 200
    assert clips.json()["clips"] == [
        {"id": "CASE01", "kind": "jpeg", "frame_count": 2, "fps": 25},
    ]
    meta = client.get("/api/clips/CASE01")
    assert meta.status_code == 200
    assert meta.json()["id"] == "CASE01"
    assert client.get("/api/clips/CASE01/frames/0").content == b"jpeg-CASE01-0"


def test_yaml_projects_register_when_sitting_starts(tmp_path: Path) -> None:
    media = _jpeg_clip(tmp_path / "frames", "YAMLCASE")
    yaml_path = _bare_yaml(
        tmp_path,
        extra="\n".join(
            [
                "projects:",
                "  - name: YAML Study",
                "    hospital: Test Hospital",
                "    clips:",
                "      - id: YAMLCASE",
                "        kind: jpeg",
                f"        path: {media}",
            ]
        ),
    )
    client = authed_client(load_settings(yaml_path))
    assert client.get("/api/projects").json()["projects"] == [
        {
            "id": 1,
            "name": "YAML Study",
            "hospital": "Test Hospital",
            "clips": [{"id": "YAMLCASE", "kind": "jpeg"}],
            "members": [],
        }
    ]
    assert client.get("/api/clips").json()["clips"] == [
        {"id": "YAMLCASE", "kind": "jpeg", "frame_count": 2, "fps": 25},
    ]


def test_same_media_in_two_projects_yields_two_independently_openable_clips(
    tmp_path: Path, capsys
) -> None:
    yaml_path = _bare_yaml(tmp_path)
    media = _jpeg_clip(tmp_path / "frames", "SHARED")
    main(["create-project", "Study West", "--hospital", "West China", "--config", str(yaml_path)])
    main(["create-project", "Study East", "--hospital", "Huashan", "--config", str(yaml_path)])
    capsys.readouterr()
    for clip_id, project in (("WEST-SHARED", "Study West"), ("EAST-SHARED", "Study East")):
        main(
            [
                "register-clip",
                clip_id,
                "--project",
                project,
                "--kind",
                "jpeg",
                "--path",
                str(media),
                "--config",
                str(yaml_path),
            ]
        )
    capsys.readouterr()

    client = authed_client(load_settings(yaml_path))
    listed = {row["id"] for row in client.get("/api/clips").json()["clips"]}
    assert listed == {"WEST-SHARED", "EAST-SHARED"}
    projects = {row["name"]: row for row in client.get("/api/projects").json()["projects"]}
    assert projects["Study West"]["clips"] == [{"id": "WEST-SHARED", "kind": "jpeg"}]
    assert projects["Study East"]["clips"] == [{"id": "EAST-SHARED", "kind": "jpeg"}]

    west = client.get("/api/clips/WEST-SHARED")
    east = client.get("/api/clips/EAST-SHARED")
    assert west.status_code == 200
    assert east.status_code == 200
    assert west.json()["frame_count"] == 2
    assert east.json()["frame_count"] == 2
    assert client.get("/api/clips/WEST-SHARED/frames/0").content == b"jpeg-SHARED-0"
    assert client.get("/api/clips/EAST-SHARED/frames/0").content == b"jpeg-SHARED-0"

    added = client.post("/api/vocab/phases", json={"name": "Preparation"})
    assert added.status_code == 200, added.text
    span = client.post(
        "/api/phase/WEST-SHARED/span",
        json={"phase": "Preparation", "from": 0, "to": 0},
    )
    assert span.status_code == 200, span.text
    assert span.json()["frames"]["0"] == "Preparation"
    assert client.get("/api/phase/EAST-SHARED").json()["frames"] == {}


def test_unregistered_media_does_not_appear_in_the_directory(tmp_path: Path, capsys) -> None:
    yaml_path = _bare_yaml(tmp_path)
    visible = _jpeg_clip(tmp_path / "frames", "VISIBLE")
    _jpeg_clip(tmp_path / "frames", "HIDDENCLIP")
    main(["create-project", "Only Visible", "--hospital", "West China", "--config", str(yaml_path)])
    main(
        [
            "register-clip",
            "VISIBLE",
            "--project",
            "Only Visible",
            "--kind",
            "jpeg",
            "--path",
            str(visible),
            "--config",
            str(yaml_path),
        ]
    )
    capsys.readouterr()

    client = authed_client(load_settings(yaml_path))
    listed = {row["id"] for row in client.get("/api/clips").json()["clips"]}
    assert listed == {"VISIBLE"}
    assert "HIDDENCLIP" not in listed
    missing = client.get("/api/clips/HIDDENCLIP")
    assert missing.status_code == 404
    assert "HIDDENCLIP" in missing.json()["detail"]


def test_clip_allowlist_no_longer_registers_media(tmp_path: Path) -> None:
    frames = tmp_path / "frames"
    _jpeg_clip(frames, "CLIPA")
    yaml_path = tmp_path / "sitting.yaml"
    yaml_path.write_text(
        "\n".join(
            [
                f"frames_root: {frames}",
                f"labels_root: {tmp_path / 'labels'}",
                "clip_allowlist:",
                "  - CLIPA",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    settings = load_settings(yaml_path)
    seed_admin(settings)
    client = TestClient(create_app(settings))
    login(client, username=ADMIN_USERNAME, password=ADMIN_PASSWORD)
    assert client.get("/api/clips").json() == {"clips": []}
    assert client.get("/api/projects").json() == {"projects": []}
    assert client.get("/api/clips/CLIPA").status_code == 404
