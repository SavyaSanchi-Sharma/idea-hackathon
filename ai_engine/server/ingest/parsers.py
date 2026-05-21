"""Parse raw log lines into a normalized LogEvent.

Two formats in v1: JSON-line (modern apps) and nginx/apache combined-format
access logs (proxies). Unknown lines still flow downstream — they just don't
have parsed fields, so the aggregator skips them but the chat module can
still cite the raw text.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


# Path normalizers — collapse numeric IDs and UUIDs into stable placeholders
# so /v1/accounts/12345/balance and /v1/accounts/99999/balance hash to the
# same endpoint key in the aggregator.
_NUMERIC_SEG = re.compile(r"/\d{2,}(?=/|$)")
_UUID_SEG = re.compile(
    r"/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?=/|$)"
)


def normalize_path(path: str) -> str:
    if not path:
        return path
    # strip query string
    path = path.split("?", 1)[0].split("#", 1)[0]
    path = _UUID_SEG.sub("/{uuid}", path)
    path = _NUMERIC_SEG.sub("/{id}", path)
    return path


@dataclass
class LogEvent:
    site_id: str
    ts: float                # epoch seconds; falls back to ingest time if missing
    method: str | None = None
    path: str | None = None  # already normalized
    status: int | None = None
    latency_ms: float | None = None
    auth_present: bool | None = None
    bytes_out: int | None = None
    raw: str = ""
    parsed: bool = False

    @property
    def endpoint_key(self) -> str | None:
        if not self.method or not self.path:
            return None
        return f"{self.method.upper()} {self.path}"


# ─── JSON-line parser ───────────────────────────────────────────────────────

# Key paths we try, in order. Nested keys use dot notation; the parser walks
# them. Values are coerced to the expected type and skipped on mismatch.
_JSON_KEYS = {
    "ts":      ["timestamp", "time", "@timestamp", "ts", "datetime"],
    "method":  ["method", "request.method", "http.method", "verb"],
    "path":    ["path", "url", "request.url", "request.path", "http.path", "uri", "request_uri"],
    "status":  ["status", "status_code", "response.status", "http.status", "http.status_code", "statusCode"],
    "latency": ["latency_ms", "latency", "duration_ms", "duration", "response_time", "response_time_ms",
                "elapsed_ms", "took_ms"],
    "auth":    ["headers.authorization", "request.headers.authorization", "authorization", "auth"],
}


def _deep_get(d: dict, dotted: str) -> Any:
    cur: Any = d
    for part in dotted.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
        if cur is None:
            return None
    return cur


def _first(d: dict, keys: list[str]) -> Any:
    for k in keys:
        v = _deep_get(d, k)
        if v is not None:
            return v
    return None


def _coerce_ts(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        # heuristic: > 1e12 looks like ms epoch
        return float(v) / 1000.0 if v > 1e12 else float(v)
    if isinstance(v, str):
        # try common ISO-8601 shapes
        try:
            s = v.replace("Z", "+00:00")
            return datetime.fromisoformat(s).timestamp()
        except ValueError:
            try:
                # ISO without timezone — assume UTC
                return datetime.fromisoformat(v).replace(tzinfo=timezone.utc).timestamp()
            except ValueError:
                return None
    return None


def _coerce_latency(v: Any, *, seconds: bool = False) -> float | None:
    """Coerce to float ms. `seconds=True` when the source unit is seconds
    (e.g. nginx $request_time). JSON parser assumes ms — most modern web
    apps log `latency_ms`/`duration_ms` already."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f * 1000.0 if seconds else f


def _coerce_status(v: Any) -> int | None:
    try:
        n = int(v)
        return n if 100 <= n < 600 else None
    except (TypeError, ValueError):
        return None


