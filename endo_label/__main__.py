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
    args = parser.parse_args(argv)
    try:
        settings = load_settings(args.config)
    except ConfigError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
    uvicorn.run(create_app(settings), host="127.0.0.1", port=7880)


if __name__ == "__main__":
    main()
