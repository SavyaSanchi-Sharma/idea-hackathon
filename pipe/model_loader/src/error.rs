use thiserror::Error;

#[derive(Debug, Error)]
pub enum ModelError {
    #[error("python init failed: {0}")]
    PyInit(String),
    #[error("python call failed: {0}")]
    PyCall(String),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("sklearn version mismatch: want {want}, got {got}")]
    SklearnMismatch { want: String, got: String },
    #[error("tokio join: {0}")]
    Join(String),
}