class JsonLineParser:
    name = "json"

    def parse(self, raw: str, site_id: str, ingest_ts: float) -> LogEvent:
        ev = LogEvent(site_id=site_id, ts=ingest_ts, raw=raw)
        raw = raw.strip()
        if not raw or not (raw.startswith("{") or raw.startswith("[")):
            return ev
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            return ev
        if not isinstance(obj, dict):
            return ev

        ev.ts = _coerce_ts(_first(obj, _JSON_KEYS["ts"])) or ingest_ts
        m = _first(obj, _JSON_KEYS["method"])
        ev.method = str(m).upper() if m else None
        p = _first(obj, _JSON_KEYS["path"])
        ev.path = normalize_path(str(p)) if p else None
        ev.status = _coerce_status(_first(obj, _JSON_KEYS["status"]))
        ev.latency_ms = _coerce_latency(_first(obj, _JSON_KEYS["latency"]))
        auth = _first(obj, _JSON_KEYS["auth"])
        ev.auth_present = bool(auth) if auth is not None else None
        ev.parsed = ev.method is not None and ev.path is not None
        return ev


# ─── nginx / apache combined-format parser ──────────────────────────────────

# host - user [ts] "METHOD path proto" status bytes "ref" "ua" [latency]
# Latency suffix (numeric) is the extended-format $request_time; optional.
_NGINX_RE = re.compile(
    r'^(?P<ip>\S+) \S+ \S+ '
    r'\[(?P<ts>[^\]]+)\] '
    r'"(?P<method>\S+) (?P<path>\S+) [^"]+" '
    r'(?P<status>\d{3}) '
    r'(?P<bytes>\d+|-)'
    r'(?: "(?P<ref>[^"]*)" "(?P<ua>[^"]*)")?'
    r'(?: (?P<latency>\d+(?:\.\d+)?))?'
    r'\s*$'
)

# nginx default ts: 21/May/2026:10:30:45 +0000
_NGINX_TS = re.compile(r"^(\d{2})/([A-Za-z]{3})/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$")
_MONTHS = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
           "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}


def _parse_nginx_ts(s: str) -> float | None:
    m = _NGINX_TS.match(s)
    if not m:
        return None
    day, mon, year, hh, mm, ss, tz = m.groups()
    month = _MONTHS.get(mon)
    if not month:
        return None
    # build aware datetime
    sign = 1 if tz[0] == "+" else -1
    offset_min = sign * (int(tz[1:3]) * 60 + int(tz[3:5]))
    dt = datetime(int(year), month, int(day), int(hh), int(mm), int(ss), tzinfo=timezone.utc)
    return dt.timestamp() - offset_min * 60


class NginxAccessParser:
    name = "nginx"

    def parse(self, raw: str, site_id: str, ingest_ts: float) -> LogEvent:
        ev = LogEvent(site_id=site_id, ts=ingest_ts, raw=raw)
        m = _NGINX_RE.match(raw.strip())
        if not m:
            return ev
        ts = _parse_nginx_ts(m.group("ts"))
        ev.ts = ts if ts is not None else ingest_ts
        ev.method = m.group("method").upper()
        ev.path = normalize_path(m.group("path"))
        ev.status = _coerce_status(m.group("status"))
        bytes_str = m.group("bytes")
        ev.bytes_out = int(bytes_str) if bytes_str != "-" else None
        lat = m.group("latency")
        ev.latency_ms = _coerce_latency(lat, seconds=True) if lat else None
        ev.parsed = True
        return ev


# ─── format detection ───────────────────────────────────────────────────────

PARSERS: dict[str, Any] = {
    "json": JsonLineParser(),
    "nginx": NginxAccessParser(),
}


def detect_format(sample_lines: list[str]) -> str:
    """Inspect the first N lines and pick a parser. 'unknown' → keep raw only."""
    for line in sample_lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith("{"):
            try:
                json.loads(line)
                return "json"
            except json.JSONDecodeError:
                pass
        if _NGINX_RE.match(line):
            return "nginx"
    return "unknown"


def get_parser(format_name: str):
    return PARSERS.get(format_name)
