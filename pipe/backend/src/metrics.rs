use serde::Serialize;
use std::sync::Arc;
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};

#[derive(Default, Debug)]
pub struct Metrics {
    pub batches_total: AtomicU64,
    pub events_processed: AtomicU64,
    pub endpoints_processed: AtomicU64,
    pub predictions_written: AtomicU64,
    pub reports_written: AtomicU64,
    pub ws_messages_sent: AtomicU64,
    pub errors_total: AtomicU64,
    pub last_batch_ts: AtomicI64,
}

impl Metrics {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }
    pub fn batch_done(&self, n_events: usize, n_endpoints: usize) {
        self.batches_total.fetch_add(1, Ordering::Relaxed);
        self.events_processed
            .fetch_add(n_events as u64, Ordering::Relaxed);
        self.endpoints_processed
            .fetch_add(n_endpoints as u64, Ordering::Relaxed);
        self.last_batch_ts
            .store(chrono::Utc::now().timestamp(), Ordering::Relaxed);
    }
    pub fn predictions(&self, n: usize) {
        self.predictions_written
            .fetch_add(n as u64, Ordering::Relaxed);
    }
    pub fn report(&self) {
        self.reports_written.fetch_add(1, Ordering::Relaxed);
    }
    pub fn ws_sent(&self) {
        self.ws_messages_sent.fetch_add(1, Ordering::Relaxed);
    }
    pub fn err(&self) {
        self.errors_total.fetch_add(1, Ordering::Relaxed);
    }
    pub fn snap(&self) -> Snap {
        Snap {
            batches_total: self.batches_total.load(Ordering::Relaxed),
            events_processed: self.events_processed.load(Ordering::Relaxed),
            endpoints_processed: self.endpoints_processed.load(Ordering::Relaxed),
            predictions_written: self.predictions_written.load(Ordering::Relaxed),
            reports_written: self.reports_written.load(Ordering::Relaxed),
            ws_messages_sent: self.ws_messages_sent.load(Ordering::Relaxed),
            errors_total: self.errors_total.load(Ordering::Relaxed),
            last_batch_ts: self.last_batch_ts.load(Ordering::Relaxed),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct Snap {
    pub batches_total: u64,
    pub events_processed: u64,
    pub endpoints_processed: u64,
    pub predictions_written: u64,
    pub reports_written: u64,
    pub ws_messages_sent: u64,
    pub errors_total: u64,
    pub last_batch_ts: i64,
}

pub fn spawn_heartbeat(m: Arc<Metrics>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut t = tokio::time::interval(tokio::time::Duration::from_secs(30));
        t.tick().await;
        loop {
            t.tick().await;
            crate::log::hb("backend", &m.snap());
        }
    })
}
