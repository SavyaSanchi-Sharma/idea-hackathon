"""ZombieHunter FastAPI server — exposes inference output to the React app."""
from __future__ import annotations

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .inference_pipeline import MODELS, run_inference, InferenceResult
from .mapping import to_endpoint_list
from .scan_sim import ScanState, build_event_plan, new_scan_id


# ─── startup: run inference once, cache the materialized endpoint list ──────

class State:
    inference: InferenceResult | None = None
    endpoints: list[dict] = []
    endpoints_by_id: dict[str, dict] = {}
    summary: dict = {}
    event_plan: list[dict] = []
    scans: dict[str, ScanState] = {}


state = State()


def _summary(endpoints: list[dict]) -> dict:
    active = sum(1 for e in endpoints if e["classification"] == "active")
    deprecated = sum(1 for e in endpoints if e["classification"] == "deprecated")
    orphaned = sum(1 for e in endpoints if e["classification"] == "orphaned")
    critical = sum(1 for e in endpoints if e["risk_tier"] == "critical")
    in_registry = sum(1 for e in endpoints if e["in_registry"])
    return {
        "registry_baseline": in_registry,
        "total_discovered": len(endpoints),
        "active": active,
        "deprecated": deprecated,
        "orphaned": orphaned,
        "critical": critical,
        "last_scan_at": None,  # set on first /api/scan/start completion
    }


@asynccontextmanager
async def lifespan(_app: FastAPI):
    print("[zh-server] loading model artifacts and running inference…")
    t0 = time.time()
    state.inference = run_inference()
    state.endpoints = to_endpoint_list(
        state.inference.features,
        state.inference.predictions,
        state.inference.sparklines,
        state.inference.trend_pct,
    )
    state.endpoints_by_id = {e["id"]: e for e in state.endpoints}
    state.summary = _summary(state.endpoints)
    state.event_plan = build_event_plan(state.inference.features, state.inference.predictions)
    print(f"[zh-server] ready · {len(state.endpoints)} endpoints · {time.time() - t0:.1f}s")
    yield


app = FastAPI(title="ZombieHunter AI", lifespan=lifespan)

