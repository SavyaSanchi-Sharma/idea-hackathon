use std::collections::HashMap;
use std::str::FromStr;
use chrono::{DateTime, Utc};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Row, SqlitePool};
use crate::error::GraphError;
use crate::schema::{Edge, EdgeType, Node, NodeId, NodeType, Props};

pub const INIT_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS graph_nodes (
    id          BLOB    PRIMARY KEY,
    node_type   TEXT    NOT NULL,
    label       TEXT    NOT NULL,
    props_json  TEXT    NOT NULL,
    first_seen  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_type      ON graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_nodes_last_seen ON graph_nodes(last_seen);

CREATE TABLE IF NOT EXISTS graph_edges (
    source_id   BLOB    NOT NULL,
    target_id   BLOB    NOT NULL,
    edge_type   TEXT    NOT NULL,
    props_json  TEXT    NOT NULL,
    first_seen  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL,
    PRIMARY KEY (source_id, target_id, edge_type),
    FOREIGN KEY (source_id) REFERENCES graph_nodes(id),
    FOREIGN KEY (target_id) REFERENCES graph_nodes(id)
);
CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(source_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(target_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_edges_type   ON graph_edges(edge_type);
"#;

pub async fn open_pool(db_path: &str) -> Result<SqlitePool, GraphError> {
    let url = if db_path == ":memory:" {
        "sqlite::memory:".to_string()
    } else {
        format!("sqlite://{}", db_path)
    };
    let opts = SqliteConnectOptions::from_str(&url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(if db_path == ":memory:" { 1 } else { 5 })
        .connect_with(opts)
        .await?;
    for stmt in INIT_SQL.split(';') {
        let s = stmt.trim();
        if s.is_empty() {
            continue;
        }
        sqlx::query(s).execute(&pool).await?;
    }
    Ok(pool)
}

pub fn id_bytes(id: &NodeId) -> Vec<u8> {
    id.0.to_vec()
}

pub fn parse_id(b: &[u8]) -> Result<NodeId, GraphError> {
    if b.len() != 16 {
        return Err(GraphError::BadBlob);
    }
    let mut out = [0u8; 16];
    out.copy_from_slice(b);
    Ok(NodeId(out))
}

pub fn encode_props(p: &Props) -> Result<String, GraphError> {
    if p.is_empty() {
        return Ok("{}".into());
    }
    Ok(serde_json::to_string(p)?)
}

pub fn decode_props(s: &str) -> Result<Props, GraphError> {
    if s.is_empty() || s == "{}" {
        return Ok(HashMap::new());
    }
    let v: serde_json::Value = serde_json::from_str(s)?;
    let obj = v.as_object().ok_or(GraphError::BadProps)?;
    Ok(obj.iter().map(|(k, val)| (k.clone(), val.clone())).collect())
}

pub fn encode_ts(dt: &DateTime<Utc>) -> i64 {
    dt.timestamp_millis()
}

pub fn decode_ts(ms: i64) -> Result<DateTime<Utc>, GraphError> {
    DateTime::<Utc>::from_timestamp_millis(ms).ok_or(GraphError::BadTimestamp)
}

pub struct Loaded {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

pub async fn load_all(pool: &SqlitePool) -> Result<Loaded, GraphError> {
    let node_rows = sqlx::query(
        "SELECT id, node_type, label, props_json, first_seen, last_seen FROM graph_nodes",
    )
    .fetch_all(pool)
    .await?;
    let mut nodes = Vec::with_capacity(node_rows.len());
    for r in node_rows {
        let id_blob: Vec<u8> = r.get(0);
        let nt: String = r.get(1);
        let label: String = r.get(2);
        let props_s: String = r.get(3);
        let fs: i64 = r.get(4);
        let ls: i64 = r.get(5);
        nodes.push(Node {
            id: parse_id(&id_blob)?,
            kind: NodeType::from_str(&nt)?,
            label,
            props: decode_props(&props_s)?,
            first_seen: decode_ts(fs)?,
            last_seen: decode_ts(ls)?,
        });
    }
    let edge_rows = sqlx::query(
        "SELECT source_id, target_id, edge_type, props_json, first_seen, last_seen FROM graph_edges",
    )
    .fetch_all(pool)
    .await?;
    let mut edges = Vec::with_capacity(edge_rows.len());
    for r in edge_rows {
        let s: Vec<u8> = r.get(0);
        let d: Vec<u8> = r.get(1);
        let et: String = r.get(2);
        let props_s: String = r.get(3);
        let fs: i64 = r.get(4);
        let ls: i64 = r.get(5);
        edges.push(Edge {
            src: parse_id(&s)?,
            dst: parse_id(&d)?,
            kind: EdgeType::from_str(&et)?,
            props: decode_props(&props_s)?,
            first_seen: decode_ts(fs)?,
            last_seen: decode_ts(ls)?,
        });
    }
    Ok(Loaded { nodes, edges })
}
