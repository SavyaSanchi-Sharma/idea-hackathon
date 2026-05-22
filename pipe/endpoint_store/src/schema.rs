use rusqlite::Connection;
use crate::error::EndpointStoreError;

pub const INIT_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS endpoint_props (
    endpoint_id            BLOB    PRIMARY KEY,
    service                TEXT    NOT NULL,
    method                 TEXT    NOT NULL,
    path                   TEXT    NOT NULL,

    in_registry            INTEGER NOT NULL,
    owner_present          INTEGER NOT NULL,
    owner_team             TEXT,
    deprecated_flag        INTEGER NOT NULL,
    auth_scheme            TEXT    NOT NULL,
    version_path           TEXT,
    schema_count           INTEGER NOT NULL DEFAULT 0,
    registry_first_seen    INTEGER,
    registry_last_modified INTEGER,
    registry_deleted_at    INTEGER,

    runtime                TEXT,
    runtime_version        TEXT,
    last_commit_date       INTEGER,
    last_author            TEXT,
    file_path              TEXT,

    max_cvss               REAL    NOT NULL DEFAULT 0.0,
    cve_ids_json           TEXT    NOT NULL DEFAULT '[]',

    created_at             INTEGER NOT NULL,
    updated_at             INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_endpoint_props_service     ON endpoint_props(service);
CREATE INDEX IF NOT EXISTS idx_endpoint_props_in_registry ON endpoint_props(in_registry);
CREATE INDEX IF NOT EXISTS idx_endpoint_props_owner       ON endpoint_props(owner_present);
CREATE INDEX IF NOT EXISTS idx_endpoint_props_deprecated  ON endpoint_props(deprecated_flag);
CREATE INDEX IF NOT EXISTS idx_endpoint_props_runtime     ON endpoint_props(runtime);
"#;

pub fn migrate(conn: &Connection) -> Result<(), EndpointStoreError> {
    conn.execute_batch(INIT_SQL)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(())
}