_default_origins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"
_allowed_origins = [o.strip() for o in os.environ.get("ZH_ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── health / summary ───────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "endpoints_loaded": len(state.endpoints)}


@app.get("/api/stats/summary")
def stats_summary():
    return state.summary


# ─── endpoints (list + detail + action) ─────────────────────────────────────

def _matches(ep: dict, classification: str | None, risk_tier: str | None,
             source: str | None, search: str | None,
             needs_review: bool | None, is_zombie: bool | None,
             is_shadow: bool | None, anomaly_flag: bool | None) -> bool:
    if classification and classification != "all" and ep["classification"] != classification:
        return False
    if risk_tier and risk_tier != "all" and ep["risk_tier"] != risk_tier:
        return False
    if source and source != "all" and source not in ep["discovery_sources"]:
        return False
    if needs_review is True and not ep.get("needs_review"):
        return False
    if is_zombie is True and not ep.get("is_zombie"):
        return False
    if is_shadow is True and not ep.get("is_shadow"):
        return False
    if anomaly_flag is True and not ep.get("anomaly_flag"):
        return False
    if search:
        needle = search.lower()
        hay = f"{ep['path']} {ep['service']} {ep['id']}".lower()
        if needle not in hay:
            return False
    return True


def _sorted(items: list[dict], sort: str | None) -> list[dict]:
    if not sort:
        return items
    field, _, direction = sort.partition(":")
    reverse = direction == "desc"
    if field == "posture_score":
        return sorted(items, key=lambda e: e["posture_score"], reverse=reverse)
    if field == "last_seen":
        return sorted(items, key=lambda e: e["traffic"]["last_seen"], reverse=reverse)
    if field == "calls_30d":
        return sorted(items, key=lambda e: e["traffic"]["calls_30d"], reverse=reverse)
    if field == "ml_confidence":
        return sorted(items, key=lambda e: e.get("ml_confidence", 0.0), reverse=reverse)
    if field == "anomaly_score":
        return sorted(items, key=lambda e: e.get("anomaly_score") or 0.0, reverse=reverse)
    return items


@app.get("/api/endpoints")
def list_endpoints(
    classification: str | None = None,
    risk_tier: str | None = None,
    source: str | None = None,
    search: str | None = None,
    sort: str | None = "posture_score:desc",
    page: int = 1,
    page_size: int = 50,
    needs_review: bool | None = None,
    is_zombie: bool | None = None,
    is_shadow: bool | None = None,
    anomaly_flag: bool | None = None,
):
    filtered = [
        e for e in state.endpoints
        if _matches(e, classification, risk_tier, source, search,
                    needs_review, is_zombie, is_shadow, anomaly_flag)
    ]
    filtered = _sorted(filtered, sort)
    total = len(filtered)
    start = max(0, (page - 1) * page_size)
    page_items = filtered[start : start + page_size]
    return {"items": page_items, "total": total, "page": page}


@app.get("/api/endpoints/{endpoint_id}")
def get_endpoint(endpoint_id: str):
    ep = state.endpoints_by_id.get(endpoint_id)
    if not ep:
        raise HTTPException(status_code=404, detail=f"endpoint {endpoint_id} not found")
    return ep


@app.get("/api/endpoints/{endpoint_id}/sequence")
def get_endpoint_sequence(endpoint_id: str):
    """Full 30-day per-day telemetry used by the anomaly model."""
    ep = state.endpoints_by_id.get(endpoint_id)
    if not ep:
        raise HTTPException(status_code=404, detail=f"endpoint {endpoint_id} not found")
    # endpoint_id format is "ep_NNNN" — extract the int.
    try:
        raw_id = int(endpoint_id.split("_", 1)[1])
    except (IndexError, ValueError):
        raise HTTPException(status_code=400, detail="malformed endpoint id")
    points = state.inference.sequences.get(raw_id, []) if state.inference else []
    return {
        "endpoint_id": endpoint_id,
        "anomaly_flag": bool(ep.get("anomaly_flag")),
        "anomaly_score": ep.get("anomaly_score"),
        "points": points,
    }


@app.get("/api/review-queue")
def get_review_queue(page: int = 1, page_size: int = 50, sort: str = "posture_score:desc"):
    """Endpoints where the deterministic rule disagrees with the ML classifier.

    This is the "discovery" signal — registry says one thing, telemetry says
    another. The rest of the surface (high agreement) is plumbing for these rows.
    """
    items = [e for e in state.endpoints if e.get("needs_review")]
    items = _sorted(items, sort)
    total = len(items)
    start = max(0, (page - 1) * page_size)
    return {"items": items[start : start + page_size], "total": total, "page": page}


@app.get("/api/models/metrics")
def get_model_metrics():
    """Read the three metrics.json files from train/models/*/artifacts/."""
    out: dict[str, dict] = {}
    for component in ("classifier", "regressor", "anomaly"):
        path = MODELS / component / "artifacts" / "metrics.json"
        if path.exists():
            out[component] = json.loads(path.read_text(encoding="utf-8"))
    return out


class ActionRequest(BaseModel):
    action: Literal["monitor", "quarantine", "block", "playbook"]
    note: str | None = None


@app.post("/api/endpoints/{endpoint_id}/action")
def post_endpoint_action(endpoint_id: str, body: ActionRequest):
    if endpoint_id not in state.endpoints_by_id:
        raise HTTPException(status_code=404, detail=f"endpoint {endpoint_id} not found")
    # Side-effect-free demo backend — record on the endpoint so subsequent
    # reads reflect the operator's last decision.
    state.endpoints_by_id[endpoint_id]["recommended_action"] = body.action
    # body.note is accepted for forward compat; not persisted in this demo build.
    _ = body.note
    return {"ok": True}


# ─── graph + blast radius ───────────────────────────────────────────────────

def _build_graph(endpoints: list[dict]) -> dict:
    nodes: list[dict] = []
    edges: list[dict] = []
    seen_services: set[str] = set()
    for e in endpoints:
        nodes.append({
            "id": e["id"],
            "type": "endpoint",
            "label": f"{e['method']} {e['path']}",
            "classification": e["classification"],
            "risk_tier": e["risk_tier"],
            "metadata": {
                "specimen_id": e["specimen_id"],
                "service_lane": e["service_lane"],
                "birth_year": e["birth_year"],
                "calls_30d": e["traffic"]["calls_30d"],
                "method": e["method"],
                "path": e["path"],
            },
        })
        svc_id = f"svc__{e['service']}"
        if e["service"] not in seen_services:
            seen_services.add(e["service"])
            nodes.append({
                "id": svc_id,
                "type": "service",
                "label": e["service"],
                "classification": "active",
                "metadata": {"service_lane": e["service_lane"]},
            })
        edges.append({"source": svc_id, "target": e["id"], "type": "owned_by"})

    # Cross-stratum dependency edges from modern actives → legacy orphans in
    # the same lane (helps the Landscape view show decade-spanning paths).
    orphans = [e for e in endpoints if e["classification"] == "orphaned"][:12]
    moderns = [e for e in endpoints if e["classification"] == "active" and e["birth_year"] >= 2022]
    for o in orphans:
        target = next((m for m in moderns if m["service_lane"] == o["service_lane"]), None)
        if target:
            edges.append({"source": target["id"], "target": o["id"], "type": "depends_on"})
    return {"nodes": nodes, "edges": edges}


@app.get("/api/graph")
def get_graph(
    classification: str | None = None,
    type: str | None = Query(default=None),  # noqa: A002 (matches frontend query name)
):
    items = state.endpoints
    if classification and classification != "all":
        items = [e for e in items if e["classification"] == classification]
    graph = _build_graph(items)
    if type and type != "all":
        graph["nodes"] = [n for n in graph["nodes"] if n["type"] == type]
        keep_ids = {n["id"] for n in graph["nodes"]}
        graph["edges"] = [e for e in graph["edges"] if e["source"] in keep_ids and e["target"] in keep_ids]
    return graph


@app.get("/api/graph/blast-radius/{endpoint_id}")
def get_blast_radius(endpoint_id: str):
    ep = state.endpoints_by_id.get(endpoint_id)
    if not ep:
        raise HTTPException(status_code=404, detail=f"endpoint {endpoint_id} not found")
    # Simple radius: this endpoint + its service node + same-lane neighbours.
    radius_nodes = [{"id": ep["id"], "type": "endpoint", "label": f"{ep['method']} {ep['path']}",
                     "classification": ep["classification"], "risk_tier": ep["risk_tier"], "metadata": {}}]
    radius_edges: list[dict] = []
    for n_id in ep["blast_radius_nodes"]:
        radius_nodes.append({"id": n_id, "type": "service", "label": n_id, "metadata": {}})
        radius_edges.append({"source": ep["id"], "target": n_id, "type": "depends_on"})

    same_lane = [e for e in state.endpoints
                 if e["service_lane"] == ep["service_lane"] and e["id"] != ep["id"]][:6]
    for neighbour in same_lane:
        radius_nodes.append({
            "id": neighbour["id"], "type": "endpoint",
            "label": f"{neighbour['method']} {neighbour['path']}",
            "classification": neighbour["classification"],
            "risk_tier": neighbour["risk_tier"],
            "metadata": {},
        })
        radius_edges.append({"source": ep["id"], "target": neighbour["id"], "type": "calls"})

    return {
        "origin_id": endpoint_id,
        "nodes": radius_nodes,
        "edges": radius_edges,
        "affected_records": int(3_400_000 * (ep["posture_score"] / 100)),
        "affected_systems": [n for n in ep["blast_radius_nodes"] if n.startswith("svc_") or n.startswith("ext_")],
        "has_write_access": ep["method"] != "GET",
    }


@app.get("/api/registry")
def get_registry():
    items = [e for e in state.endpoints if e["in_registry"]]
    return {"items": items, "total": len(items)}


# ─── scan: start / poll / events ────────────────────────────────────────────

def _stats_at(progress: int) -> dict:
    """Reveal the discovery stats progressively as the scan ramps to 100%."""
    factor = progress / 100.0
    s = state.summary
    return {
        "total_discovered": int(s["registry_baseline"] + (s["total_discovered"] - s["registry_baseline"]) * factor),
        "active": int(s["active"]),
        "deprecated": int(s["deprecated"] * factor),
        "orphaned": int(s["orphaned"] * factor),
        "critical": int(s["critical"] * factor),
        "unknown_vs_registry": int((s["total_discovered"] - s["registry_baseline"]) * factor),
    }


def _ensure_scan(scan_id: str) -> ScanState:
    sc = state.scans.get(scan_id)
    if not sc:
        raise HTTPException(status_code=404, detail=f"scan {scan_id} not found")
    return sc


@app.post("/api/scan/start")
def scan_start():
    scan_id = new_scan_id()
    sc = ScanState(id=scan_id, status="running")
    state.scans[scan_id] = sc
    # Stamp all events at scan-start; the frontend polls and reveals them in order.
    plan_size = len(state.event_plan)
    for idx, ev in enumerate(state.event_plan):
        sc.events.append({
            **ev,
            "scan_id": scan_id,
            "ts": time.time() + idx * 0.32,  # serialized below
        })
    sc.progress = 0
    sc.stats = _stats_at(0)
    return {"scan_id": scan_id}


@app.get("/api/scan/{scan_id}")
def scan_get(scan_id: str):
    sc = _ensure_scan(scan_id)
    # Advance progress by wall-clock against an 8-second runtime.
    elapsed = time.time() - sc.started_at
    sc.progress = min(100, int(elapsed / 8.0 * 100))
    sc.stats = _stats_at(sc.progress)
    if sc.progress >= 100 and sc.status != "complete":
        sc.status = "complete"
        sc.completed_at = time.time()
        state.summary["last_scan_at"] = _iso(sc.completed_at)
    return {
        "id": sc.id,
        "status": sc.status,
        "started_at": _iso(sc.started_at),
        "completed_at": _iso(sc.completed_at) if sc.completed_at else None,
        "progress": sc.progress,
        "stats": sc.stats,
    }


@app.get("/api/scan/{scan_id}/events")
def scan_events(scan_id: str):
    sc = _ensure_scan(scan_id)
    # Only return the events whose simulated timestamp has elapsed.
    cutoff = time.time()
    revealed = []
    for ev in sc.events:
        if ev["ts"] <= cutoff:
            revealed.append({**ev, "ts": _iso(ev["ts"])})
    return revealed


# ─── WebSocket: live scan stream ────────────────────────────────────────────

@app.websocket("/ws")
async def ws_stream(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                await ws.send_text(json.dumps({"type": "error", "payload": {"detail": "bad json"}}))
                continue

            if msg.get("type") == "subscribe_scan":
                scan_id = msg.get("scan_id") or new_scan_id()
                # If the client subscribed without starting via REST, mint the scan now.
                sc = state.scans.get(scan_id)
                if not sc:
                    sc = ScanState(id=scan_id, status="running")
                    state.scans[scan_id] = sc
                    for idx, ev in enumerate(state.event_plan):
                        sc.events.append({**ev, "scan_id": scan_id, "ts": time.time() + idx * 0.32})
                await _push_scan(ws, sc)
            else:
                await ws.send_text(json.dumps({"type": "error", "payload": {"detail": "unknown message"}}))
    except WebSocketDisconnect:
        return


async def _push_scan(ws: WebSocket, sc: ScanState):
    interval = 0.32
    total = len(sc.events)
    for idx, ev in enumerate(sc.events):
        progress = min(100, int((idx + 1) / max(total, 1) * 100))
        sc.progress = progress
        sc.stats = _stats_at(progress)
        await ws.send_text(json.dumps({
            "type": "scan_progress",
            "payload": {"scan_id": sc.id, "progress": progress, "stats": sc.stats},
        }))
        await ws.send_text(json.dumps({
            "type": "scan_event",
            "payload": {**ev, "ts": _iso(ev["ts"])},
        }))
        await asyncio.sleep(interval)
    sc.status = "complete"
    sc.completed_at = time.time()
    state.summary["last_scan_at"] = _iso(sc.completed_at)
    await ws.send_text(json.dumps({
        "type": "scan_complete",
        "payload": {
            "id": sc.id,
            "status": "complete",
            "started_at": _iso(sc.started_at),
            "completed_at": _iso(sc.completed_at),
            "progress": 100,
            "stats": sc.stats,
        },
    }))


def _iso(t: float) -> str:
    import datetime
    return datetime.datetime.fromtimestamp(t, tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z")
