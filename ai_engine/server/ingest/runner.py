"""Per-site ingest task orchestrator.

For each registered site, runner.start_site() kicks off two asyncio tasks:
  * _ingest_loop  — pulls from the LogSource, parses, buffers, aggregates,
                    coalesces 100ms of log events into a single WS batch.
  * _tick_loop    — every 30s, drains dirty endpoint keys from SiteState,
                    re-runs predict_one for each, broadcasts endpoint_update.

stop_site() cancels both tasks and drops the SiteState/buffer.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import asdict
from typing import Callable

import httpx

from .aggregator import Aggregator
from .buffer import BufferRegistry, RingBuffer
from .parsers import LogEvent, detect_format, get_parser
from .site_state import SiteState, SiteStateRegistry
from .sources import LogSource, build_source
from .ws_hub import WSHub


import os

# How often the dirty-endpoint queue is drained → re-inference + WS broadcast.
# Per-endpoint cooldown still applies in the aggregator (5s) so dropping this
# doesn't cause inference storms. Env-overridable for tests/demos.
TICK_SECONDS = float(os.environ.get("ZH_INGEST_TICK_SECONDS", "3.0"))
FLUSH_BATCH_SECONDS = 0.1
PIPE_BASE_URL = os.environ.get("ZH_PIPE_BASE_URL", "http://localhost:8000").rstrip("/")


def _event_to_wire(ev: LogEvent, seq: int) -> dict:
    return {
        "seq": seq,
        "ts": ev.ts,
        "method": ev.method,
        "path": ev.path,
        "status": ev.status,
        "latency_ms": ev.latency_ms,
        "auth_present": ev.auth_present,
        "raw": ev.raw,
        "parsed": ev.parsed,
    }


class IngestRunner:
    """Owns all per-site tasks. One instance per process, held on app state."""

    def __init__(
        self,
        states: SiteStateRegistry,
        buffers: BufferRegistry,
        ws_hub: WSHub,
        predict_fn: Callable[[dict, str], dict],
    ):
        self.states = states
        self.buffers = buffers
        self.ws_hub = ws_hub
        self.predict_fn = predict_fn
        self._tasks: dict[str, list[asyncio.Task]] = {}
        self._sources: dict[str, LogSource] = {}
        self._aggregators: dict[str, Aggregator] = {}
        self._format_detected: dict[str, bool] = {}
        self._pipe_client = httpx.AsyncClient(timeout=1.5)

    def aggregator(self, site_id: str) -> Aggregator | None:
        return self._aggregators.get(site_id)

    async def start_site(self, site: dict) -> SiteState:
        """`site` is the persisted dict from sites/db.py (already validated)."""
        site_id = site["id"]
        if site_id in self._tasks:
            return self.states.get(site_id)  # already running

        state = self.states.create(
            site_id=site_id,
            name=site["name"],
            service_lane=site["service_lane"],
            runtime=site.get("runtime", "python"),
            runtime_version=site.get("runtime_version", "3.11"),
        )

        source = build_source(site["source_type"], site["source_config"])
        self._sources[site_id] = source
        self._aggregators[site_id] = Aggregator(state)
        self._format_detected[site_id] = False

        ingest_task = asyncio.create_task(self._ingest_loop(site_id, source))
        tick_task = asyncio.create_task(self._tick_loop(site_id))
        self._tasks[site_id] = [ingest_task, tick_task]
        return state

    async def stop_site(self, site_id: str) -> None:
        tasks = self._tasks.pop(site_id, [])
        for t in tasks:
            t.cancel()
        for t in tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        src = self._sources.pop(site_id, None)
        if src:
            try:
                await src.close()
            except Exception:
                pass
        await self.ws_hub.close_site(site_id)
        self._aggregators.pop(site_id, None)
        self._format_detected.pop(site_id, None)
        self.buffers.drop(site_id)
        self.states.drop(site_id)

    async def shutdown(self) -> None:
        for site_id in list(self._tasks.keys()):
            await self.stop_site(site_id)
        await self._pipe_client.aclose()

    # ─── internals ──────────────────────────────────────────────────────────

    async def _ingest_loop(self, site_id: str, source: LogSource) -> None:
        state = self.states.get(site_id)
        if state is None:
            return
        buf = self.buffers.get(site_id)
        agg = self._aggregators[site_id]

        format_buffer: list[str] = []
        active_parser = None
        coalesced: list[dict] = []
        last_flush = time.monotonic()

        async def flush():
            nonlocal coalesced, last_flush
            if not coalesced:
                return
            batch = coalesced
            coalesced = []
            last_flush = time.monotonic()
            await self.ws_hub.broadcast(site_id, {
                "type": "log_events_batch",
                "site_id": site_id,
                "events": batch,
            })

        backoff = 1.0
        while True:
            try:
                async for raw, ingest_ts in source.stream():
                    state.lines_ingested += 1

                    # Detect format on first ~10 non-empty lines
                    if active_parser is None:
                        if raw.strip():
                            format_buffer.append(raw)
                        if len(format_buffer) >= 10 or state.lines_ingested > 20:
                            fmt = detect_format(format_buffer)
                            state.parser_format = fmt
                            active_parser = get_parser(fmt)
                            # replay buffered lines through chosen parser
                            for buffered in format_buffer:
                                ev0 = (active_parser.parse(buffered, site_id, ingest_ts)
                                       if active_parser
                                       else LogEvent(site_id=site_id, ts=ingest_ts, raw=buffered))
                                seq = buf.append(ev0)
                                agg.ingest(ev0)
                                self._mirror_to_pipe(state, ev0)
                                coalesced.append(_event_to_wire(ev0, seq))
                            format_buffer = []
                        else:
                            # buffer until we know the format
                            ev0 = LogEvent(site_id=site_id, ts=ingest_ts, raw=raw)
                            seq = buf.append(ev0)
                            coalesced.append(_event_to_wire(ev0, seq))
                    else:
                        ev = active_parser.parse(raw, site_id, ingest_ts)
                        seq = buf.append(ev)
                        agg.ingest(ev)
                        self._mirror_to_pipe(state, ev)
                        coalesced.append(_event_to_wire(ev, seq))

                    if time.monotonic() - last_flush >= FLUSH_BATCH_SECONDS:
                        await flush()
                # source ended cleanly
                await flush()
                return
            except asyncio.CancelledError:
                await flush()
                raise
            except Exception as e:
                # log + back off + retry the source
                await self.ws_hub.broadcast(site_id, {
                    "type": "ingest_error",
                    "site_id": site_id,
                    "error": str(e),
                })
                await asyncio.sleep(min(backoff, 30.0))
                backoff = min(backoff * 2, 30.0)

    async def _tick_loop(self, site_id: str) -> None:
        state = self.states.get(site_id)
        if state is None:
            return
        agg = self._aggregators[site_id]
        while True:
            try:
                await asyncio.sleep(TICK_SECONDS)
                await self._reinfer_dirty(state, agg)
            except asyncio.CancelledError:
                return
            except Exception:
                # never let a bad inference kill the loop
                await asyncio.sleep(2.0)

    async def _reinfer_dirty(self, state: SiteState, agg: Aggregator) -> None:
        keys = state.drain_dirty()
        if not keys:
            return
        updates: list[dict] = []
        for key in keys:
            feats = agg.features_for(key)
            if not feats:
                continue
            uid = state.assign_endpoint_id(key)
            full = self._build_feature_row(state, feats)
            try:
                ep = self.predict_fn(full, uid)
            except Exception as e:
                await self.ws_hub.broadcast(state.site_id, {
                    "type": "inference_error",
                    "site_id": state.site_id,
                    "endpoint_key": key,
                    "error": str(e),
                })
                continue
            ep["warming_up"] = agg.is_warming_up(key)
            state.update_endpoint(key, ep, feats)
            updates.append(ep)

        for ep in updates:
            await self.ws_hub.broadcast(state.site_id, {
                "type": "endpoint_update",
                "site_id": state.site_id,
                "endpoint": ep,
            })

    @staticmethod
    def _build_feature_row(state: SiteState, observed: dict) -> dict:
        """Combine aggregator output with per-site registration defaults."""
        return {
            **observed,
            "service": state.service,
            "runtime": state.runtime,
            "runtime_version": state.runtime_version,
        }

    def _mirror_to_pipe(self, state: SiteState, ev: LogEvent) -> None:
        """Best-effort bridge: live probe lines also materialize in pipe's graph."""
        if not ev.parsed or not ev.method or not ev.path:
            return

        payload = {
            "site_id": state.site_id,
            "site_name": state.name,
            "service": state.service,
            "runtime": state.runtime,
            "runtime_version": state.runtime_version,
            "method": ev.method,
            "path": ev.path,
            "status_code": ev.status,
            "latency_ms": ev.latency_ms,
            "auth_present": ev.auth_present,
            "client_id": state.name,
        }
        asyncio.create_task(self._post_pipe_traffic(payload))

    async def _post_pipe_traffic(self, payload: dict) -> None:
        try:
            await self._pipe_client.post(f"{PIPE_BASE_URL}/api/live/traffic", json=payload)
        except Exception:
            # The live probe must keep running even if the Rust graph backend is
            # down or restarting. The borehole detail page still uses ai_engine.
            return
