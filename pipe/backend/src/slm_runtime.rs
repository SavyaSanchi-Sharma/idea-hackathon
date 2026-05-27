use crate::error::BackendError;
use pyo3::prelude::*;
use pyo3::types::{PyModule, PyString};
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::Mutex;

const BRIDGE_SRC: &str = include_str!("slm_bridge.py");

pub struct SlmRuntime {
    bridge: Py<PyModule>,
    lock: Mutex<()>,
    generations_total: AtomicU64,
    errors_total: AtomicU64,
    model_name: String,
    device: String,
}

impl SlmRuntime {
    pub fn new(model_name: &str, device: &str) -> Result<Self, BackendError> {
        crate::log::start_kv("slm_runtime", &[("model", model_name), ("device", device)]);
        pyo3::prepare_freethreaded_python();
        let bridge = Python::with_gil(|py| -> PyResult<Py<PyModule>> {
            let m = PyModule::from_code_bound(py, BRIDGE_SRC, "slm_bridge.py", "slm_bridge")?;
            let init_fn = m.getattr("init")?;
            let _: String = init_fn.call1((model_name, device))?.extract()?;
            Ok(m.unbind())
        })
        .map_err(|e| BackendError::Slm(format!("init: {}", e)))?;

        Ok(Self {
            bridge,
            lock: Mutex::new(()),
            generations_total: AtomicU64::new(0),
            errors_total: AtomicU64::new(0),
            model_name: model_name.to_string(),
            device: device.to_string(),
        })
    }

    pub fn model_name(&self) -> &str {
        &self.model_name
    }
    pub fn device(&self) -> &str {
        &self.device
    }

    pub async fn warmup(&self) -> Result<(), BackendError> {
        let _ = self.call_py("warmup", None).await?;
        Ok(())
    }

    pub async fn generate(
        &self,
        system_prompt: &str,
        user_context_json: &str,
        max_new_tokens: u32,
    ) -> Result<String, BackendError> {
        let _guard = self.lock.lock().await;
        let bridge = Python::with_gil(|py| self.bridge.clone_ref(py));
        let sp = system_prompt.to_string();
        let ctx = user_context_json.to_string();
        let result = tokio::task::spawn_blocking(move || -> PyResult<String> {
            Python::with_gil(|py| {
                let m = bridge.bind(py);
                let f = m.getattr("generate")?;
                let arg_sp = PyString::new_bound(py, &sp);
                let arg_ctx = PyString::new_bound(py, &ctx);
                let r: String = f.call1((arg_sp, arg_ctx, max_new_tokens))?.extract()?;
                Ok(r)
            })
        })
        .await
        .map_err(|e| BackendError::Slm(format!("join: {}", e)))?
        .map_err(|e| {
            self.errors_total.fetch_add(1, Ordering::Relaxed);
            BackendError::Slm(e.to_string())
        })?;

        self.generations_total.fetch_add(1, Ordering::Relaxed);
        Ok(result)
    }

    async fn call_py(
        &self,
        name: &'static str,
        arg: Option<String>,
    ) -> Result<String, BackendError> {
        let bridge = Python::with_gil(|py| self.bridge.clone_ref(py));
        tokio::task::spawn_blocking(move || -> PyResult<String> {
            Python::with_gil(|py| {
                let m = bridge.bind(py);
                let f = m.getattr(name)?;
                let r: String = match arg {
                    Some(a) => f.call1((PyString::new_bound(py, &a),))?.extract()?,
                    None => f.call0()?.extract()?,
                };
                Ok(r)
            })
        })
        .await
        .map_err(|e| BackendError::Slm(format!("join: {}", e)))?
        .map_err(|e| BackendError::Slm(e.to_string()))
    }

    pub fn snap(&self) -> SlmSnap {
        SlmSnap {
            generations_total: self.generations_total.load(Ordering::Relaxed),
            errors_total: self.errors_total.load(Ordering::Relaxed),
            model: self.model_name.clone(),
            device: self.device.clone(),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SlmSnap {
    pub generations_total: u64,
    pub errors_total: u64,
    pub model: String,
    pub device: String,
}
