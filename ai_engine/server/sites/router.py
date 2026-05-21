"""HTTP + WS surface for the live-ingest site registry.

Routes are built via `build_router(...)` so main.py can inject the runtime
singletons (db, runner, hub, registries) at lifespan startup. Keeps wiring
explicit and avoids module-level globals.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from ..ingest.buffer import BufferRegistry
from ..ingest.runner import IngestRunner
from ..ingest.site_state import SiteStateRegistry
from ..ingest.sources import docker_available
from ..ingest.ws_hub import WSHub
from .db import SiteDB
from .models import SiteCreate


def build_router(
    *,
    db: SiteDB,
    runner: IngestRunner,
    ws_hub: WSHub,
    buffers: BufferRegistry,
    states: SiteStateRegistry,
) -> APIRouter:
    r = APIRouter(prefix="/api/sites", tags=["sites"])

    def _stats(site_id: str) -> dict:
        state = states.get(site_id)
        if not state:
            return {
                "lines_ingested": 0, "lines_dropped": 0,
                "parser_format": "unknown", "endpoints_discovered": 0,
                "started_at": 0.0, "ws_subscribers": ws_hub.subscribers(site_id),
            }
        return {
            "lines_ingested": state.lines_ingested,
            "lines_dropped": state.lines_dropped,
            "parser_format": state.parser_format,
            "endpoints_discovered": len(state.endpoint_ids),
            "started_at": state.started_at,
            "ws_subscribers": ws_hub.subscribers(site_id),
        }

    @r.post("", status_code=201)
    async def create_site(body: SiteCreate):
        # Validate Docker availability before persisting — fail fast.
        if body.source_type == "docker":
            if not docker_available():
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "docker_unavailable",
                        "hint": "Docker daemon is not reachable from this backend. "
                                "Use source_type=file_replay for portable demos.",
                    },
                )
        elif body.source_type == "file_replay":
            import os
            path = body.source_config.get("path")
            if not path or not os.path.exists(str(path)):
                raise HTTPException(
                    status_code=400,
                    detail={"error": "file_not_found", "path": path},
                )

        site = db.create(
            name=body.name,
            source_type=body.source_type,
            source_config=body.source_config,
            service_lane=body.service_lane,
            runtime=body.runtime,
            runtime_version=body.runtime_version,
        )
        try:
            await runner.start_site(site)
        except Exception as e:
            db.set_status(site["id"], "error")
            raise HTTPException(status_code=400, detail={"error": "start_failed", "message": str(e)})
        return {**site, "stats": _stats(site["id"])}

    @r.get("")
    def list_sites():
        items = []
        for s in db.list_all():
            items.append({**s, "stats": _stats(s["id"])})
        return {"items": items, "total": len(items)}

    @r.get("/{site_id}")
    def get_site(site_id: str):
        site = db.get(site_id)
        if not site:
            raise HTTPException(status_code=404, detail="site not found")
        return {**site, "stats": _stats(site_id)}

    @r.delete("/{site_id}")
    async def delete_site(site_id: str):
        site = db.get(site_id)
        if not site:
            raise HTTPException(status_code=404, detail="site not found")
        await runner.stop_site(site_id)
        db.delete(site_id)
        return {"ok": True, "id": site_id}

    @r.get("/{site_id}/endpoints")
    def list_endpoints(site_id: str):
        state = states.get(site_id)
        if state is None:
            # site exists in db but hasn't materialized any endpoints yet
            if db.get(site_id) is None:
                raise HTTPException(status_code=404, detail="site not found")
            return {"items": [], "total": 0, "warming_up": True}
        items = state.snapshot_endpoints()
        items = sorted(items, key=lambda e: e.get("posture_score", 0.0), reverse=True)
        return {"items": items, "total": len(items)}

    @r.get("/{site_id}/logs")
    def get_logs(site_id: str, limit: int = 200, since_ts: float | None = None):
        if db.get(site_id) is None:
            raise HTTPException(status_code=404, detail="site not found")
        buf = buffers.get(site_id)
        events = buf.recent(n=limit, since_ts=since_ts)
        return {
            "items": [
                {
                    "ts": e.ts, "method": e.method, "path": e.path,
                    "status": e.status, "latency_ms": e.latency_ms,
                    "auth_present": e.auth_present, "raw": e.raw, "parsed": e.parsed,
                }
                for e in events
            ],
            "total": len(events),
        }

    @r.websocket("/ws/{site_id}")
    async def ws_site(ws: WebSocket, site_id: str):
        # Note: FastAPI doesn't let us prefix websocket() with the parent prefix
        # cleanly, so we accept the absolute path here. main.py also mounts a
        # twin route at /ws/sites/{site_id} for symmetry with the plan.
        await _ws_handler(ws, site_id, db, ws_hub, buffers, states)

    return r


async def _ws_handler(
    ws: WebSocket,
    site_id: str,
    db: SiteDB,
    ws_hub: WSHub,
    buffers: BufferRegistry,
    states: SiteStateRegistry,
) -> None:
    if db.get(site_id) is None:
        await ws.close(code=4404)
        return
    await ws.accept()
    ws_hub.subscribe(site_id, ws)
    try:
        # Send a snapshot so the UI hydrates immediately on connect.
        state = states.get(site_id)
        if state:
            await ws.send_json({
                "type": "snapshot",
                "site_id": site_id,
                "endpoints": state.snapshot_endpoints(),
            })
        buf = buffers.get(site_id)
        recent = buf.recent(n=50)
        if recent:
            await ws.send_json({
                "type": "log_events_batch",
                "site_id": site_id,
                "events": [
                    {
                        "ts": e.ts, "method": e.method, "path": e.path,
                        "status": e.status, "latency_ms": e.latency_ms,
                        "auth_present": e.auth_present, "raw": e.raw, "parsed": e.parsed,
                    }
                    for e in recent
                ],
            })
        # Keep the socket open. We don't process client messages in v1.
        while True:
            try:
                await ws.receive_text()
            except WebSocketDisconnect:
                return
    finally:
        ws_hub.unsubscribe(site_id, ws)


def attach_websocket(app, *, db: SiteDB, ws_hub: WSHub,
                     buffers: BufferRegistry, states: SiteStateRegistry) -> None:
    """Mount the per-site WS at /ws/sites/{site_id} (plan-spec'd path)."""
    @app.websocket("/ws/sites/{site_id}")
    async def _root_ws(ws: WebSocket, site_id: str):
        await _ws_handler(ws, site_id, db, ws_hub, buffers, states)
