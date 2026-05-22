use std::path::Path;
use std::sync::Mutex;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use crate::error::BackendError;

const INIT_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS reports (
    endpoint_id    BLOB    NOT NULL,
    report_kind    TEXT    NOT NULL,
    framework      TEXT    NOT NULL DEFAULT '',
    system_prompt  TEXT    NOT NULL,
    user_context   TEXT    NOT NULL,
    model_output   TEXT    NOT NULL,
    model_name     TEXT    NOT NULL,
    generated_at   INTEGER NOT NULL,
    generation_ms  INTEGER NOT NULL,
    PRIMARY KEY (endpoint_id, report_kind, framework)
);
CREATE INDEX IF NOT EXISTS idx_reports_endpoint ON reports(endpoint_id);
"#;

const UPSERT_SQL: &str = r#"
INSERT INTO reports (
    endpoint_id, report_kind, framework,
    system_prompt, user_context, model_output, model_name,
    generated_at, generation_ms
) VALUES (?,?,?,?,?,?,?,?,?)
ON CONFLICT(endpoint_id, report_kind, framework) DO UPDATE SET
    system_prompt = excluded.system_prompt,
    user_context = excluded.user_context,
    model_output = excluded.model_output,
    model_name = excluded.model_name,
    generated_at = excluded.generated_at,
    generation_ms = excluded.generation_ms
"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportRow {
    pub endpoint_id: [u8; 16],
    pub report_kind: String,
    pub framework: String,
    pub system_prompt: String,
    pub user_context: String,
    pub model_output: String,
    pub model_name: String,
    pub generated_at: i64,
    pub generation_ms: i64,
}

pub struct Reports {
    conn: Mutex<Connection>,
}

impl Reports {
    pub fn open(path: &Path) -> Result<Self, BackendError> {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).ok();
            }
        }
        let conn = Connection::open(path).map_err(BackendError::from)?;
        conn.execute_batch(INIT_SQL)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn upsert(&self, r: &ReportRow) -> Result<(), BackendError> {
        let conn = self.conn.lock().map_err(|_| BackendError::Sql("mutex poisoned".into()))?;
        conn.execute(
            UPSERT_SQL,
            params![
                r.endpoint_id.as_slice(),
                r.report_kind,
                r.framework,
                r.system_prompt,
                r.user_context,
                r.model_output,
                r.model_name,
                r.generated_at,
                r.generation_ms,
            ],
        )?;
        Ok(())
    }

    pub fn list_for_endpoint(&self, id: &[u8; 16]) -> Result<Vec<ReportRow>, BackendError> {
        let conn = self.conn.lock().map_err(|_| BackendError::Sql("mutex poisoned".into()))?;
        let mut stmt = conn.prepare_cached(SELECT_BY_ENDPOINT)?;
        let rows = stmt.query_map(params![id.as_slice()], row_from_db)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn get(
        &self,
        id: &[u8; 16],
        kind: &str,
        framework: &str,
    ) -> Result<Option<ReportRow>, BackendError> {
        let conn = self.conn.lock().map_err(|_| BackendError::Sql("mutex poisoned".into()))?;
        let mut stmt = conn.prepare_cached(SELECT_ONE)?;
        let row = stmt
            .query_row(params![id.as_slice(), kind, framework], row_from_db)
            .optional()?;
        Ok(row)
    }
}

const SELECT_BY_ENDPOINT: &str = "SELECT endpoint_id, report_kind, framework, system_prompt, \
    user_context, model_output, model_name, generated_at, generation_ms \
    FROM reports WHERE endpoint_id = ? ORDER BY generated_at DESC";

const SELECT_ONE: &str = "SELECT endpoint_id, report_kind, framework, system_prompt, \
    user_context, model_output, model_name, generated_at, generation_ms \
    FROM reports WHERE endpoint_id = ? AND report_kind = ? AND framework = ?";

fn row_from_db(r: &Row) -> rusqlite::Result<ReportRow> {
    let id_blob: Vec<u8> = r.get(0)?;
    let mut id = [0u8; 16];
    if id_blob.len() == 16 {
        id.copy_from_slice(&id_blob);
    }
    Ok(ReportRow {
        endpoint_id: id,
        report_kind: r.get(1)?,
        framework: r.get(2)?,
        system_prompt: r.get(3)?,
        user_context: r.get(4)?,
        model_output: r.get(5)?,
        model_name: r.get(6)?,
        generated_at: r.get(7)?,
        generation_ms: r.get(8)?,
    })
}
