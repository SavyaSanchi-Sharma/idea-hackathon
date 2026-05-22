use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use chrono::{DateTime, Utc};
use data::{Code, Registry};
use graph::NodeId;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};
use crate::cfg::EndpointStoreCfg;
use crate::cve_lookup::CveTable;
use crate::error::EndpointStoreError;
use crate::metrics::{Metrics, Snap};
use crate::row::EndpointRow;
use crate::schema;

const SELECT_COLS: &str = "endpoint_id, service, method, path, \
    in_registry, owner_present, owner_team, deprecated_flag, \
    auth_scheme, version_path, schema_count, \
    registry_first_seen, registry_last_modified, registry_deleted_at, \
    runtime, runtime_version, last_commit_date, last_author, file_path, \
    max_cvss, cve_ids_json, created_at, updated_at";

const UPSERT_SQL: &str = r#"
INSERT INTO endpoint_props (
    endpoint_id, service, method, path,
    in_registry, owner_present, owner_team, deprecated_flag,
    auth_scheme, version_path, schema_count,
    registry_first_seen, registry_last_modified, registry_deleted_at,
    runtime, runtime_version, last_commit_date, last_author, file_path,
    max_cvss, cve_ids_json,
    created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(endpoint_id) DO UPDATE SET
    service = excluded.service,
    method = excluded.method,
    path = excluded.path,
    in_registry = excluded.in_registry,
    owner_present = excluded.owner_present,
    owner_team = excluded.owner_team,
    deprecated_flag = excluded.deprecated_flag,
    auth_scheme = excluded.auth_scheme,
    version_path = excluded.version_path,
    schema_count = excluded.schema_count,
    registry_first_seen = excluded.registry_first_seen,
    registry_last_modified = excluded.registry_last_modified,
    registry_deleted_at = excluded.registry_deleted_at,
    runtime = excluded.runtime,
    runtime_version = excluded.runtime_version,
    last_commit_date = excluded.last_commit_date,
    last_author = excluded.last_author,
    file_path = excluded.file_path,
    max_cvss = excluded.max_cvss,
    cve_ids_json = excluded.cve_ids_json,
    updated_at = excluded.updated_at
"#;

pub struct EndpointStore {
    conn: Mutex<Connection>,
    cve: CveTable,
    metrics: Arc<Metrics>,
}

impl EndpointStore {
    pub fn open(cfg: EndpointStoreCfg) -> Result<Self, EndpointStoreError> {
        let cve = if cfg.cve_table_path.exists() {
            CveTable::load(&cfg.cve_table_path)?
        } else {
            CveTable::empty()
        };
        let conn = Connection::open(&cfg.db_path)
            .map_err(|e| EndpointStoreError::SqlOpen(e.to_string()))?;
        schema::migrate(&conn)?;
        crate::log::start("endpoint_store", cve.len());
        Ok(Self {
            conn: Mutex::new(conn),
            cve,
            metrics: Metrics::new(),
        })
    }

    pub fn metrics(&self) -> Arc<Metrics> {
        self.metrics.clone()
    }

    pub fn health(&self) -> Snap {
        let conn = match self.conn.lock() {
            Ok(c) => c,
            Err(_) => return self.metrics.snap(0),
        };
        let row_count: u64 = conn
            .query_row("SELECT COUNT(*) FROM endpoint_props", [], |r| r.get(0))
            .unwrap_or(0);
        self.metrics.snap(row_count)
    }

    pub fn upsert_from_registry(
        &self,
        event: &Registry,
    ) -> Result<EndpointRow, EndpointStoreError> {
        let r = self.do_upsert_from_registry(event);
        if r.is_err() {
            self.metrics.err();
        }
        r
    }

    fn do_upsert_from_registry(
        &self,
        event: &Registry,
    ) -> Result<EndpointRow, EndpointStoreError> {
        let id_bytes = NodeId::for_endpoint(&event.service, &event.method, &event.endpoint_path).0;
        let conn = self
            .conn
            .lock()
            .map_err(|_| EndpointStoreError::SqlExec("mutex poisoned".into()))?;
        let existing = read_row(&conn, &id_bytes)?;
        let now = event.timestamp;

        let row = match event.change_type.as_str() {
            "added" | "modified" => {
                let (
                    created_at,
                    first_seen,
                    runtime,
                    runtime_version,
                    last_commit_date,
                    last_author,
                    file_path,
                    schema_count,
                ) = match &existing {
                    Some(cur) => (
                        cur.created_at,
                        cur.registry_first_seen.or(Some(event.timestamp)),
                        cur.runtime.clone(),
                        cur.runtime_version.clone(),
                        cur.last_commit_date,
                        cur.last_author.clone(),
                        cur.file_path.clone(),
                        cur.schema_count,
                    ),
                    None => (now, Some(event.timestamp), None, None, None, None, None, 0),
                };
                let owner_team = event.owner_team.clone();
                let owner_present = owner_team.is_some();
                let (max_cvss, cve_ids) = self
                    .cve
                    .lookup(runtime.as_deref(), runtime_version.as_deref());
                EndpointRow {
                    endpoint_id: id_bytes,
                    service: event.service.clone(),
                    method: event.method.clone(),
                    path: event.endpoint_path.clone(),
                    in_registry: true,
                    owner_present,
                    owner_team,
                    deprecated_flag: event.deprecated_flag,
                    auth_scheme: event.auth_required.to_lowercase(),
                    version_path: event.version.clone(),
                    schema_count,
                    registry_first_seen: first_seen,
                    registry_last_modified: Some(event.last_modified),
                    registry_deleted_at: None,
                    runtime,
                    runtime_version,
                    last_commit_date,
                    last_author,
                    file_path,
                    max_cvss,
                    cve_ids,
                    created_at,
                    updated_at: now,
                }
            }
            "deleted" => {
                let cur = existing.ok_or_else(|| {
                    EndpointStoreError::KeyMismatch(
                        "delete event for unknown endpoint".into(),
                    )
                })?;
                EndpointRow {
                    in_registry: false,
                    owner_present: false,
                    owner_team: None,
                    registry_deleted_at: Some(event.timestamp),
                    updated_at: event.timestamp,
                    ..cur
                }
            }
            other => {
                return Err(EndpointStoreError::BadRow(format!(
                    "unknown change_type: {}",
                    other
                )));
            }
        };

        write_row(&conn, &row)?;
        let canonical = read_row(&conn, &id_bytes)?
            .ok_or_else(|| EndpointStoreError::SqlExec("row vanished after write".into()))?;
        self.metrics.upsert();
        Ok(canonical)
    }

    pub fn upsert_from_code(&self, event: &Code) -> Result<EndpointRow, EndpointStoreError> {
        let r = self.do_upsert_from_code(event);
        if r.is_err() {
            self.metrics.err();
        }
        r
    }

    fn do_upsert_from_code(&self, event: &Code) -> Result<EndpointRow, EndpointStoreError> {
        let id_bytes = NodeId::for_endpoint(&event.service, &event.method, &event.endpoint_path).0;
        let conn = self
            .conn
            .lock()
            .map_err(|_| EndpointStoreError::SqlExec("mutex poisoned".into()))?;
        let existing = read_row(&conn, &id_bytes)?;
        let now = event.timestamp;
        let runtime = Some(event.runtime.clone());
        let runtime_version = Some(event.runtime_version.clone());
        let (max_cvss, cve_ids) = self
            .cve
            .lookup(runtime.as_deref(), runtime_version.as_deref());

        let row = match existing {
            Some(cur) => EndpointRow {
                runtime,
                runtime_version,
                last_commit_date: Some(event.last_commit_date),
                last_author: Some(event.last_author.clone()),
                file_path: Some(event.file_path.clone()),
                max_cvss,
                cve_ids,
                updated_at: now,
                ..cur
            },
            None => EndpointRow {
                endpoint_id: id_bytes,
                service: event.service.clone(),
                method: event.method.clone(),
                path: event.endpoint_path.clone(),
                in_registry: false,
                owner_present: false,
                owner_team: None,
                deprecated_flag: false,
                auth_scheme: "none".into(),
                version_path: None,
                schema_count: 0,
                registry_first_seen: None,
                registry_last_modified: None,
                registry_deleted_at: None,
                runtime,
                runtime_version,
                last_commit_date: Some(event.last_commit_date),
                last_author: Some(event.last_author.clone()),
                file_path: Some(event.file_path.clone()),
                max_cvss,
                cve_ids,
                created_at: now,
                updated_at: now,
            },
        };

        write_row(&conn, &row)?;
        let canonical = read_row(&conn, &id_bytes)?
            .ok_or_else(|| EndpointStoreError::SqlExec("row vanished after write".into()))?;
        self.metrics.upsert();
        Ok(canonical)
    }

    pub fn get(&self, id: &[u8; 16]) -> Result<Option<EndpointRow>, EndpointStoreError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| EndpointStoreError::SqlExec("mutex poisoned".into()))?;
        let r = read_row(&conn, id)?;
        self.metrics.get(1);
        Ok(r)
    }

    pub fn list_ids(&self) -> Result<Vec<[u8; 16]>, EndpointStoreError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| EndpointStoreError::SqlExec("mutex poisoned".into()))?;
        let mut stmt = conn.prepare("SELECT endpoint_id FROM endpoint_props")?;
        let rows = stmt.query_map([], |r| {
            let b: Vec<u8> = r.get(0)?;
            Ok(b)
        })?;
        let mut out = Vec::new();
        for r in rows {
            let b = r?;
            if b.len() == 16 {
                let mut a = [0u8; 16];
                a.copy_from_slice(&b);
                out.push(a);
            }
        }
        Ok(out)
    }

    pub fn get_many(
        &self,
        ids: &[[u8; 16]],
    ) -> Result<HashMap<[u8; 16], EndpointRow>, EndpointStoreError> {
        let mut out: HashMap<[u8; 16], EndpointRow> = HashMap::new();
        if ids.is_empty() {
            return Ok(out);
        }
        let conn = self
            .conn
            .lock()
            .map_err(|_| EndpointStoreError::SqlExec("mutex poisoned".into()))?;
        const CHUNK: usize = 500;
        for chunk in ids.chunks(CHUNK) {
            let placeholders = std::iter::repeat("?")
                .take(chunk.len())
                .collect::<Vec<_>>()
                .join(",");
            let sql = format!(
                "SELECT {} FROM endpoint_props WHERE endpoint_id IN ({})",
                SELECT_COLS, placeholders
            );
            let mut stmt = conn.prepare(&sql)?;
            let slices: Vec<&[u8]> = chunk.iter().map(|a| a.as_slice()).collect();
            let rows = stmt.query_map(params_from_iter(slices.iter()), row_from_db)?;
            for r in rows {
                let row = r?;
                out.insert(row.endpoint_id, row);
            }
        }
        self.metrics.get(ids.len() as u64);
        Ok(out)
    }

    pub fn delete(&self, id: &[u8; 16]) -> Result<bool, EndpointStoreError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| EndpointStoreError::SqlExec("mutex poisoned".into()))?;
        let n = conn.execute(
            "DELETE FROM endpoint_props WHERE endpoint_id = ?",
            params![id.as_slice()],
        )?;
        Ok(n > 0)
    }
}

