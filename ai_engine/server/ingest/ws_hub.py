"""WebSocket fan-out per site.

Runner emits messages via `broadcast(site_id, msg)`; the hub iterates the
set of subscribers, drops sockets whose send raises. Per-site connection
sets so closing one tab doesn't affect siblings.
"""
from __future__ import annotations

import asyncio
import json
from threading import Lock
from typing import Any

from fastapi import WebSocket


class WSHub:
    def __init__(self):
        self._conns: dict[str, set[WebSocket]] = {}
        self._lock = Lock()

    def subscribe(self, site_id: str, ws: WebSocket) -> None:
        with self._lock:
            self._conns.setdefault(site_id, set()).add(ws)

    def unsubscribe(self, site_id: str, ws: WebSocket) -> None:
        with self._lock:
            conns = self._conns.get(site_id)
            if conns:
                conns.discard(ws)
                if not conns:
                    self._conns.pop(site_id, None)

    def subscribers(self, site_id: str) -> int:
        with self._lock:
            return len(self._conns.get(site_id, ()))

    async def broadcast(self, site_id: str, msg: dict[str, Any]) -> None:
        with self._lock:
            targets = list(self._conns.get(site_id, ()))
        if not targets:
            return
        payload = json.dumps(msg, default=str)
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        if dead:
            with self._lock:
                conns = self._conns.get(site_id)
                if conns:
                    for ws in dead:
                        conns.discard(ws)

    async def close_site(self, site_id: str) -> None:
        with self._lock:
            conns = self._conns.pop(site_id, set())
        for ws in conns:
            try:
                await ws.close(code=1000)
            except Exception:
                pass
