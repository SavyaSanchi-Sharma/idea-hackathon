use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use serde::Serialize;

#[derive(Default, Debug)]
pub struct Metrics {
    pub nodes_added: AtomicU64,
    pub edges_added: AtomicU64,
    pub mutations_total: AtomicU64,
    pub errors_total: AtomicU64,
    pub last_mutation_ts: AtomicU64,
}

impl Metrics {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }
    pub fn add_node(&self) {
        self.nodes_added.fetch_add(1, Ordering::Relaxed);
    }
    pub fn add_edge(&self) {
        self.edges_added.fetch_add(1, Ordering::Relaxed);
    }
    pub fn mutation(&self) {
        self.mutations_total.fetch_add(1, Ordering::Relaxed);
        self.last_mutation_ts
            .store(chrono::Utc::now().timestamp() as u64, Ordering::Relaxed);
    }
    pub fn err(&self) {
        self.errors_total.fetch_add(1, Ordering::Relaxed);
    }
    pub fn snap(&self) -> Snap {
        Snap {
            nodes_added: self.nodes_added.load(Ordering::Relaxed),
            edges_added: self.edges_added.load(Ordering::Relaxed),
            mutations_total: self.mutations_total.load(Ordering::Relaxed),
            errors_total: self.errors_total.load(Ordering::Relaxed),
            last_mutation_ts: self.last_mutation_ts.load(Ordering::Relaxed),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct Snap {
    pub nodes_added: u64,
    pub edges_added: u64,
    pub mutations_total: u64,
    pub errors_total: u64,
    pub last_mutation_ts: u64,
}

pub fn spawn_heartbeat(m: Arc<Metrics>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut t = tokio::time::interval(tokio::time::Duration::from_secs(30));
        t.tick().await;
        loop {
            t.tick().await;
            crate::log::hb("graph", &m.snap());
        }
    })
}