fn read_row(conn: &Connection, id: &[u8; 16]) -> Result<Option<EndpointRow>, EndpointStoreError> {
    let sql = format!(
        "SELECT {} FROM endpoint_props WHERE endpoint_id = ?",
        SELECT_COLS
    );
    let mut stmt = conn.prepare_cached(&sql)?;
    let row_opt = stmt
        .query_row(params![id.as_slice()], row_from_db)
        .optional()?;
    Ok(row_opt)
}

fn write_row(conn: &Connection, row: &EndpointRow) -> Result<(), EndpointStoreError> {
    let cve_json = serde_json::to_string(&row.cve_ids)
        .map_err(|e| EndpointStoreError::BadRow(e.to_string()))?;
    conn.execute(
        UPSERT_SQL,
        params![
            row.endpoint_id.as_slice(),
            row.service,
            row.method,
            row.path,
            row.in_registry as i32,
            row.owner_present as i32,
            row.owner_team,
            row.deprecated_flag as i32,
            row.auth_scheme,
            row.version_path,
            row.schema_count,
            row.registry_first_seen.map(|t| t.timestamp_millis()),
            row.registry_last_modified.map(|t| t.timestamp_millis()),
            row.registry_deleted_at.map(|t| t.timestamp_millis()),
            row.runtime,
            row.runtime_version,
            row.last_commit_date.map(|t| t.timestamp_millis()),
            row.last_author,
            row.file_path,
            row.max_cvss as f64,
            cve_json,
            row.created_at.timestamp_millis(),
            row.updated_at.timestamp_millis(),
        ],
    )?;
    Ok(())
}

