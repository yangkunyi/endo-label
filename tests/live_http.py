"""Live HTTP seam: the composed app behind uvicorn, for the workflow event stream.

`TestClient` (and httpx's ASGI transport) runs a request to completion before
returning the response, so a stream that stays open cannot be read through it.
The workflow push tests therefore serve the same composed app — the one
`create_app(Settings(...))` builds — on a loopback socket for the test's life.
"""

from __future__ import annotations

import contextlib
import json
import socket
import threading
import time
from collections.abc import Iterator

import httpx
import uvicorn

from endo_label.app import create_app
from endo_label.config import Settings
from tests.sitting_http import ADMIN_PASSWORD, ADMIN_USERNAME


def _listening_socket() -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", 0))
    sock.listen(64)
    return sock


@contextlib.contextmanager
def live_server(settings: Settings, *, timeout: float = 10.0) -> Iterator[str]:
    """Serve `create_app(settings)` on a loopback port and yield its base URL."""
    app = create_app(settings)
    sock = _listening_socket()
    port = int(sock.getsockname()[1])
    server = uvicorn.Server(uvicorn.Config(app, log_level="warning", lifespan="off"))
    thread = threading.Thread(
        target=server.run, kwargs={"sockets": [sock]}, daemon=True
    )
    thread.start()
    base = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + timeout
    try:
        while True:
            try:
                if httpx.get(f"{base}/api/health", timeout=1.0).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            if time.monotonic() > deadline:
                raise RuntimeError("live server did not start")
            time.sleep(0.02)
        yield base
    finally:
        server.should_exit = True
        thread.join(timeout=timeout)
        sock.close()


def login(
    client: httpx.Client,
    username: str = ADMIN_USERNAME,
    password: str = ADMIN_PASSWORD,
) -> None:
    response = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200, response.text


def account_client(base: str, username: str, password: str) -> httpx.Client:
    """One logged-in Account with its own cookie jar."""
    client = httpx.Client(base_url=base, timeout=10.0)
    login(client, username, password)
    return client


def read_event(lines: Iterator[str]) -> tuple[str | None, dict]:
    """Read one SSE frame: its event name and its JSON payload."""
    name: str | None = None
    while True:
        line = next(lines)
        if line.startswith("event:"):
            name = line[len("event:") :].strip()
        elif line.startswith("data:"):
            return name, json.loads(line[len("data:") :].strip())
