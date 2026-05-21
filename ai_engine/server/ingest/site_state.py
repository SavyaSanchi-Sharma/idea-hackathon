"""Per-site live state: discovered endpoints + their latest predictions.

This is the in-memory cache that /api/sites/{id}/endpoints reads from and
that WS endpoint_update broadcasts come from. The aggregator marks endpoints
dirty; the runner's tick loop re-infers them and writes results here.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from threading import Lock


# Hackathon-grade demo defaults — the user picks one service_lane at site
# registration and we map it to the model's `service` column (which the
# regressor/classifier categorical preprocessors expect).
LANE_TO_SERVICE = {
    "core": "core-banking",
    "payments": "payments",
    "upi": "payments",
    "imps": "payments",
    "neft": "payments",
    "rtgs": "payments",
    "cards": "cards",
    "kyc": "kyc",
    "loans": "loans",
    "wealth": "wealth",
    "forex": "forex",
    "audit": "audit",
    "internal": "audit",
    "legacy": "audit",
    "auth": "audit",
    "aml": "kyc",
    "general": "payments",
}


@dataclass
class SiteState:
    site_id: str
    name: str
    service_lane: str
    runtime: str
    runtime_version: str
    # endpoint_key → live endpoint id (lep_<site>_<idx>)
    endpoint_ids: dict[str, str] = field(default_factory=dict)
    # endpoint_key → predicted Endpoint payload (frontend shape)
    endpoints: dict[str, dict] = field(default_factory=dict)
    # endpoint_key → last-inferred snapshot of inputs for delta detection
    last_inferred: dict[str, dict] = field(default_factory=dict)
    # endpoint_key → epoch ts of most recent predict_one call
    last_inferred_at: dict[str, float] = field(default_factory=dict)
    # endpoint_keys that have new data since last inference
    dirty: set[str] = field(default_factory=set)
    # ingest plane health
    started_at: float = field(default_factory=time.time)
    lines_ingested: int = 0
    lines_dropped: int = 0
    parser_format: str = "unknown"
    _ep_counter: int = 0
    _lock: Lock = field(default_factory=Lock, repr=False)

    @property
    def service(self) -> str:
        return LANE_TO_SERVICE.get(self.service_lane, "payments")

    def assign_endpoint_id(self, endpoint_key: str) -> str:
        with self._lock:
            existing = self.endpoint_ids.get(endpoint_key)
            if existing:
                return existing
            self._ep_counter += 1
            uid = f"lep_{self.site_id}_{self._ep_counter:04d}"
            self.endpoint_ids[endpoint_key] = uid
            return uid

    def mark_dirty(self, endpoint_key: str) -> None:
        with self._lock:
            self.dirty.add(endpoint_key)

    def drain_dirty(self) -> list[str]:
        with self._lock:
            keys = list(self.dirty)
            self.dirty.clear()
            return keys

    def snapshot_endpoints(self) -> list[dict]:
        with self._lock:
            return list(self.endpoints.values())

    def update_endpoint(self, endpoint_key: str, endpoint_dict: dict, inputs_snapshot: dict) -> None:
        with self._lock:
            self.endpoints[endpoint_key] = endpoint_dict
            self.last_inferred[endpoint_key] = inputs_snapshot
            self.last_inferred_at[endpoint_key] = time.time()


class SiteStateRegistry:
    """Holds one SiteState per registered site_id."""

    def __init__(self):
        self._states: dict[str, SiteState] = {}
        self._lock = Lock()

    def create(self, site_id: str, name: str, service_lane: str,
               runtime: str, runtime_version: str) -> SiteState:
        with self._lock:
            st = SiteState(
                site_id=site_id, name=name, service_lane=service_lane,
                runtime=runtime, runtime_version=runtime_version,
            )
            self._states[site_id] = st
            return st

    def get(self, site_id: str) -> SiteState | None:
        with self._lock:
            return self._states.get(site_id)

    def drop(self, site_id: str) -> None:
        with self._lock:
            self._states.pop(site_id, None)

    def all(self) -> list[SiteState]:
        with self._lock:
            return list(self._states.values())
