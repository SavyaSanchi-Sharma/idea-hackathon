"""Per-site ring buffer of LogEvents.

Single source of truth for "recent logs" — read by:
  - WS push (most recent N for live tail)
  - GET /api/sites/{id}/logs (paginated tail)
  - Chat (last N lines for grounded answers)

Bounded by `maxlen` so memory stays predictable under floods.
"""
from __future__ import annotations

from collections import deque
from threading import Lock
from typing import Iterable

from .parsers import LogEvent


class RingBuffer:
    def __init__(self, maxlen: int = 10_000):
        self._buf: deque[LogEvent] = deque(maxlen=maxlen)
        self._lock = Lock()
        self._seq = 0  # monotonic event counter for stable cite-IDs

    def append(self, ev: LogEvent) -> int:
        with self._lock:
            self._seq += 1
            self._buf.append(ev)
            return self._seq

    def recent(self, n: int = 200, since_ts: float | None = None) -> list[LogEvent]:
        with self._lock:
            items = list(self._buf)
        if since_ts is not None:
            items = [e for e in items if e.ts >= since_ts]
        return items[-n:] if n else items

    def __len__(self) -> int:
        return len(self._buf)


class BufferRegistry:
    """Holds one RingBuffer per site_id. Created lazily on first append."""

    def __init__(self, maxlen: int = 10_000):
        self._buffers: dict[str, RingBuffer] = {}
        self._maxlen = maxlen
        self._lock = Lock()

    def get(self, site_id: str) -> RingBuffer:
        with self._lock:
            buf = self._buffers.get(site_id)
            if buf is None:
                buf = RingBuffer(self._maxlen)
                self._buffers[site_id] = buf
            return buf

    def drop(self, site_id: str) -> None:
        with self._lock:
            self._buffers.pop(site_id, None)

    def site_ids(self) -> Iterable[str]:
        with self._lock:
            return list(self._buffers.keys())