fn row_from_db(r: &Row) -> rusqlite::Result<EndpointRow> {
    let id_blob: Vec<u8> = r.get(0)?;
    if id_blob.len() != 16 {
        return Err(rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Blob,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "endpoint_id blob must be 16 bytes",
            )),
        ));
    }
    let mut id = [0u8; 16];
    id.copy_from_slice(&id_blob);

    let cve_ids_json: String = r.get(20)?;
    let cve_ids: Vec<String> = serde_json::from_str(&cve_ids_json).unwrap_or_default();

    Ok(EndpointRow {
        endpoint_id: id,
        service: r.get(1)?,
        method: r.get(2)?,
        path: r.get(3)?,
        in_registry: r.get::<_, i32>(4)? != 0,
        owner_present: r.get::<_, i32>(5)? != 0,
        owner_team: r.get(6)?,
        deprecated_flag: r.get::<_, i32>(7)? != 0,
        auth_scheme: r.get(8)?,
        version_path: r.get(9)?,
        schema_count: r.get(10)?,
        registry_first_seen: r
            .get::<_, Option<i64>>(11)?
            .and_then(DateTime::from_timestamp_millis),
        registry_last_modified: r
            .get::<_, Option<i64>>(12)?
            .and_then(DateTime::from_timestamp_millis),
        registry_deleted_at: r
            .get::<_, Option<i64>>(13)?
            .and_then(DateTime::from_timestamp_millis),
        runtime: r.get(14)?,
        runtime_version: r.get(15)?,
        last_commit_date: r
            .get::<_, Option<i64>>(16)?
            .and_then(DateTime::from_timestamp_millis),
        last_author: r.get(17)?,
        file_path: r.get(18)?,
        max_cvss: r.get::<_, f64>(19)? as f32,
        cve_ids,
        created_at: DateTime::from_timestamp_millis(r.get::<_, i64>(21)?)
            .unwrap_or_else(Utc::now),
        updated_at: DateTime::from_timestamp_millis(r.get::<_, i64>(22)?)
            .unwrap_or_else(Utc::now),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use tempfile::TempDir;

    fn fixture_cve() -> String {
        let mut s = String::new();
        s.push_str("runtime,runtime_version,cve_id,cvss_score\n");
        s.push_str("springboot,1.5,CVE-2020-5405,9.8\n");
        s.push_str("springboot,2.3,CVE-2022-22965,9.8\n");
        s.push_str("springboot,2.3,CVE-2022-22965-EXTRA,8.0\n");
        s.push_str("python,3.7,CVE-2021-23336,5.3\n");
        s
    }

    fn make_store() -> (EndpointStore, TempDir) {
        let dir = TempDir::new().unwrap();
        let cve_path = dir.path().join("cve.csv");
        std::fs::write(&cve_path, fixture_cve()).unwrap();
        let db_path = dir.path().join("test.db");
        let s = EndpointStore::open(EndpointStoreCfg {
            db_path,
            cve_table_path: cve_path,
        })
        .unwrap();
        (s, dir)
    }

    fn reg(svc: &str, method: &str, path: &str, owner: Option<&str>, change: &str) -> Registry {
        let now = Utc::now();
        Registry {
            timestamp: now,
            change_type: change.into(),
            endpoint_path: path.into(),
            method: method.into(),
            version: Some("v1".into()),
            service: svc.into(),
            owner_team: owner.map(String::from),
            auth_required: "oauth2".into(),
            deprecated_flag: false,
            sunset_date: None,
            last_modified: now,
        }
    }

    fn code_ev(svc: &str, method: &str, path: &str, runtime: &str, ver: &str) -> Code {
        let now = Utc::now();
        Code {
            timestamp: now,
            repo_name: "bank-apis".into(),
            commit_sha: "abc123".into(),
            endpoint_path: path.into(),
            method: method.into(),
            service: svc.into(),
            file_path: "src/app.py".into(),
            last_commit_date: now,
            last_author: "alice".into(),
            runtime: runtime.into(),
            runtime_version: ver.into(),
        }
    }

    #[test]
    fn empty_store_first_registry_add() {
        let (s, _d) = make_store();
        let row = s
            .upsert_from_registry(&reg("payments", "POST", "/v1/charge", Some("Payments"), "added"))
            .unwrap();
        assert_eq!(row.service, "payments");
        assert!(row.in_registry);
        assert!(row.owner_present);
        assert_eq!(row.owner_team.as_deref(), Some("Payments"));
        assert!(row.registry_first_seen.is_some());
        assert!(row.registry_deleted_at.is_none());
        assert_eq!(row.max_cvss, 0.0);
        assert!(row.cve_ids.is_empty());
        assert_eq!(row.auth_scheme, "oauth2");
    }

    #[test]
    fn registry_add_then_code_add_merge() {
        let (s, _d) = make_store();
        s.upsert_from_registry(&reg(
            "payments", "POST", "/v1/charge", Some("Payments"), "added",
        ))
        .unwrap();
        let row = s
            .upsert_from_code(&code_ev("payments", "POST", "/v1/charge", "springboot", "2.3"))
            .unwrap();
        assert_eq!(row.runtime.as_deref(), Some("springboot"));
        assert_eq!(row.runtime_version.as_deref(), Some("2.3"));
        assert!(row.in_registry, "registry side must persist after code merge");
        assert!(row.owner_present);
        assert!(row.max_cvss >= 9.7);
        assert!(row.cve_ids.contains(&"CVE-2022-22965".to_string()));
        assert_eq!(row.cve_ids.len(), 2);
    }

    #[test]
    fn code_first_then_registry_merge() {
        let (s, _d) = make_store();
        s.upsert_from_code(&code_ev(
            "payments", "POST", "/v1/charge", "springboot", "2.3",
        ))
        .unwrap();
        let row = s
            .upsert_from_registry(&reg(
                "payments",
                "POST",
                "/v1/charge",
                Some("Payments"),
                "added",
            ))
            .unwrap();
        assert!(row.in_registry);
        assert!(row.owner_present);
        assert_eq!(row.runtime.as_deref(), Some("springboot"));
        assert!(row.max_cvss >= 9.7);
    }

    #[test]
    fn registry_delete_soft_delete() {
        let (s, _d) = make_store();
        s.upsert_from_registry(&reg(
            "payments", "POST", "/v1/charge", Some("Payments"), "added",
        ))
        .unwrap();
        let row = s
            .upsert_from_registry(&reg("payments", "POST", "/v1/charge", None, "deleted"))
            .unwrap();
        assert!(!row.in_registry);
        assert!(!row.owner_present);
        assert!(row.owner_team.is_none());
        assert!(row.registry_deleted_at.is_some());
        let nid = NodeId::for_endpoint("payments", "POST", "/v1/charge");
        let got = s.get(&nid.0).unwrap().unwrap();
        assert!(!got.in_registry);
        assert!(got.registry_deleted_at.is_some());
    }

    #[test]
    fn registry_delete_unknown_endpoint_errors() {
        let (s, _d) = make_store();
        let r = s.upsert_from_registry(&reg("payments", "POST", "/nope", None, "deleted"));
        assert!(matches!(r, Err(EndpointStoreError::KeyMismatch(_))));
    }

    #[test]
    fn cve_lookup_hit_and_miss() {
        let (s, _d) = make_store();
        let hit = s
            .upsert_from_code(&code_ev("payments", "GET", "/x", "springboot", "2.3"))
            .unwrap();
        assert!(hit.max_cvss >= 9.7);
        assert_eq!(hit.cve_ids.len(), 2);
        let miss = s
            .upsert_from_code(&code_ev("payments", "GET", "/y", "rust", "1.85"))
            .unwrap();
        assert_eq!(miss.max_cvss, 0.0);
        assert!(miss.cve_ids.is_empty());
    }

    #[test]
    fn get_many_mixed_hits_and_misses() {
        let (s, _d) = make_store();
        s.upsert_from_registry(&reg("a", "GET", "/1", Some("A"), "added"))
            .unwrap();
        s.upsert_from_registry(&reg("b", "GET", "/2", Some("B"), "added"))
            .unwrap();
        let hit_a = NodeId::for_endpoint("a", "GET", "/1").0;
        let hit_b = NodeId::for_endpoint("b", "GET", "/2").0;
        let miss = NodeId::for_endpoint("c", "GET", "/3").0;
        let res = s.get_many(&[hit_a, hit_b, miss]).unwrap();
        assert!(res.contains_key(&hit_a));
        assert!(res.contains_key(&hit_b));
        assert!(!res.contains_key(&miss));
        assert_eq!(res.len(), 2);
    }

    #[test]
    fn restart_and_rehydrate() {
        let dir = TempDir::new().unwrap();
        let cve_path = dir.path().join("cve.csv");
        std::fs::write(&cve_path, fixture_cve()).unwrap();
        let db_path = dir.path().join("test.db");
        {
            let s = EndpointStore::open(EndpointStoreCfg {
                db_path: db_path.clone(),
                cve_table_path: cve_path.clone(),
            })
            .unwrap();
            s.upsert_from_registry(&reg(
                "payments", "POST", "/v1/charge", Some("Payments"), "added",
            ))
            .unwrap();
            s.upsert_from_code(&code_ev(
                "payments", "POST", "/v1/charge", "springboot", "2.3",
            ))
            .unwrap();
        }
        let s2 = EndpointStore::open(EndpointStoreCfg {
            db_path,
            cve_table_path: cve_path,
        })
        .unwrap();
        let nid = NodeId::for_endpoint("payments", "POST", "/v1/charge");
        let row = s2.get(&nid.0).unwrap().unwrap();
        assert_eq!(row.service, "payments");
        assert!(row.in_registry);
        assert_eq!(row.runtime.as_deref(), Some("springboot"));
        assert!(row.max_cvss >= 9.7);
        assert_eq!(row.cve_ids.len(), 2);
        assert!(row.registry_first_seen.is_some());
    }

    #[test]
    fn modified_does_not_reset_first_seen() {
        let (s, _d) = make_store();
        let r1 = s
            .upsert_from_registry(&reg(
                "payments", "POST", "/v1/charge", Some("Payments"), "added",
            ))
            .unwrap();
        let first = r1.registry_first_seen;
        std::thread::sleep(std::time::Duration::from_millis(2));
        let r2 = s
            .upsert_from_registry(&reg(
                "payments", "POST", "/v1/charge", Some("Payments"), "modified",
            ))
            .unwrap();
        assert_eq!(r2.registry_first_seen, first);
        assert_ne!(r2.updated_at, r1.updated_at);
    }

    #[test]
    fn re_added_clears_deleted_at() {
        let (s, _d) = make_store();
        s.upsert_from_registry(&reg(
            "payments", "POST", "/v1/charge", Some("Payments"), "added",
        ))
        .unwrap();
        let r2 = s
            .upsert_from_registry(&reg("payments", "POST", "/v1/charge", None, "deleted"))
            .unwrap();
        assert!(r2.registry_deleted_at.is_some());
        let r3 = s
            .upsert_from_registry(&reg(
                "payments", "POST", "/v1/charge", Some("Payments"), "added",
            ))
            .unwrap();
        assert!(r3.in_registry);
        assert!(r3.registry_deleted_at.is_none());
        assert!(r3.owner_present);
    }

    #[test]
    fn metrics_track_upserts_and_gets() {
        let (s, _d) = make_store();
        assert_eq!(s.health().upserts_total, 0);
        s.upsert_from_registry(&reg("a", "GET", "/1", Some("A"), "added"))
            .unwrap();
        s.upsert_from_code(&code_ev("a", "GET", "/1", "springboot", "2.3"))
            .unwrap();
        let nid = NodeId::for_endpoint("a", "GET", "/1").0;
        let _ = s.get(&nid).unwrap();
        let _ = s.get_many(&[nid]).unwrap();
        let snap = s.health();
        assert_eq!(snap.upserts_total, 2);
        assert_eq!(snap.gets_total, 2);
        assert_eq!(snap.row_count, 1);
        assert!(snap.last_upsert_ts.is_some());
    }

    #[test]
    fn delete_admin_path() {
        let (s, _d) = make_store();
        s.upsert_from_registry(&reg("a", "GET", "/1", Some("A"), "added"))
            .unwrap();
        let nid = NodeId::for_endpoint("a", "GET", "/1").0;
        assert!(s.delete(&nid).unwrap());
        assert!(s.get(&nid).unwrap().is_none());
        assert!(!s.delete(&nid).unwrap());
    }
}
