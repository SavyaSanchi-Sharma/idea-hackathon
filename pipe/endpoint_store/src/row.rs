use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EndpointRow {
    pub endpoint_id: [u8; 16],
    pub service: String,
    pub method: String,
    pub path: String,

    pub in_registry: bool,
    pub owner_present: bool,
    pub owner_team: Option<String>,
    pub deprecated_flag: bool,
    pub auth_scheme: String,
    pub version_path: Option<String>,
    pub schema_count: u32,
    pub registry_first_seen: Option<DateTime<Utc>>,
    pub registry_last_modified: Option<DateTime<Utc>>,
    pub registry_deleted_at: Option<DateTime<Utc>>,

    pub runtime: Option<String>,
    pub runtime_version: Option<String>,
    pub last_commit_date: Option<DateTime<Utc>>,
    pub last_author: Option<String>,
    pub file_path: Option<String>,

    pub max_cvss: f32,
    pub cve_ids: Vec<String>,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
