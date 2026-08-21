"""Compose four backends: phase, class, triplet, mask. Mask Session is optional."""

from __future__ import annotations

from endo_label.config import Settings, load_settings
from endo_label.frame_class.router import make_router as class_router
from endo_label.mask.http import create_app as create_mask_app
from endo_label.phase.router import make_router as phase_router
from endo_label.triplet.router import make_router as triplet_router
from endo_label.vocab_router import make_router as vocab_router


def create_app(settings: Settings | None = None):
    cfg = settings if settings is not None else load_settings()
    app = create_mask_app(cfg)
    app.include_router(phase_router(cfg))
    app.include_router(class_router(cfg))
    app.include_router(triplet_router(cfg))
    app.include_router(vocab_router(cfg))
    app.state.backends = ("phase", "class", "triplet", "mask")
    return app
