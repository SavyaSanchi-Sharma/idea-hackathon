mod cfg;
mod error;
mod log;
mod loop_runner;
mod metrics;
mod owasp;
mod predictions;
mod process_batch;
mod python_promptmaker;
mod reports;
mod routes;
mod rule_classifier;
mod scan;
mod scan_runner;
mod slm_runtime;
mod state;
mod unified;
mod ws;

use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};

use crate::cfg::BackendCfg;
use crate::error::BackendError;
use crate::metrics::Metrics;
use crate::predictions::Predictions;
use crate::python_promptmaker::PythonPromptmaker;
use crate::reports::Reports;
use crate::scan::ScanRegistry;
use crate::slm_runtime::SlmRuntime;
use crate::state::AppState;
use crate::ws::WsBroadcaster;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config_path =
        std::env::var("ZH_CONFIG").unwrap_or_else(|_| "config.toml".to_string());
    log::start_kv("backend", &[("config", &config_path)]);
    let cfg = BackendCfg::load(&config_path)?;

    let graph = graph::GraphStore::rehydrate(cfg.paths.graph_db.to_string_lossy().as_ref())
        .await
        .map_err(|e| BackendError::Graph(e.to_string()))?;

    let endpoint_store = Arc::new(endpoint_store::EndpointStore::open(
        endpoint_store::EndpointStoreCfg {
            db_path: cfg.paths.endpoint_db.clone(),
            cve_table_path: cfg.paths.cve_table.clone(),
        },
    )?);

    let model_loader_cfg = model_loader::ModelLoaderCfg::new(cfg.paths.model_artifacts.clone())
        .with_sklearn(cfg.models.pinned_sklearn.clone());
    let model_loader = Arc::new(model_loader::ModelLoader::new(model_loader_cfg)?);

    let slm_runtime = Arc::new(SlmRuntime::new(&cfg.slm.model_name, &cfg.slm.device)?);
    slm_runtime.warmup().await?;
    let python_promptmaker = Arc::new(PythonPromptmaker::new()?);

    let predictions = Arc::new(Predictions::open(&cfg.paths.predictions_db)?);
    let reports = Arc::new(Reports::open(&cfg.paths.reports_db)?);
    let ws_broadcaster = Arc::new(WsBroadcaster::new(256));
    let scans = Arc::new(ScanRegistry::new());
    let backend_metrics = Metrics::new();

    let (tx, rx) = data::make(cfg.loop_cfg.queue_capacity);
    let _ = tx;

    let cfg_arc = Arc::new(cfg.clone());
    let state = AppState {
        graph: Arc::new(RwLock::new(graph)),
        endpoint_store,
        model_loader,
        slm_runtime,
        python_promptmaker,
        predictions,
        reports,
        ws: ws_broadcaster,
        scans,
        metrics: backend_metrics.clone(),
        cfg: cfg_arc.clone(),
    };

    metrics::spawn_heartbeat(backend_metrics);

    let loop_state = state.clone();
    tokio::spawn(async move {
        loop_runner::run(rx, loop_state).await;
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = routes::router()
        .with_state(state)
        .layer(cors);

    let addr: SocketAddr = ([0, 0, 0, 0], cfg.port).into();
    log::start_kv("backend.http", &[("addr", &addr.to_string())]);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
