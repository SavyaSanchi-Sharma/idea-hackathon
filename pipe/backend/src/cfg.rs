use crate::error::BackendError;
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize)]
pub struct BackendCfg {
    pub port: u16,
    pub paths: Paths,
    #[serde(rename = "loop")]
    pub loop_cfg: LoopCfg,
    pub slm: SlmCfg,
    pub models: ModelsCfg,
    pub cors: CorsCfg,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Paths {
    pub graph_db: PathBuf,
    pub endpoint_db: PathBuf,
    pub predictions_db: PathBuf,
    pub reports_db: PathBuf,
    pub cve_table: PathBuf,
    pub model_artifacts: PathBuf,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoopCfg {
    pub window_secs: u64,
    pub batch_size_hint: usize,
    pub queue_capacity: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SlmCfg {
    pub model_name: String,
    pub device: String,
    pub max_new_tokens: u32,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModelsCfg {
    pub pinned_sklearn: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CorsCfg {
    pub allowed_origins: Vec<String>,
}

impl BackendCfg {
    pub fn load(path: &str) -> Result<Self, BackendError> {
        let raw = std::fs::read_to_string(path)
            .map_err(|e| BackendError::Config(format!("read {}: {}", path, e)))?;
        let cfg: BackendCfg = toml::from_str(&raw)
            .map_err(|e| BackendError::Config(format!("parse {}: {}", path, e)))?;
        Ok(cfg)
    }
}
