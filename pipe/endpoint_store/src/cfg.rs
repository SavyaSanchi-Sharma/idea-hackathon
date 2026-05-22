use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct EndpointStoreCfg {
    pub db_path: PathBuf,
    pub cve_table_path: PathBuf,
}
