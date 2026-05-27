use crate::error::BackendError;
use pyo3::prelude::*;
use pyo3::types::{PyModule, PyString};
use serde::Serialize;
use serde_json::Value;
use tokio::sync::Mutex;

const PROMPTMAKER_SRC: &str = include_str!("promptmaker.py");

pub struct PythonPromptmaker {
    module: Py<PyModule>,
    lock: Mutex<()>,
}

#[derive(Debug, Clone)]
pub struct PromptOut {
    pub system_prompt: String,
    pub user_context: Value,
}

impl PythonPromptmaker {
    pub fn new() -> Result<Self, BackendError> {
        crate::log::start_who("python_promptmaker");
        pyo3::prepare_freethreaded_python();
        let module = Python::with_gil(|py| -> PyResult<Py<PyModule>> {
            let m =
                PyModule::from_code_bound(py, PROMPTMAKER_SRC, "promptmaker.py", "promptmaker")?;
            Ok(m.unbind())
        })
        .map_err(|e| BackendError::Promptmaker(format!("load: {}", e)))?;
        Ok(Self {
            module,
            lock: Mutex::new(()),
        })
    }

    pub async fn build_threat_narrative<P: Serialize>(
        &self,
        payload: &P,
    ) -> Result<PromptOut, BackendError> {
        self.call("build_threat_narrative_json", payload).await
    }

    pub async fn build_remediation_playbook<P: Serialize>(
        &self,
        payload: &P,
    ) -> Result<PromptOut, BackendError> {
        self.call("build_remediation_playbook_json", payload).await
    }

    pub async fn build_compliance_summary<P: Serialize>(
        &self,
        payload: &P,
    ) -> Result<PromptOut, BackendError> {
        self.call("build_compliance_summary_json", payload).await
    }

    async fn call<P: Serialize>(
        &self,
        fn_name: &'static str,
        payload: &P,
    ) -> Result<PromptOut, BackendError> {
        let payload_json = serde_json::to_string(payload)?;
        let _guard = self.lock.lock().await;
        let module = Python::with_gil(|py| self.module.clone_ref(py));
        let result = tokio::task::spawn_blocking(move || -> PyResult<String> {
            Python::with_gil(|py| {
                let m = module.bind(py);
                let f = m.getattr(fn_name)?;
                let r: String = f
                    .call1((PyString::new_bound(py, &payload_json),))?
                    .extract()?;
                Ok(r)
            })
        })
        .await
        .map_err(|e| BackendError::Promptmaker(format!("join: {}", e)))?
        .map_err(|e| BackendError::Promptmaker(e.to_string()))?;

        let parsed: Value = serde_json::from_str(&result)?;
        let sp = parsed
            .get("system_prompt")
            .and_then(|v| v.as_str())
            .ok_or_else(|| BackendError::Promptmaker("missing system_prompt".into()))?
            .to_string();
        let ctx = parsed
            .get("user_context")
            .cloned()
            .ok_or_else(|| BackendError::Promptmaker("missing user_context".into()))?;
        Ok(PromptOut {
            system_prompt: sp,
            user_context: ctx,
        })
    }
}
