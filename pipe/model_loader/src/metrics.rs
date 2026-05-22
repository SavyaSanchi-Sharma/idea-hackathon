use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use serde::Serialize;

#[derive(Default, Debug)]
pub struct Metrics {
    pub classify_calls: AtomicU64,
    pub risk_calls: AtomicU64,
    pub anomaly_calls: AtomicU64,
    pub rows_processed: AtomicU64,
    pub errors_total: AtomicU64,
    pub last_call_ts: AtomicU64,
}

impl Metrics {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }
    pub fn classify_called(&self, n: usize) {
        self.classify_calls.fetch_add(1, Ordering::Relaxed);
        self.rows_processed.fetch_add(n as u64, Ordering::Relaxed);
        self.tick();
    }
    pub fn risk_called(&self, n: usize) {
        self.risk_calls.fetch_add(1, Ordering::Relaxed);
        self.rows_processed.fetch_add(n as u64, Ordering::Relaxed);
        self.tick();
    }
    pub fn anomaly_called(&self, n: usize) {
        self.anomaly_calls.fetch_add(1, Ordering::Relaxed);
        self.rows_processed.fetch_add(n as u64, Ordering::Relaxed);
        self.tick();
    }
    pub fn err(&self) {
        self.errors_total.fetch_add(1, Ordering::Relaxed);
    }
    fn tick(&self) {
        self.last_call_ts
            .store(chrono::Utc::now().timestamp() as u64, Ordering::Relaxed);
    }
    pub fn snap(&self) -> Snap {
        Snap {
            classify_calls: self.classify_calls.load(Ordering::Relaxed),
            risk_calls: self.risk_calls.load(Ordering::Relaxed),
            anomaly_calls: self.anomaly_calls.load(Ordering::Relaxed),
            rows_processed: self.rows_processed.load(Ordering::Relaxed),
            errors_total: self.errors_total.load(Ordering::Relaxed),
            last_call_ts: self.last_call_ts.load(Ordering::Relaxed),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct Snap {
    pub classify_calls: u64,
    pub risk_calls: u64,
    pub anomaly_calls: u64,
    pub rows_processed: u64,
    pub errors_total: u64,
    pub last_call_ts: u64,
}

pub fn spawn_heartbeat(m: Arc<Metrics>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut t = tokio::time::interval(tokio::time::Duration::from_secs(30));
        t.tick().await;
        loop {
            t.tick().await;
            crate::log::hb("model_loader", &m.snap());
        }
    })
}
