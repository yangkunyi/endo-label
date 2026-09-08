"""Sitting entry: YAML config, then compose HTTP on 127.0.0.1:7880."""

from __future__ import annotations

import argparse
import secrets
import sys
from pathlib import Path

import uvicorn

from endo_label.app import create_app
from endo_label.config import ConfigError, load_settings
from endo_label.coordination import AccountExists, create_account, db_path


def main(argv: list[str] | None = None) -> None:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "create-admin":
        _create_admin(argv[1:])
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


if __name__ == "__main__":
    main()
