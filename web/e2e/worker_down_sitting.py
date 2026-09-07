"""Playwright-only sitting on :7893 whose SAM worker failed to load.

Serves the same compose app with a predictor checkpoint path that does not
exist, so Session create 503s without touching torch or a GPU while
phase/class/triplet stay writable. Roots are isolated under
web/e2e/.work/down; the webServer entry in playwright.config.ts starts it.
"""

from dataclasses import replace
from pathlib import Path

import uvicorn

from endo_label.app import create_app
from endo_label.config import load_settings

HERE = Path(__file__).resolve().parent
PORT = 7893


def main() -> None:
    cfg = replace(
        load_settings(HERE / "config.yaml"),
        predictor_backend="sam31",
        sam31_checkpoint=HERE / ".work" / "down" / "missing" / "sam31.pt",
        sam31_repo=HERE / ".work" / "down" / "missing" / "sam3",
        labels_root=HERE / ".work" / "down" / "labels",
        annotations_root=HERE / ".work" / "down" / "mask",
    )
    uvicorn.run(create_app(cfg), host="127.0.0.1", port=PORT, workers=1)


if __name__ == "__main__":
    main()
