use crate::unified::UnifiedPrediction;
use serde::Serialize;
use std::sync::Mutex;
use tokio::sync::broadcast;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "payload")]
pub enum Message {
    EndpointUpdates(Vec<EndpointUpdate>),
    ScanProgress {
        scan_id: String,
        progress: u32,
        stats: crate::scan::ScanStats,
    },
    ScanEvent(crate::scan::ScanEvent),
    ScanComplete {
        scan_id: String,
        stats: crate::scan::ScanStats,
    },
    ReportReady {
        endpoint_id: String,
        report_kind: String,
        framework: String,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct EndpointUpdate {
    pub endpoint_id: String,
    pub rule_state: String,
    pub ml_state: String,
    pub risk_score: f32,
    pub risk_band: String,
    pub needs_review: bool,
    pub finding_count: u32,
}

impl From<&UnifiedPrediction> for EndpointUpdate {
    fn from(u: &UnifiedPrediction) -> Self {
        Self {
            endpoint_id: hex::encode(u.endpoint_id),
            rule_state: u.rule_state.as_str().into(),
            ml_state: u.ml_state.as_str().into(),
            risk_score: u.risk_score,
            risk_band: u.risk_band.as_str().into(),
            needs_review: u.needs_review,
            finding_count: u.finding_count,
        }
    }
}

pub struct WsBroadcaster {
    tx: broadcast::Sender<String>,
    sent: Mutex<u64>,
}

impl WsBroadcaster {
    pub fn new(capacity: usize) -> Self {
        let (tx, _rx) = broadcast::channel(capacity);
        Self {
            tx,
            sent: Mutex::new(0),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.tx.subscribe()
    }

    pub async fn broadcast(&self, msg: Message) {
        let serialized = match serde_json::to_string(&msg) {
            Ok(s) => s,
            Err(e) => {
                crate::log::err("ws.broadcast.serialize", &e.to_string());
                return;
            }
        };
        let _ = self.tx.send(serialized);
        let mut s = self.sent.lock().unwrap();
        *s += 1;
    }

    pub fn sent_count(&self) -> u64 {
        *self.sent.lock().unwrap()
    }
}
