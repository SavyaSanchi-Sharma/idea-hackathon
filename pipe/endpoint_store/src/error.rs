use thiserror::Error;

#[derive(Debug, Error)]
pub enum EndpointStoreError {
    #[error("sql open: {0}")]
    SqlOpen(String),
    #[error("sql exec: {0}")]
    SqlExec(String),
    #[error("cve load: {0}")]
    CveLoad(String),
    #[error("bad row: {0}")]
    BadRow(String),
    #[error("key mismatch: {0}")]
    KeyMismatch(String),
}

impl From<rusqlite::Error> for EndpointStoreError {
    fn from(e: rusqlite::Error) -> Self {
        Self::SqlExec(e.to_string())
    }
}
