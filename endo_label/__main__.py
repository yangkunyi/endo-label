"""Sitting entry: YAML config, then compose HTTP on 127.0.0.1:7880."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import uvicorn

from endo_label.app import create_app
from endo_label.config import ConfigError, load_settings


def main(argv: list[str] | None = None) -> None:
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
        help="Bind port (default: 7880). Playwright e2e uses 7891.",
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


if __name__ == "__main__":
    main()
