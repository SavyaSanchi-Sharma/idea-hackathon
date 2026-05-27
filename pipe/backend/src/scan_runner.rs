use crate::scan::{ScanEvent, ScanStats, ScanStatus};
use crate::state::AppState;
use crate::unified::{Classification, RiskBand};
use crate::ws::Message;
use chrono::Utc;

pub async fn run_consultation(state: AppState, scan_id: String) {
    let mut job = match state.scans.get(&scan_id) {
        Some(j) => j,
        None => return,
    };
    job.status = ScanStatus::Running;
    state.scans.update(job.clone());

    let preds = match state.predictions.list_all() {
        Ok(p) => p,
        Err(e) => {
            crate::log::err("scan_runner", &e.to_string());
            job.status = ScanStatus::Failed;
            job.completed_at = Some(Utc::now());
            state.scans.update(job);
            return;
        }
    };

    let total = preds.len();
    let mut stats = ScanStats::default();
    let mut seq: u32 = 0;
    for (i, p) in preds.iter().enumerate() {
        stats.total_discovered = (i + 1) as u32;
        match p.rule_state {
            Classification::Active => stats.active += 1,
            Classification::Deprecated => stats.deprecated += 1,
            Classification::Orphaned => stats.orphaned += 1,
        }
        if p.risk_band == RiskBand::Critical {
            stats.critical += 1;
        }
        if p.rule_is_shadow {
            stats.shadow += 1;
        }
        if p.risk_band == RiskBand::Critical || p.rule_is_shadow {
            seq += 1;
            let ev = ScanEvent {
                scan_id: scan_id.clone(),
                seq,
                ts: Utc::now(),
                phase: "classification".into(),
                message: format!(
                    "{} endpoint flagged: {} ({})",
                    p.risk_band.as_str(),
                    hex::encode(p.endpoint_id),
                    p.rule_state.as_str()
                ),
                endpoint_id: Some(hex::encode(p.endpoint_id)),
                severity: p.risk_band.as_str().into(),
            };
            state.scans.append_event(ev.clone());
            state.ws.broadcast(Message::ScanEvent(ev)).await;
        }
        if total > 0 && (i + 1) % 10 == 0 {
            let progress = ((i + 1) * 100 / total) as u32;
            state
                .ws
                .broadcast(Message::ScanProgress {
                    scan_id: scan_id.clone(),
                    progress,
                    stats: stats.clone(),
                })
                .await;
        }
    }

    job.status = ScanStatus::Complete;
    job.progress = 100;
    job.completed_at = Some(Utc::now());
    job.stats = stats.clone();
    state.scans.update(job);
    state
        .ws
        .broadcast(Message::ScanComplete {
            scan_id: scan_id.clone(),
            stats,
        })
        .await;
}
