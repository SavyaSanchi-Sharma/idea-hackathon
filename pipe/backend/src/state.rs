use crate::cfg::BackendCfg;
use crate::metrics::Metrics;
use crate::predictions::Predictions;
use crate::python_promptmaker::PythonPromptmaker;
use crate::reports::Reports;
use crate::scan::ScanRegistry;
use crate::slm_runtime::SlmRuntime;
use crate::ws::WsBroadcaster;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub graph: Arc<RwLock<graph::GraphStore>>,
    pub endpoint_store: Arc<endpoint_store::EndpointStore>,
    pub model_loader: Arc<model_loader::ModelLoader>,
    pub slm_runtime: Arc<SlmRuntime>,
    pub python_promptmaker: Arc<PythonPromptmaker>,
    pub predictions: Arc<Predictions>,
    pub reports: Arc<Reports>,
    pub ws: Arc<WsBroadcaster>,
    pub scans: Arc<ScanRegistry>,
    pub metrics: Arc<Metrics>,
    pub cfg: Arc<BackendCfg>,
}
