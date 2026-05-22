use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Src {
    SynTraffic,
    SynRegistry,
    SynCode,
    RealTraffic,
    RealRegistry,
    RealCode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Traffic {
    pub timestamp: DateTime<Utc>,
    pub request_id: Uuid,
    pub method: String,
    pub path: String,
    pub status_code: u16,
    pub latency_ms: u32,
    pub client_id: String,
    pub auth_scheme: String,
    pub upstream_service: String,
    pub bytes_in: u64,
    pub bytes_out: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Registry {
    pub timestamp: DateTime<Utc>,
    pub change_type: String,
    pub endpoint_path: String,
    pub method: String,
    pub version: Option<String>,
    pub service: String,
    pub owner_team: Option<String>,
    pub auth_required: String,
    pub deprecated_flag: bool,
    pub sunset_date: Option<DateTime<Utc>>,
    pub last_modified: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Code {
    pub timestamp: DateTime<Utc>,
    pub repo_name: String,
    pub commit_sha: String,
    pub endpoint_path: String,
    pub method: String,
    pub service: String,
    pub file_path: String,
    pub last_commit_date: DateTime<Utc>,
    pub last_author: String,
    pub runtime: String,
    pub runtime_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Event {
    Traffic(Traffic),
    Registry(Registry),
    Code(Code),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tagged {
    pub event_source: Src,
    pub event: Event,
}
