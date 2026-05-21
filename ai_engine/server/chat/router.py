"""Chat-over-logs API.

POST /api/sites/{site_id}/chat
  body: {"q": str, "window_seconds": int?, "max_lines": int?}
  response: {
    "answer": str,
    "cited_lines": [int, ...],     # indices into log_snapshot
    "log_snapshot": [{...}, ...],  # the numbered lines actually shown to the LLM
    "endpoints_used": [{id, method, path, posture_score, owasp_tags}, ...],
    "model": str,
  }

The LLM only sees the numbered log snippet + top-K endpoint summaries — no
inference signals from the static catalog and no cross-site state. Citations
are extracted via regex on `[L<n>]` so the frontend can scroll the Log Tail
to the cited line.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..ingest.buffer import BufferRegistry
from ..ingest.site_state import SiteStateRegistry
from ..llm.client import LLMClient, LLMUnavailable
from ..sites.db import SiteDB


# Citation parser: handles [L7], [L7, L9], and ranges like [L0-L79].
# Each bracketed group can contain one or more "L<n>" tokens separated by
# commas/spaces, and optionally an "L<n>-L<m>" range; we expand to individuals.
_CITE_GROUP_RE = re.compile(r"\[([^\[\]]*?L\d+[^\[\]]*?)\]")
_CITE_RANGE_RE = re.compile(r"L(\d+)\s*-\s*L(\d+)")
_CITE_SINGLE_RE = re.compile(r"L(\d+)")


def _extract_citations(text: str, max_index: int) -> list[int]:
    found: set[int] = set()
    for group in _CITE_GROUP_RE.findall(text):
        for lo, hi in _CITE_RANGE_RE.findall(group):
            a, b = int(lo), int(hi)
            if a > b:
                a, b = b, a
            for i in range(a, min(b, max_index - 1) + 1):
                if 0 <= i < max_index:
                    found.add(i)
            # blank out the range so the single-extractor doesn't double-count
            group = _CITE_RANGE_RE.sub("", group)
        for n in _CITE_SINGLE_RE.findall(group):
            i = int(n)
            if 0 <= i < max_index:
                found.add(i)
    return sorted(found)


SYSTEM_PROMPT = (
    "You are a banking-API operations analyst embedded in ZombieHunter. "
    "You answer ONLY using the endpoint summaries and log lines provided "
    "in the user message. Do not invent paths, statuses, or timestamps that "
    "are not present in the context. "
    "When you cite evidence, reference the log line indices in square brackets, "
    "EITHER as individual citations like [L7] [L12] [L18] OR as a comma list "
    "like [L7, L12, L18]. Pick at most 5 of the most representative lines — "
    "do NOT write open-ended ranges. "
    "Be concise: 3-6 sentences."
)


class ChatRequest(BaseModel):
    q: str = Field(min_length=1, max_length=1000)
    window_seconds: int | None = Field(default=None, ge=1, le=86400)
    # Defaults sized to fit Groq llama-3.1-8b free-tier (6k TPM): ~3k prompt
    # tokens leaves headroom for a 1-2k-token answer.
    max_lines: int = Field(default=50, ge=5, le=400)
    max_endpoints: int = Field(default=6, ge=1, le=50)


def _endpoint_brief(ep: dict) -> dict:
    """Shape for the API response — what the frontend renders under
    `endpoints_used`. Kept compact but JSON-shaped."""
    sig = ep.get("signals") or {}
    return {
        "id": ep.get("id"),
        "method": ep.get("method"),
        "path": ep.get("path"),
        "classification": ep.get("classification"),
        "risk_tier": ep.get("risk_tier"),
        "posture_score": ep.get("posture_score"),
        "owasp_tags": ep.get("owasp_tags") or [],
        "auth_fail_rate_7d": sig.get("auth_fail_rate_7d"),
        "call_count_7d": sig.get("call_count_7d"),
        "p95_latency_ms": sig.get("p95_latency_ms"),
    }


def _endpoint_line(ep: dict) -> str:
    """One compact line per endpoint — 6× cheaper than the JSON dump."""
    sig = ep.get("signals") or {}
    method = ep.get("method") or "?"
    path = ep.get("path") or "?"
    risk = ep.get("risk_tier") or "?"
    score = ep.get("posture_score")
    score_s = f"{float(score):.1f}" if isinstance(score, (int, float)) else "?"
    owasp = ",".join(ep.get("owasp_tags") or []) or "-"
    fail = sig.get("auth_fail_rate_7d")
    fail_s = f"{float(fail) * 100:.0f}%" if isinstance(fail, (int, float)) else "?"
    calls = sig.get("call_count_7d")
    return (
        f"- {method} {path} | {risk} ({score_s}) | "
        f"owasp={owasp} | auth_fail={fail_s} | calls={calls}"
    )


def _format_log_lines(events: list[dict]) -> tuple[list[dict], str]:
    """Turn buffer events into a numbered text block + parallel snapshot.

    The snapshot is what the frontend re-uses to map cited indices back to
    log lines, so it MUST be index-aligned with the prompt block.
    """
    snapshot: list[dict] = []
    lines: list[str] = []
    for i, e in enumerate(events):
        snapshot.append({
            "index": i,
            "ts": e.get("ts"),
            "method": e.get("method"),
            "path": e.get("path"),
            "status": e.get("status"),
            "latency_ms": e.get("latency_ms"),
            "raw": e.get("raw"),
            "parsed": e.get("parsed"),
        })
        # Aggressive truncation — keeps the diagnostic signal (method/path/
        # status/timestamp) but drops headers/payload bloat.
        raw = (e.get("raw") or "").strip()
        if len(raw) > 180:
            raw = raw[:177] + "..."
        lines.append(f"[L{i}] {raw}")
    return snapshot, "\n".join(lines) if lines else "(no log lines yet)"


def _build_user_prompt(question: str, endpoints: list[dict], log_block: str) -> str:
    ep_summary = "\n".join(_endpoint_line(ep) for ep in endpoints) or "(no endpoints yet)"
    return (
        f"Question: {question}\n\n"
        f"Top endpoints by risk:\n{ep_summary}\n\n"
        f"Recent log lines:\n{log_block}\n\n"
        "Answer using only the data above. Cite log indices like [L7]. "
        "If the data doesn't support an answer, say so."
    )


def build_router(
    *,
    db: SiteDB,
    buffers: BufferRegistry,
    states: SiteStateRegistry,
    llm: LLMClient,
) -> APIRouter:
    r = APIRouter(prefix="/api/sites", tags=["chat"])

    @r.get("/{site_id}/chat/health")
    def chat_health(site_id: str):
        if db.get(site_id) is None:
            raise HTTPException(status_code=404, detail="site not found")
        return {"llm": llm.describe()}

    @r.post("/{site_id}/chat")
    async def chat(site_id: str, body: ChatRequest):
        if db.get(site_id) is None:
            raise HTTPException(status_code=404, detail="site not found")
        if not llm.available():
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "llm_not_configured",
                    "hint": "Set ZH_LLM_BASE_URL, ZH_LLM_API_KEY, ZH_LLM_MODEL on the backend.",
                    "llm": llm.describe(),
                },
            )

        # Endpoint context: top-K from this site's live state by risk score.
        state = states.get(site_id)
        endpoints_full = state.snapshot_endpoints() if state else []
        endpoints_full.sort(key=lambda e: e.get("posture_score", 0.0), reverse=True)
        top_endpoints_full = endpoints_full[: body.max_endpoints]
        top_endpoints = [_endpoint_brief(e) for e in top_endpoints_full]

        # Log context: recent N lines from the ring buffer.
        since_ts = (time.time() - body.window_seconds) if body.window_seconds else None
        events = buffers.get(site_id).recent(n=body.max_lines, since_ts=since_ts)
        # buffer holds LogEvent dataclass instances — translate to dict for the formatter
        event_dicts = [
            {
                "ts": e.ts, "method": e.method, "path": e.path,
                "status": e.status, "latency_ms": e.latency_ms,
                "raw": e.raw, "parsed": e.parsed,
            }
            for e in events
        ]
        snapshot, log_block = _format_log_lines(event_dicts)

        user_prompt = _build_user_prompt(body.q, top_endpoints_full, log_block)

        try:
            resp = await llm.chat(system=SYSTEM_PROMPT, user=user_prompt)
        except LLMUnavailable as e:
            raise HTTPException(status_code=502, detail={"error": "llm_failed", "message": str(e)})

        cited = _extract_citations(resp.text, max_index=len(snapshot))

        return {
            "answer": resp.text,
            "cited_lines": cited,
            "log_snapshot": snapshot,
            "endpoints_used": top_endpoints,
            "model": resp.model,
            "usage": {
                "prompt_tokens": resp.prompt_tokens,
                "completion_tokens": resp.completion_tokens,
            },
        }

    return r
