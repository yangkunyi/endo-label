"""Workflow push: assignment transitions fan out to the SSE subscribers of one app.

The items router is the only writer: after a transition commits it publishes one
event carrying the item's identity (Clip, Task type) and its new state. Every
subscriber of ``GET /api/events`` receives it and refetches the lists it renders.

A subscriber that (re)connects is always greeted with a ``resync`` frame first.
Events missed while it was away are not replayed, so the subscription starts by
telling the client to refetch everything it shows — the fallback that keeps a
dropped connection from leaving a stale list on screen.

SSE rather than a WebSocket: the cookie-authenticated GET needs no handshake
code, and the browser reopens a dropped EventSource on its own, so reconnecting
is one less thing the client has to get right.
"""

from __future__ import annotations

import asyncio
import json
import threading
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

STREAM_PATH = "/api/events"
RESYNC = "resync"
TRANSITION = "transition"

router = APIRouter(tags=["events"])


def format_event(name: str, data: dict[str, Any]) -> str:
    """One SSE frame; the blank line is what ends it."""
    return f"event: {name}\ndata: {json.dumps(data)}\n\n"


@dataclass
class _Listener:
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue


class EventBroker:
    """In-process fan-out from publishing requests to this app's subscribers.

    Publishes arrive on worker threads (sync request handlers) while listeners
    await their queue on the server's event loop, so every delivery hops back to
    the listener's own loop.
    """

    def __init__(self) -> None:
        self._listeners: list[_Listener] = []
        self._lock = threading.Lock()

    def subscribe(self, loop: asyncio.AbstractEventLoop) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        with self._lock:
            self._listeners.append(_Listener(loop=loop, queue=queue))
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        with self._lock:
            self._listeners = [row for row in self._listeners if row.queue is not queue]

    def publish(self, event: dict[str, Any]) -> None:
        with self._lock:
            listeners = list(self._listeners)
        for listener in listeners:
            try:
                listener.loop.call_soon_threadsafe(listener.queue.put_nowait, dict(event))
            except RuntimeError:
                # The subscriber's loop is gone; its own cleanup unsubscribes it.
                continue


def publish_transition(app, action: str, item: dict[str, Any]) -> None:
    """Publish one committed transition to every subscriber of this app."""
    broker: EventBroker = app.state.events
    broker.publish({"action": action, **item})


@router.get(STREAM_PATH)
async def workflow_events(request: Request) -> StreamingResponse:
    broker: EventBroker = request.app.state.events
    queue = broker.subscribe(asyncio.get_running_loop())

    async def frames() -> AsyncIterator[str]:
        try:
            yield format_event(RESYNC, {"reason": "connected"})
            while True:
                yield format_event(TRANSITION, await queue.get())
        finally:
            broker.unsubscribe(queue)

    return StreamingResponse(
        frames(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store"},
    )
