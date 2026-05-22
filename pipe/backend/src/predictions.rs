use std::path::Path;
use std::sync::Mutex;
use chrono::{DateTime, Utc};
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};
use serde::Serialize;
use crate::error::BackendError;
use crate::unified::{Classification, RiskBand, UnifiedPrediction};

const INIT_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS predictions (
    endpoint_id          BLOB    PRIMARY KEY,
    rule_state           TEXT    NOT NULL,
    rule_reason          TEXT    NOT NULL,
    rule_is_zombie       INTEGER NOT NULL,
    rule_is_shadow       INTEGER NOT NULL,
    ml_state             TEXT    NOT NULL,
    ml_confidence        REAL    NOT NULL,
    lifecycle_agreement  INTEGER NOT NULL,
    needs_review         INTEGER NOT NULL,
    risk_score           REAL    NOT NULL,
    risk_band            TEXT    NOT NULL,
    anomaly_flag         INTEGER,
    anomaly_score        REAL,
    owasp_findings_json  TEXT    NOT NULL DEFAULT '[]',
    finding_count        INTEGER NOT NULL DEFAULT 0,
    updated_at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_predictions_state  ON predictions(rule_state);
CREATE INDEX IF NOT EXISTS idx_predictions_band   ON predictions(risk_band);
CREATE INDEX IF NOT EXISTS idx_predictions_review ON predictions(needs_review);
"#;

const UPSERT_SQL: &str = r#"
INSERT INTO predictions (
    endpoint_id, rule_state, rule_reason, rule_is_zombie, rule_is_shadow,
    ml_state, ml_confidence, lifecycle_agreement, needs_review,
    risk_score, risk_band, anomaly_flag, anomaly_score,
    owasp_findings_json, finding_count, updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(endpoint_id) DO UPDATE SET
    rule_state = excluded.rule_state,
    rule_reason = excluded.rule_reason,
    rule_is_zombie = excluded.rule_is_zombie,
    rule_is_shadow = excluded.rule_is_shadow,
    ml_state = excluded.ml_state,
    ml_confidence = excluded.ml_confidence,
    lifecycle_agreement = excluded.lifecycle_agreement,
    needs_review = excluded.needs_review,
    risk_score = excluded.risk_score,
    risk_band = excluded.risk_band,
    anomaly_flag = excluded.anomaly_flag,
    anomaly_score = excluded.anomaly_score,
    owasp_findings_json = excluded.owasp_findings_json,
    finding_count = excluded.finding_count,
    updated_at = excluded.updated_at
"#;

pub struct Predictions {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PredictionRow {
    pub endpoint_id: [u8; 16],
    pub rule_state: Classification,
    pub rule_reason: String,
    pub rule_is_zombie: bool,
    pub rule_is_shadow: bool,
    pub ml_state: Classification,
    pub ml_confidence: f32,
    pub lifecycle_agreement: bool,
    pub needs_review: bool,
    pub risk_score: f32,
    pub risk_band: RiskBand,
    pub anomaly_flag: Option<bool>,
    pub anomaly_score: Option<f32>,
    pub owasp_findings: Vec<String>,
    pub finding_count: u32,
    pub updated_at: DateTime<Utc>,
}

impl Predictions {
    pub fn open(path: &Path) -> Result<Self, BackendError> {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).ok();
            }
        }
        let conn = Connection::open(path).map_err(BackendError::from)?;
        conn.execute_batch(INIT_SQL)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn upsert_batch(&self, items: &[UnifiedPrediction]) -> Result<usize, BackendError> {
        if items.is_empty() {
            return Ok(0);
        }
        let mut conn = self.conn.lock().map_err(|_| BackendError::Sql("mutex poisoned".into()))?;
        let tx = conn.transaction()?;
        for u in items {
            tx.execute(
                UPSERT_SQL,
                params![
                    u.endpoint_id.as_slice(),
                    u.rule_state.as_str(),
                    u.rule_reason,
                    u.rule_is_zombie as i32,
                    u.rule_is_shadow as i32,
                    u.ml_state.as_str(),
                    u.ml_confidence as f64,
                    u.lifecycle_agreement as i32,
                    u.needs_review as i32,
                    u.risk_score as f64,
                    u.risk_band.as_str(),
                    u.anomaly_flag.map(|b| b as i32),
                    u.anomaly_score.map(|s| s as f64),
                    serde_json::to_string(&u.owasp_findings).unwrap_or_else(|_| "[]".into()),
                    u.finding_count,
                    u.updated_at.timestamp_millis(),
                ],
            )?;
        }
        tx.commit()?;
        Ok(items.len())
    }

    pub fn get(&self, id: &[u8; 16]) -> Result<Option<PredictionRow>, BackendError> {
        let conn = self.conn.lock().map_err(|_| BackendError::Sql("mutex poisoned".into()))?;
        let mut stmt = conn.prepare_cached(SELECT_ONE)?;
        let row = stmt
            .query_row(params![id.as_slice()], row_from_db)
            .optional()?;
        Ok(row)
    }

    pub fn get_many(&self, ids: &[[u8; 16]]) -> Result<Vec<PredictionRow>, BackendError> {
        if ids.is_empty() {
            return Ok(vec![]);
        }
        let conn = self.conn.lock().map_err(|_| BackendError::Sql("mutex poisoned".into()))?;
        let mut out = Vec::new();
        for chunk in ids.chunks(500) {
            let placeholders = std::iter::repeat("?").take(chunk.len()).collect::<Vec<_>>().join(",");
            let sql = format!(
                "SELECT {} FROM predictions WHERE endpoint_id IN ({})",
                SELECT_COLS, placeholders
            );
            let mut stmt = conn.prepare(&sql)?;
            let slices: Vec<&[u8]> = chunk.iter().map(|a| a.as_slice()).collect();
            let rows = stmt.query_map(params_from_iter(slices.iter()), row_from_db)?;
            for r in rows {
                out.push(r?);
            }
        }
        Ok(out)
    }

    pub fn list_all(&self) -> Result<Vec<PredictionRow>, BackendError> {
        let conn = self.conn.lock().map_err(|_| BackendError::Sql("mutex poisoned".into()))?;
        let sql = format!("SELECT {} FROM predictions", SELECT_COLS);
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], row_from_db)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }
}

