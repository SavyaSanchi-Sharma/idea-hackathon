use std::sync::Arc;
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use serde::Serialize;

#[derive(Default, Debug)]
pub struct Metrics {
    pub upserts_total: AtomicU64,
    pub gets_total: AtomicU64,
    pub errors_total: AtomicU64,
    pub last_upsert_ts: AtomicI64,
}

impl Metrics {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }
    pub fn upsert(&self) {
        self.upserts_total.fetch_add(1, Ordering::Relaxed);
        self.last_upsert_ts
            .store(chrono::Utc::now().timestamp(), Ordering::Relaxed);
    }
    pub fn get(&self, n: u64) {
        self.gets_total.fetch_add(n, Ordering::Relaxed);
    }
    pub fn err(&self) {
        self.errors_total.fetch_add(1, Ordering::Relaxed);
    }
    pub fn snap(&self, row_count: u64) -> Snap {
        let last = self.last_upsert_ts.load(Ordering::Relaxed);
        Snap {
            upserts_total: self.upserts_total.load(Ordering::Relaxed),
            gets_total: self.gets_total.load(Ordering::Relaxed),
            errors_total: self.errors_total.load(Ordering::Relaxed),
            last_upsert_ts: if last == 0 { None } else { Some(last) },
            row_count,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct Snap {
    pub upserts_total: u64,
    pub gets_total: u64,
    pub errors_total: u64,
    pub last_upsert_ts: Option<i64>,
    pub row_count: u64,
}
