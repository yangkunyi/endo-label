"""Sitting entry: YAML config, then compose HTTP on 127.0.0.1:7880."""

from __future__ import annotations

import argparse
import secrets
import sys
from pathlib import Path

import uvicorn

from endo_label.app import create_app
from endo_label.config import ConfigError, Settings, load_settings
from endo_label.coordination import (
    AccountExists,
    ClipExists,
    ProjectExists,
    ProjectNotFound,
    UnknownAccount,
    add_project_member,
    create_account,
    create_project,
    db_path,
    get_project_by_name,
    register_clip,
)


def main(argv: list[str] | None = None) -> None:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "create-admin":
        _create_admin(argv[1:])
        return
    if argv and argv[0] == "create-project":
        _create_project(argv[1:])
        return
    if argv and argv[0] == "register-clip":
        _register_clip(argv[1:])
        return
    if argv and argv[0] == "add-member":
        _add_member(argv[1:])
        return
    parser = argparse.ArgumentParser(prog="endo_label")
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="YAML sitting config (default: repo-root config.yaml)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=7880,
        help="Bind port (default: 7880). Playwright e2e uses 7881.",
    )
    args = parser.parse_args(argv)
    if args.port <= 0 or args.port > 65535:
        print(f"invalid --port {args.port}", file=sys.stderr)
        raise SystemExit(2)
    try:
        settings = load_settings(args.config)
    except ConfigError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
    uvicorn.run(create_app(settings), host="127.0.0.1", port=args.port, workers=1)


def _create_admin(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="endo_label create-admin")
    parser.add_argument("username", help="Admin Account username")
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="YAML sitting config (default: repo-root config.yaml)",
    )
    parser.add_argument(
        "--password",
        default=None,
        help="Password (default: generate a temporary password)",
    )
    args = parser.parse_args(argv)
    username = args.username.strip()
    if not username:
        print("username is required", file=sys.stderr)
        raise SystemExit(2)
    try:
        settings = load_settings(args.config)
    except ConfigError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
    password = args.password if args.password else secrets.token_urlsafe(12)
    try:
        create_account(
            db_path(settings),
            username,
            password,
            admin=True,
            reviewer=False,
            annotator=False,
        )
    except AccountExists:
        print(f"Account already exists: {username}")
        return
    print(f"Created admin Account '{username}'")
    print(f"Temporary password: {password}")


def _load_sitting(config: Path | None) -> Settings:
    try:
        return load_settings(config)
    except ConfigError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc


def _create_project(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="endo_label create-project")
    parser.add_argument("name", help="Project name (study name)")
    parser.add_argument(
        "--hospital",
        default="",
        help="Hospital field",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="YAML sitting config (default: repo-root config.yaml)",
    )
    args = parser.parse_args(argv)
    name = args.name.strip()
    if not name:
        print("name is required", file=sys.stderr)
        raise SystemExit(2)
    settings = _load_sitting(args.config)
    try:
        project = create_project(db_path(settings), name, args.hospital)
    except ProjectExists:
        print(f"Project already exists: {name}")
        return
    print(f"Created Project '{project.name}' (id={project.id})")


def _register_clip(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="endo_label register-clip")
    parser.add_argument("clip_id", help="Clip id (unique across Projects)")
    parser.add_argument("--project", required=True, help="Project name")
    parser.add_argument("--kind", required=True, choices=("jpeg", "video"))
    parser.add_argument("--path", required=True, type=Path, help="Source media path")
    parser.add_argument(
        "--tag",
        action="append",
        default=[],
        help="Clip tag for cross-cutting filtering (repeatable)",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="YAML sitting config (default: repo-root config.yaml)",
    )
    args = parser.parse_args(argv)
    settings = _load_sitting(args.config)
    path = db_path(settings)
    try:
        project = get_project_by_name(path, args.project)
    except ProjectNotFound:
        print(f"Project not found: {args.project}", file=sys.stderr)
        raise SystemExit(1) from None
    try:
        clip = register_clip(
            path,
            project_id=project.id,
            clip_id=args.clip_id,
            kind=args.kind,
            media_path=args.path,
            tags=args.tag,
        )
    except (ClipExists, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
    print(f"Registered Clip '{clip.id}' in Project '{project.name}'")


def _add_member(argv: list[str]) -> None:
    """Bootstrap a Project's membership without the console: endo_label add-member."""
    parser = argparse.ArgumentParser(prog="endo_label add-member")
    parser.add_argument("project", help="Project name")
    parser.add_argument("username", help="Account to add to the Project")
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="YAML sitting config (default: repo-root config.yaml)",
    )
    args = parser.parse_args(argv)
    settings = _load_sitting(args.config)
    path = db_path(settings)
    try:
        project = get_project_by_name(path, args.project)
    except ProjectNotFound:
        print(f"Project not found: {args.project}", file=sys.stderr)
        raise SystemExit(1) from None
    try:
        add_project_member(path, project.id, args.username)
    except UnknownAccount:
        print(f"Account not found: {args.username}", file=sys.stderr)
        raise SystemExit(1) from None
    print(f"Added Account '{args.username.strip()}' to Project '{project.name}'")


if __name__ == "__main__":
    main()
