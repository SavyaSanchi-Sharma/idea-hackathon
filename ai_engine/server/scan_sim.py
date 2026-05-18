"""Build a believable scan event stream from the real inference output.

The frontend's CommandCenter expects a /api/scan flow that emits progress +
events as the "scan" deepens. We replay the genuine discovery results — the
critical endpoints surfaced by the regressor, the orphaned surfaces flagged
by the rule — as that timeline.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

import pandas as pd


@dataclass
class ScanState:
    id: str
    status: str = "queued"
    started_at: float = field(default_factory=time.time)
    completed_at: float | None = None
    progress: int = 0
    stats: dict = field(default_factory=dict)
    events: list[dict] = field(default_factory=list)


def new_scan_id() -> str:
    return f"scan_{uuid.uuid4().hex[:10]}"


def _iso(t: float) -> str:
    import datetime
    return datetime.datetime.fromtimestamp(t, tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def build_event_plan(features: pd.DataFrame, predictions: pd.DataFrame) -> list[dict]:
    """Return a chronological list of scan events that mirror real findings.

    The events are tagged with phase + severity; the WS bridge or polling
    endpoint replays them with synthetic timestamps.
    """
    feat_clean = features.drop(
        columns=[c for c in ("lifecycle_state", "is_zombie", "is_shadow", "risk_score")
                 if c in features.columns]
    )
    merged = feat_clean.merge(predictions, on="endpoint_id", how="inner")
    critical = merged[merged["risk_band"] == "critical"].sort_values(
        "risk_score", ascending=False
    ).head(6)
    high = merged[merged["risk_band"] == "high"].sort_values(
        "risk_score", ascending=False
    ).head(4)
    deprecated = merged[(merged["rule_state"] == "deprecated") & (merged["call_count_7d"] > 100)].head(3)
    anomalies = merged[merged["anomaly_flag"] == 1].sort_values("anomaly_score", ascending=False).head(3)

    plan: list[dict] = []
    plan.append({"phase": "ingest", "severity": "info",
                 "message": "depth = current — opening 30d access log window"})
    plan.append({"phase": "ingest", "severity": "info",
                 "message": "service-mesh telemetry attached · runtime CVE table loaded"})
    plan.append({"phase": "parse", "severity": "info",
                 "message": f"recovered {len(merged):,} candidate endpoints across {merged['service'].nunique()} services"})
    plan.append({"phase": "graph", "severity": "info",
                 "message": "deterministic rule classifier applied · 3-class lifecycle assignment complete"})
    plan.append({"phase": "graph", "severity": "warning",
                 "message": f"{int((merged['needs_review'] == 1).sum())} endpoints flagged for review (rule ≠ ML)"})

    for _, row in deprecated.iterrows():
        plan.append({
            "phase": "classify", "severity": "warning",
            "message": f"{row['endpoint']} classified deprecated (calls/7d = {int(row['call_count_7d'])}) — cutover blocked",
            "endpoint_id": f"ep_{int(row['endpoint_id']):04d}",
        })

    for _, row in critical.iterrows():
        plan.append({
            "phase": "score", "severity": "critical",
            "message": f"{row['endpoint']} scored {row['risk_score']:.0f}/100 — {row['risk_band']} · {row['rule_reason']}",
            "endpoint_id": f"ep_{int(row['endpoint_id']):04d}",
        })

    for _, row in high.iterrows():
        plan.append({
            "phase": "score", "severity": "warning",
            "message": f"{row['endpoint']} scored {row['risk_score']:.0f}/100 — high risk tier",
            "endpoint_id": f"ep_{int(row['endpoint_id']):04d}",
        })

    for _, row in anomalies.iterrows():
        plan.append({
            "phase": "reason", "severity": "warning",
            "message": f"{row['endpoint']} — 30-day behavior shift detected (score {row['anomaly_score']:.3f})",
            "endpoint_id": f"ep_{int(row['endpoint_id']):04d}",
        })

    plan.append({"phase": "complete", "severity": "info",
                 "message": f"scan complete — {(merged['rule_state'] == 'orphaned').sum()} zombies · {(merged['risk_band'] == 'critical').sum()} critical · {len(merged):,} total"})
    return plan
