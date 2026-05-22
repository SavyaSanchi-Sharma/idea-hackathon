use std::collections::HashMap;
use std::sync::Mutex;
use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
pub struct ScanJob {
    pub id: String,
    pub status: ScanStatus,
    pub progress: u32,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub stats: ScanStats,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScanStatus {
    Queued,
    Running,
    Complete,
    Failed,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ScanStats {
    pub total_discovered: u32,
    pub active: u32,
    pub deprecated: u32,
    pub orphaned: u32,
    pub critical: u32,
    pub shadow: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanEvent {
    pub scan_id: String,
    pub seq: u32,
    pub ts: DateTime<Utc>,
    pub phase: String,
    pub message: String,
    pub endpoint_id: Option<String>,
    pub severity: String,
}

pub struct ScanRegistry {
    jobs: Mutex<HashMap<String, ScanJob>>,
    events: Mutex<HashMap<String, Vec<ScanEvent>>>,
}

impl ScanRegistry {
    pub fn new() -> Self {
        Self {
            jobs: Mutex::new(HashMap::new()),
            events: Mutex::new(HashMap::new()),
        }
    }

    pub fn new_job(&self) -> ScanJob {
        let id = Uuid::new_v4().to_string();
        let job = ScanJob {
            id: id.clone(),
            status: ScanStatus::Queued,
            progress: 0,
            started_at: Utc::now(),
            completed_at: None,
            stats: ScanStats::default(),
        };
        self.jobs.lock().unwrap().insert(id.clone(), job.clone());
        self.events.lock().unwrap().insert(id, vec![]);
        job
    }

    pub fn update(&self, job: ScanJob) {
        self.jobs.lock().unwrap().insert(job.id.clone(), job);
    }

    pub fn get(&self, id: &str) -> Option<ScanJob> {
        self.jobs.lock().unwrap().get(id).cloned()
    }

    pub fn append_event(&self, ev: ScanEvent) {
        self.events
            .lock()
            .unwrap()
            .entry(ev.scan_id.clone())
            .or_default()
            .push(ev);
    }

    pub fn events_for(&self, id: &str) -> Vec<ScanEvent> {
        self.events.lock().unwrap().get(id).cloned().unwrap_or_default()
    }
}
