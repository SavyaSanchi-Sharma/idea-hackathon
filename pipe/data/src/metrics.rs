use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use serde::Serialize;

#[derive(Default, Debug)]
pub struct M {
    pub emitted: AtomicU64,
    pub dropped: AtomicU64,
    pub errors: AtomicU64,
    pub last_ts: AtomicU64,
}

impl M {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }
    pub fn ok(&self) {
        self.emitted.fetch_add(1, Ordering::Relaxed);
        self.last_ts.store(chrono::Utc::now().timestamp() as u64, Ordering::Relaxed);
    }
    pub fn drop1(&self) {
        self.dropped.fetch_add(1, Ordering::Relaxed);
    }
    pub fn err(&self) {
        self.errors.fetch_add(1, Ordering::Relaxed);
    }
    pub fn snap(&self) -> Snap {
        Snap {
            emitted: self.emitted.load(Ordering::Relaxed),
            dropped: self.dropped.load(Ordering::Relaxed),
            errors: self.errors.load(Ordering::Relaxed),
            last_ts: self.last_ts.load(Ordering::Relaxed),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct Snap {
    pub emitted: u64,
    pub dropped: u64,
    pub errors: u64,
    pub last_ts: u64,
}
