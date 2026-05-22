use std::path::PathBuf;

#[derive(Clone)]
pub struct SynTrafCfg {
    pub file: PathBuf,
    pub rate: u32,
    pub compress: f32,
}

#[derive(Clone)]
pub struct SynRegCfg {
    pub file: PathBuf,
    pub poll_secs: u64,
}

#[derive(Clone)]
pub struct SynCodeCfg {
    pub dir: PathBuf,
    pub meta: PathBuf,
}

#[derive(Clone)]
pub struct RealTrafCfg {
    pub broker: String,
    pub topic: String,
    pub group: String,
    pub gateway: String,
}

#[derive(Clone)]
pub enum RegMode {
    Poll { url: String, secs: u64 },
    Webhook { bind: String, path: String },
}

#[derive(Clone)]
pub struct RealRegCfg {
    pub mode: RegMode,
}

#[derive(Clone)]
pub struct RealCodeCfg {
    pub bind: String,
    pub path: String,
    pub secret: String,
    pub api_base: String,
    pub api_token: String,
}
