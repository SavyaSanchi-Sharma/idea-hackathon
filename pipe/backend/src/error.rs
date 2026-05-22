use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum BackendError {
    #[error("config: {0}")]
    Config(String),
    #[error("sql: {0}")]
    Sql(String),
    #[error("graph: {0}")]
    Graph(String),
    #[error("endpoint store: {0}")]
    EndpointStore(String),
    #[error("model loader: {0}")]
    ModelLoader(String),
    #[error("slm: {0}")]
    Slm(String),
    #[error("slm timeout")]
    SlmTimeout,
    #[error("promptmaker: {0}")]
    Promptmaker(String),
    #[error("bad id: {0}")]
    BadId(String),
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("not found")]
    NotFound,
    #[error("internal: {0}")]
    Internal(String),
}

impl From<rusqlite::Error> for BackendError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Sql(e.to_string())
    }
}

impl From<graph::GraphError> for BackendError {
    fn from(e: graph::GraphError) -> Self {
        Self::Graph(e.to_string())
    }
}

impl From<endpoint_store::EndpointStoreError> for BackendError {
    fn from(e: endpoint_store::EndpointStoreError) -> Self {
        Self::EndpointStore(e.to_string())
    }
}

impl From<model_loader::ModelError> for BackendError {
    fn from(e: model_loader::ModelError) -> Self {
        Self::ModelLoader(e.to_string())
    }
}

impl From<serde_json::Error> for BackendError {
    fn from(e: serde_json::Error) -> Self {
        Self::Internal(format!("json: {}", e))
    }
}

impl IntoResponse for BackendError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            Self::Config(_) => (StatusCode::INTERNAL_SERVER_ERROR, "config_error"),
            Self::Sql(_) => (StatusCode::INTERNAL_SERVER_ERROR, "sql_error"),
            Self::Graph(_) => (StatusCode::INTERNAL_SERVER_ERROR, "graph_error"),
            Self::EndpointStore(_) => (StatusCode::INTERNAL_SERVER_ERROR, "endpoint_store_error"),
            Self::ModelLoader(_) => (StatusCode::INTERNAL_SERVER_ERROR, "model_loader_error"),
            Self::Slm(_) => (StatusCode::BAD_GATEWAY, "slm_error"),
            Self::SlmTimeout => (StatusCode::SERVICE_UNAVAILABLE, "slm_timeout"),
            Self::Promptmaker(_) => (StatusCode::INTERNAL_SERVER_ERROR, "promptmaker_error"),
            Self::BadId(_) => (StatusCode::BAD_REQUEST, "bad_id"),
            Self::BadRequest(_) => (StatusCode::BAD_REQUEST, "bad_request"),
            Self::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            Self::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal"),
        };
        let body = Json(json!({
            "error": code,
            "message": self.to_string(),
        }));
        (status, body).into_response()
    }
}
