"""Log source adapters — yield raw lines into the ingest pipeline.

Two implementations:
  * DockerLogSource — wraps docker-py (sync) with a worker thread that pushes
    lines into an asyncio.Queue. Available only when the daemon is reachable.
  * FileReplayLogSource — pure asyncio (aiofiles). Supports both real tail
    (replay_speed=None) and timestamp-paced replay (replay_speed=N, sleeps
    delta_from_prev_line / N seconds between emits) for demos.

Both return an async iterator of (raw_text, ingest_ts) tuples. The runner
hands the raw text to a parser; ingest_ts is the wall-clock time we observed
the line (used as ts fallback when the line itself has no parseable time).
"""
from __future__ import annotations

import asyncio
import os
import threading
import time
from typing import AsyncIterator, Protocol


RawLine = tuple[str, float]  # (raw_text, ingest_ts)


class LogSource(Protocol):
    async def stream(self) -> AsyncIterator[RawLine]: ...
    async def close(self) -> None: ...


# ─── Docker daemon source ───────────────────────────────────────────────────

class DockerUnavailable(RuntimeError):
    """Raised when the Docker daemon can't be reached (e.g. on Render)."""


def docker_available() -> bool:
    """Cheap probe used at site registration to gate Docker sources."""
    try:
        import docker  # type: ignore
        client = docker.from_env(timeout=2)
        client.ping()
        return True
    except Exception:
        return False


class DockerLogSource:
    """Tail a container's stdout/stderr via the Docker daemon socket."""

    def __init__(self, container: str, *, tail: int = 0):
        self.container = container
        self.tail = tail
        self._queue: asyncio.Queue[RawLine | None] = asyncio.Queue(maxsize=2000)
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._dropped = 0

    @property
    def dropped(self) -> int:
        return self._dropped

    async def _start_thread(self) -> None:
        try:
            import docker  # type: ignore
        except ImportError as e:
            raise DockerUnavailable("docker SDK not installed") from e

        try:
            client = docker.from_env(timeout=5)
            client.ping()
            container = client.containers.get(self.container)
        except Exception as e:
            raise DockerUnavailable(f"docker: {e}") from e

        loop = asyncio.get_running_loop()

        def _worker():
            try:
                stream = container.logs(stream=True, follow=True, tail=self.tail, timestamps=False)
                for chunk in stream:
                    if self._stop.is_set():
                        break
                    # docker-py yields bytes; may be multi-line
                    text = chunk.decode("utf-8", errors="replace") if isinstance(chunk, bytes) else str(chunk)
                    for line in text.splitlines():
                        if not line:
                            continue
                        ts = time.time()
                        try:
                            loop.call_soon_threadsafe(self._queue.put_nowait, (line, ts))
                        except asyncio.QueueFull:
                            self._dropped += 1
            except Exception:
                # surface to consumer by terminating the queue
                pass
            finally:
                try:
                    loop.call_soon_threadsafe(self._queue.put_nowait, None)
                except Exception:
                    pass

        self._thread = threading.Thread(target=_worker, daemon=True, name=f"docker-tail-{self.container}")
        self._thread.start()

    async def stream(self) -> AsyncIterator[RawLine]:
        await self._start_thread()
        while True:
            item = await self._queue.get()
            if item is None:
                return
            yield item

    async def close(self) -> None:
        self._stop.set()


# ─── File-replay source ─────────────────────────────────────────────────────

class FileReplayLogSource:
    """Tail a file. Replay timestamps proportionally if `replay_speed` given.

    Modes:
      - replay_speed=None  → tail -f (poll every 200 ms for new bytes).
      - replay_speed=N>0   → read existing file front-to-back, pace sleeps to
        timestamp deltas / N. If `loop=True`, restart from top at EOF.
    """

    def __init__(self, path: str, *, replay_speed: float | None = None, loop: bool = False):
        self.path = path
        self.replay_speed = replay_speed
        self.loop = loop
        self._closed = False

    async def _parse_ts(self, line: str) -> float | None:
        # Avoid a full parser pipeline — peek at JSON + nginx ts formats only.
        # Cheap, correct enough for pacing.
        from .parsers import _coerce_ts, _parse_nginx_ts, _first, _JSON_KEYS, _NGINX_RE
        line = line.strip()
        if line.startswith("{"):
            try:
                import json as _json
                obj = _json.loads(line)
                v = _first(obj, _JSON_KEYS["ts"])
                return _coerce_ts(v)
            except Exception:
                return None
        m = _NGINX_RE.match(line)
        if m:
            return _parse_nginx_ts(m.group("ts"))
        return None

    async def stream(self) -> AsyncIterator[RawLine]:
        if not os.path.exists(self.path):
            raise FileNotFoundError(self.path)

        import aiofiles  # type: ignore

        if self.replay_speed is None:
            # Real tail: seek to end, poll for appends.
            async with aiofiles.open(self.path, "r", encoding="utf-8", errors="replace") as f:
                await f.seek(0, 2)
                while not self._closed:
                    line = await f.readline()
                    if not line:
                        await asyncio.sleep(0.2)
                        continue
                    yield (line.rstrip("\n"), time.time())
            return

        # Paced replay.
        while not self._closed:
            prev_ts: float | None = None
            async with aiofiles.open(self.path, "r", encoding="utf-8", errors="replace") as f:
                async for raw in f:
                    if self._closed:
                        return
                    line = raw.rstrip("\n")
                    if not line:
                        continue
                    line_ts = await self._parse_ts(line)
                    if line_ts is not None and prev_ts is not None:
                        delta = max(0.0, line_ts - prev_ts) / max(self.replay_speed, 0.001)
                        # cap absurd gaps so demos don't stall
                        delta = min(delta, 5.0)
                        if delta > 0:
                            await asyncio.sleep(delta)
                    else:
                        # tiny pause to keep WS smooth when timestamps absent
                        await asyncio.sleep(1.0 / max(self.replay_speed * 10, 1))
                    if line_ts is not None:
                        prev_ts = line_ts
                    yield (line, time.time())
            if not self.loop:
                return
            # short pause before looping
            await asyncio.sleep(0.5)

    async def close(self) -> None:
        self._closed = True


def build_source(source_type: str, source_config: dict) -> LogSource:
    if source_type == "docker":
        container = source_config.get("container")
        if not container:
            raise ValueError("source_config.container is required for docker")
        return DockerLogSource(container=str(container), tail=int(source_config.get("tail", 0)))
    if source_type == "file_replay":
        path = source_config.get("path")
        if not path:
            raise ValueError("source_config.path is required for file_replay")
        speed = source_config.get("replay_speed")
        return FileReplayLogSource(
            path=str(path),
            replay_speed=float(speed) if speed is not None else None,
            loop=bool(source_config.get("loop", False)),
        )
    raise ValueError(f"unknown source_type: {source_type}")
