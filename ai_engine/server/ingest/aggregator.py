"""Rolling-window per-endpoint aggregator.

Each event drops into an EndpointWindow keyed by (site_id, method+path). The
window evicts data older than `window_seconds` and emits a 23-col feature
dict on demand — the exact schema `predict_one()` expects.

Two debounce paths into re-inference:
  * Tick: runner calls `drain_dirty()` every 30s.
  * Spike: aggregator marks dirty immediately on first-seen endpoint, on
    auth-fail-rate drift > 0.10, or on call-count change > 50% (with a 5s
    per-endpoint cooldown to absorb floods).
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from threading import Lock

import numpy as np

from .parsers import LogEvent
from .site_state import SiteState


WINDOW_SECONDS = 24 * 3600        # 24h rolling window
SEVEN_DAYS = 7 * 86400
SPIKE_COOLDOWN = 5.0              # seconds — per-endpoint mark-dirty floor
WARMUP_SECONDS = 5 * 60           # use raw counts until window has 5 min of data
AUTH_FAIL_DELTA = 0.10
CALL_COUNT_REL_DELTA = 0.50


@dataclass
class _EventTuple:
    ts: float
    status: int | None
    latency: float | None
    auth: bool | None


@dataclass
class EndpointWindow:
    method: str
    path: str
    events: deque = field(default_factory=lambda: deque(maxlen=20000))
    last_seen_ts: float = 0.0
    first_seen_ts: float = field(default_factory=time.time)
    _lock: Lock = field(default_factory=Lock, repr=False)

    def append(self, ev: LogEvent) -> None:
        with self._lock:
            now = time.time()
            self.events.append(_EventTuple(
                ts=ev.ts or now,
                status=ev.status,
                latency=ev.latency_ms,
                auth=ev.auth_present,
            ))
            self.last_seen_ts = max(self.last_seen_ts, ev.ts or now)
            self._evict_locked(now)

    def _evict_locked(self, now: float) -> None:
        cutoff = now - WINDOW_SECONDS
        while self.events and self.events[0].ts < cutoff:
            self.events.popleft()

    def features(self, now: float | None = None) -> dict:
        with self._lock:
            n = now or time.time()
            self._evict_locked(n)
            evts = list(self.events)

        observed = max(0.001, n - self.first_seen_ts)
        if observed < WARMUP_SECONDS:
            # Cold start: use raw count, mark warming-up via small extrapolation.
            call_count_7d = float(len(evts))
        else:
            extrap = min(1.0, observed / SEVEN_DAYS)
            call_count_7d = float(len(evts)) / max(extrap, 0.01)

        statuses = [e.status for e in evts if e.status is not None]
        fail = sum(1 for s in statuses if s in (401, 403))
        auth_fail_rate = (fail / len(statuses)) if statuses else 0.0

        latencies = [e.latency for e in evts if e.latency is not None and e.latency > 0]
        if latencies:
            p95 = float(np.percentile(latencies, 95))
        else:
            p95 = 0.0

        last_seen_days = max(0.0, (n - self.last_seen_ts) / 86400.0) if self.last_seen_ts else 0.0

        any_auth = any(e.auth for e in evts if e.auth is not None)

        return {
            "endpoint": self.path,
            "method": self.method.upper(),
            "call_count_7d": int(call_count_7d),
            "auth_fail_rate_7d": float(round(auth_fail_rate, 4)),
            "p95_latency_ms": float(round(p95, 1)),
            "last_seen_days": float(round(last_seen_days, 3)),
            "auth_scheme": "http:bearer" if any_auth else "none",
        }


class Aggregator:
    """Holds EndpointWindows for one site and tracks dirty endpoints."""

    def __init__(self, state: SiteState):
        self.state = state
        self._windows: dict[str, EndpointWindow] = {}
        self._lock = Lock()
        self._mark_cooldown: dict[str, float] = defaultdict(float)

    def ingest(self, ev: LogEvent) -> None:
        if not ev.parsed or not ev.endpoint_key:
            return
        key = ev.endpoint_key
        with self._lock:
            win = self._windows.get(key)
            if win is None:
                win = EndpointWindow(method=ev.method or "GET", path=ev.path or "/unknown")
                self._windows[key] = win
                self._maybe_mark_dirty_unlocked(key, first_seen=True)
        win.append(ev)
        self._evaluate_spike(key, win)

    def _evaluate_spike(self, key: str, win: EndpointWindow) -> None:
        # Compare current features to last-inferred snapshot.
        prev = self.state.last_inferred.get(key)
        if not prev:
            # already marked on first-seen path
            return
        cur = win.features()
        delta_auth = abs(cur["auth_fail_rate_7d"] - prev.get("auth_fail_rate_7d", 0.0))
        prev_calls = max(1, prev.get("call_count_7d", 1))
        rel_calls = abs(cur["call_count_7d"] - prev_calls) / prev_calls
        if delta_auth >= AUTH_FAIL_DELTA or rel_calls >= CALL_COUNT_REL_DELTA:
            with self._lock:
                self._maybe_mark_dirty_unlocked(key)

    def _maybe_mark_dirty_unlocked(self, key: str, first_seen: bool = False) -> None:
        now = time.time()
        if not first_seen and now - self._mark_cooldown[key] < SPIKE_COOLDOWN:
            return
        self._mark_cooldown[key] = now
        self.state.mark_dirty(key)

    def features_for(self, endpoint_key: str) -> dict | None:
        with self._lock:
            win = self._windows.get(endpoint_key)
        if win is None:
            return None
        return win.features()

    def endpoint_keys(self) -> list[str]:
        with self._lock:
            return list(self._windows.keys())

    def is_warming_up(self, endpoint_key: str) -> bool:
        with self._lock:
            win = self._windows.get(endpoint_key)
        if not win:
            return True
        return (time.time() - win.first_seen_ts) < WARMUP_SECONDS
