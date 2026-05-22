use std::sync::Arc;
use pyo3::prelude::*;
use pyo3::types::{PyModule, PyString};
use tokio::sync::Mutex;
use crate::cfg::ModelLoaderCfg;
use crate::error::ModelError;
use crate::features::FeatureBatch;
use crate::metrics::{Metrics, Snap};
use crate::predictions::{AnomalyPrediction, Prediction};
use crate::sequence::SequenceBatch;

const HELPER_SRC: &str = include_str!("python_helper.py");
const HELPER_MODULE: &str = "zh_model_helper";
const HELPER_FILE: &str = "python_helper.py";

pub struct ModelLoader {
    helper: Py<PyModule>,
    gil_mu: Arc<Mutex<()>>,
    metrics: Arc<Metrics>,
    sklearn_version: String,
}

impl ModelLoader {
    pub fn new(cfg: ModelLoaderCfg) -> Result<Self, ModelError> {
        crate::log::start("model_loader");
        pyo3::prepare_freethreaded_python();
        let (helper, sklearn_version) = Python::with_gil(|py| -> Result<(Py<PyModule>, String), ModelError> {
            let bound = PyModule::from_code_bound(py, HELPER_SRC, HELPER_FILE, HELPER_MODULE)
                .map_err(|e| ModelError::PyInit(format!("{}", e)))?;
            let init_fn = bound
                .getattr("init")
                .map_err(|e| ModelError::PyInit(format!("{}", e)))?;
            let root = cfg.artifacts_root.to_string_lossy().to_string();
            let result: String = init_fn
                .call1((root,))
                .map_err(|e| ModelError::PyInit(format!("{}", e)))?
                .extract()
                .map_err(|e| ModelError::PyInit(format!("{}", e)))?;
            let v: serde_json::Value = serde_json::from_str(&result)?;
            let ver = v
                .get("sklearn")
                .and_then(|s| s.as_str())
                .unwrap_or("")
                .to_string();
            Ok((bound.unbind(), ver))
        })?;

        if !cfg.pinned_sklearn.is_empty() && sklearn_version != cfg.pinned_sklearn {
            crate::log::err(
                "model_loader",
                &format!(
                    "sklearn mismatch want={} got={}",
                    cfg.pinned_sklearn, sklearn_version
                ),
            );
            return Err(ModelError::SklearnMismatch {
                want: cfg.pinned_sklearn,
                got: sklearn_version,
            });
        }

        Ok(Self {
            helper,
            gil_mu: Arc::new(Mutex::new(())),
            metrics: Metrics::new(),
            sklearn_version,
        })
    }

    pub fn sklearn_version(&self) -> &str {
        &self.sklearn_version
    }

    pub fn metrics(&self) -> Arc<Metrics> {
        self.metrics.clone()
    }

    pub fn health(&self) -> Snap {
        self.metrics.snap()
    }

    pub async fn classify(&self, batch: &FeatureBatch) -> Result<Vec<Prediction>, ModelError> {
        if batch.is_empty() {
            return Ok(Vec::new());
        }
        let json = serde_json::to_string(&batch.0)?;
        let r = self.call_py("classify", json).await;
        match r {
            Ok(s) => {
                let preds: Vec<Prediction> = serde_json::from_str(&s)?;
                self.metrics.classify_called(preds.len());
                Ok(preds)
            }
            Err(e) => {
                self.metrics.err();
                Err(e)
            }
        }
    }

    pub async fn risk(&self, batch: &FeatureBatch) -> Result<Vec<Prediction>, ModelError> {
        if batch.is_empty() {
            return Ok(Vec::new());
        }
        let json = serde_json::to_string(&batch.0)?;
        let r = self.call_py("risk", json).await;
        match r {
            Ok(s) => {
                let preds: Vec<Prediction> = serde_json::from_str(&s)?;
                self.metrics.risk_called(preds.len());
                Ok(preds)
            }
            Err(e) => {
                self.metrics.err();
                Err(e)
            }
        }
    }

    pub async fn anomaly(
        &self,
        batch: &SequenceBatch,
    ) -> Result<Vec<AnomalyPrediction>, ModelError> {
        if batch.is_empty() {
            return Ok(Vec::new());
        }
        let json = serde_json::to_string(&batch.0)?;
        let r = self.call_py("anomaly", json).await;
        match r {
            Ok(s) => {
                let preds: Vec<AnomalyPrediction> = serde_json::from_str(&s)?;
                self.metrics.anomaly_called(preds.len());
                Ok(preds)
            }
            Err(e) => {
                self.metrics.err();
                Err(e)
            }
        }
    }

    async fn call_py(&self, fn_name: &'static str, json: String) -> Result<String, ModelError> {
        let _guard = self.gil_mu.lock().await;
        let helper = Python::with_gil(|py| self.helper.clone_ref(py));
        tokio::task::spawn_blocking(move || -> Result<String, ModelError> {
            Python::with_gil(|py| {
                let m = helper.bind(py);
                let f = m
                    .getattr(fn_name)
                    .map_err(|e| ModelError::PyCall(format!("{}", e)))?;
                let arg = PyString::new_bound(py, &json);
                let result: String = f
                    .call1((arg,))
                    .map_err(|e| ModelError::PyCall(format!("{}", e)))?
                    .extract()
                    .map_err(|e| ModelError::PyCall(format!("{}", e)))?;
                Ok(result)
            })
        })
        .await
        .map_err(|e| ModelError::Join(format!("{}", e)))?
    }
}