const SELECT_COLS: &str = "endpoint_id, rule_state, rule_reason, rule_is_zombie, rule_is_shadow, \
    ml_state, ml_confidence, lifecycle_agreement, needs_review, \
    risk_score, risk_band, anomaly_flag, anomaly_score, \
    owasp_findings_json, finding_count, updated_at";

const SELECT_ONE: &str = "SELECT endpoint_id, rule_state, rule_reason, rule_is_zombie, rule_is_shadow, \
    ml_state, ml_confidence, lifecycle_agreement, needs_review, \
    risk_score, risk_band, anomaly_flag, anomaly_score, \
    owasp_findings_json, finding_count, updated_at \
    FROM predictions WHERE endpoint_id = ?";

fn row_from_db(r: &Row) -> rusqlite::Result<PredictionRow> {
    let id_blob: Vec<u8> = r.get(0)?;
    let mut id = [0u8; 16];
    if id_blob.len() == 16 {
        id.copy_from_slice(&id_blob);
    }
    let rule_state_s: String = r.get(1)?;
    let ml_state_s: String = r.get(5)?;
    let band_s: String = r.get(10)?;
    let findings_json: String = r.get(13)?;
    let findings: Vec<String> = serde_json::from_str(&findings_json).unwrap_or_default();
    Ok(PredictionRow {
        endpoint_id: id,
        rule_state: Classification::from_str(&rule_state_s).unwrap_or(Classification::Active),
        rule_reason: r.get(2)?,
        rule_is_zombie: r.get::<_, i32>(3)? != 0,
        rule_is_shadow: r.get::<_, i32>(4)? != 0,
        ml_state: Classification::from_str(&ml_state_s).unwrap_or(Classification::Active),
        ml_confidence: r.get::<_, f64>(6)? as f32,
        lifecycle_agreement: r.get::<_, i32>(7)? != 0,
        needs_review: r.get::<_, i32>(8)? != 0,
        risk_score: r.get::<_, f64>(9)? as f32,
        risk_band: RiskBand::from_str(&band_s).unwrap_or(RiskBand::Low),
        anomaly_flag: r.get::<_, Option<i32>>(11)?.map(|v| v != 0),
        anomaly_score: r.get::<_, Option<f64>>(12)?.map(|v| v as f32),
        owasp_findings: findings,
        finding_count: r.get::<_, i32>(14)? as u32,
        updated_at: DateTime::from_timestamp_millis(r.get::<_, i64>(15)?)
            .unwrap_or_else(Utc::now),
    })
}
