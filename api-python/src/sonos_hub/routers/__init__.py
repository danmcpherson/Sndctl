"""Routers for SonosSoundHub API."""

from .sonos import router as sonos_router
from .macros import router as macros_router
from .voice import router as voice_router

__all__ = [
    "sonos_router",
    "macros_router",
    "voice_router",
]
