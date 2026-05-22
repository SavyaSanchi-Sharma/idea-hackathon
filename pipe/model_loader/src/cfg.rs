use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct ModelLoaderCfg {
    pub artifacts_root: PathBuf,
    pub pinned_sklearn: String,
}

impl ModelLoaderCfg {
    pub fn new(artifacts_root: impl Into<PathBuf>) -> Self {
        Self {
            artifacts_root: artifacts_root.into(),
            pinned_sklearn: String::new(),
        }
    }
    pub fn with_sklearn(mut self, version: impl Into<String>) -> Self {
        self.pinned_sklearn = version.into();
        self
    }
}
