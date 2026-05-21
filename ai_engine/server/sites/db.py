"""SQLite-backed site registry.

Stores site registrations only — not live data. Live data (buffers, endpoint
predictions) live in memory and warm up from scratch on restart. Persisted
sites are re-attached on startup so the user doesn't lose their config.
"""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from threading import Lock


SCHEMA = """
CREATE TABLE IF NOT EXISTS sites (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    source_type     TEXT NOT NULL,
    source_config   TEXT NOT NULL,        -- json
    service_lane    TEXT NOT NULL,
    runtime         TEXT NOT NULL,
    runtime_version TEXT NOT NULL,
    created_at      REAL NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active'
);
"""


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "source_type": row["source_type"],
        "source_config": json.loads(row["source_config"]),
        "service_lane": row["service_lane"],
        "runtime": row["runtime"],
        "runtime_version": row["runtime_version"],
        "created_at": row["created_at"],
        "status": row["status"],
    }


class SiteDB:
    def __init__(self, path: str = "zh_sites.db"):
        self.path = path
        self._lock = Lock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(SCHEMA)
        self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def create(self, *, name: str, source_type: str, source_config: dict,
               service_lane: str, runtime: str, runtime_version: str) -> dict:
        site_id = "s_" + uuid.uuid4().hex[:10]
        rec = {
            "id": site_id,
            "name": name,
            "source_type": source_type,
            "source_config": json.dumps(source_config),
            "service_lane": service_lane,
            "runtime": runtime,
            "runtime_version": runtime_version,
            "created_at": time.time(),
            "status": "active",
        }
        with self._lock:
            self._conn.execute(
                "INSERT INTO sites (id, name, source_type, source_config, service_lane, "
                "runtime, runtime_version, created_at, status) "
                "VALUES (:id, :name, :source_type, :source_config, :service_lane, "
                ":runtime, :runtime_version, :created_at, :status)",
                rec,
            )
            self._conn.commit()
        rec["source_config"] = source_config
        return rec

    def get(self, site_id: str) -> dict | None:
        with self._lock:
            cur = self._conn.execute("SELECT * FROM sites WHERE id = ?", (site_id,))
            row = cur.fetchone()
        return _row_to_dict(row) if row else None

    def list_all(self) -> list[dict]:
        with self._lock:
            cur = self._conn.execute("SELECT * FROM sites ORDER BY created_at DESC")
            rows = cur.fetchall()
        return [_row_to_dict(r) for r in rows]

    def list_active(self) -> list[dict]:
        with self._lock:
            cur = self._conn.execute("SELECT * FROM sites WHERE status = 'active' ORDER BY created_at")
            rows = cur.fetchall()
        return [_row_to_dict(r) for r in rows]

    def set_status(self, site_id: str, status: str) -> None:
        with self._lock:
            self._conn.execute("UPDATE sites SET status = ? WHERE id = ?", (status, site_id))
            self._conn.commit()

    def delete(self, site_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM sites WHERE id = ?", (site_id,))
            self._conn.commit()
            return cur.rowcount > 0
