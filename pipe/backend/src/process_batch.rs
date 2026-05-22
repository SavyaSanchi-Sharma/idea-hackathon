use std::collections::{HashMap, HashSet};
use std::time::Instant;
use chrono::Utc;
use data::{Event, Tagged};
use graph::NodeId;
use model_loader::{AssembleInput, FeatureBatch, FeatureRow};
use crate::owasp::{self, OwaspInput};
use crate::rule_classifier::{self, RuleInput};
use crate::state::AppState;
use crate::unified::{Classification, UnifiedPrediction};

pub async fn run(state: &AppState, events: Vec<Tagged>) {
    let started = Instant::now();
    let n_events = events.len();
    let mut touched: HashSet<NodeId> = HashSet::new();

    {
        let mut g = state.graph.write().await;
        for ev in &events {
            match graph::ingest::apply(&mut g, ev).await {
                Ok(id) => {
                    touched.insert(id);
                }
                Err(e) => {
                    crate::log::err("process_batch.graph_apply", &e.to_string());
                    state.metrics.err();
                }
            }
            match &ev.event {
                Event::Registry(r) => {
                    if let Err(e) = state.endpoint_store.upsert_from_registry(r) {
                        crate::log::err("process_batch.endpoint_registry", &e.to_string());
                        state.metrics.err();
                    }
                }
                Event::Code(c) => {
                    if let Err(e) = state.endpoint_store.upsert_from_code(c) {
                        crate::log::err("process_batch.endpoint_code", &e.to_string());
                        state.metrics.err();
                    }
                }
                Event::Traffic(_) => {}
            }
        }
    }

    if touched.is_empty() {
        return;
    }

    let touched_vec: Vec<NodeId> = touched.into_iter().collect();
    let endpoint_ids_raw: Vec<[u8; 16]> = touched_vec.iter().map(|n| n.0).collect();

    let rows = match state.endpoint_store.get_many(&endpoint_ids_raw) {
        Ok(m) => m,
        Err(e) => {
            crate::log::err("process_batch.get_many", &e.to_string());
            state.metrics.err();
            return;
        }
    };

    let mut features = FeatureBatch::default();
    let mut id_meta: Vec<(NodeId, String, String)> = Vec::new();
    {
        let g = state.graph.read().await;
        for (i, nid) in touched_vec.iter().enumerate() {
            let row = match rows.get(&nid.0) {
                Some(r) => r,
                None => continue,
            };
            let stats = g.endpoint_stats(nid);
            let calls_observed = stats.as_ref().map(|s| s.calls_observed).unwrap_or(0) as i64;
            let p95 = stats
                .as_ref()
                .and_then(|s| {
                    let mut v: Vec<u32> = s.latency_samples.iter().copied().collect();
                    if v.is_empty() {
                        None
                    } else {
                        v.sort_unstable();
                        let n = v.len();
                        let idx = (((n as f64) * 0.95).ceil() as usize).saturating_sub(1).min(n - 1);
                        Some(v[idx] as f64)
                    }
                })
                .unwrap_or(0.0);
            let fail_rate = stats
                .as_ref()
                .map(|s| {
                    let total: u64 = s.status_counts.values().sum();
                    if total == 0 {
                        0.0
                    } else {
                        let fails: u64 = s
                            .status_counts
                            .iter()
                            .filter(|(k, _)| **k == 401 || **k == 403)
                            .map(|(_, v)| *v)
                            .sum();
                        (fails as f64) / (total as f64)
                    }
                })
                .unwrap_or(0.0);
            let last_seen_days = row.registry_last_modified
                .map(|t| (Utc::now() - t).num_days() as f64)
                .unwrap_or(0.0);
            let last_deploy_days = row.last_commit_date
                .map(|t| (Utc::now() - t).num_days() as f64)
                .unwrap_or(0.0);

            let fr = FeatureRow::assemble(AssembleInput {
                endpoint_id: i as i64,
                endpoint: &row.path,
                method: &row.method,
                service: &row.service,
                in_registry: row.in_registry,
                owner_present: row.owner_present,
                deprecated_flag: row.deprecated_flag,
                call_count_7d: calls_observed,
                auth_fail_rate_7d: fail_rate,
                p95_latency_ms: p95,
                last_seen_days,
                last_deploy_days,
                auth_scheme: &row.auth_scheme,
                runtime: row.runtime.as_deref(),
                runtime_version: row.runtime_version.as_deref(),
                schema_count: row.schema_count as i32,
                max_cvss: row.max_cvss as f64,
            });
            id_meta.push((*nid, row.path.clone(), row.method.clone()));
            features.push(fr);
        }
    }

    if features.is_empty() {
        return;
    }

    let ml_fut = state.model_loader.classify(&features);
    let risk_fut = state.model_loader.risk(&features);
    let (ml_preds, risk_preds) = match tokio::try_join!(ml_fut, risk_fut) {
        Ok(p) => p,
        Err(e) => {
            crate::log::err("process_batch.model_loader", &e.to_string());
            state.metrics.err();
            return;
        }
    };
    let ml_by_id: HashMap<i64, &model_loader::Prediction> =
        ml_preds.iter().map(|p| (p.endpoint_id, p)).collect();
    let risk_by_id: HashMap<i64, &model_loader::Prediction> =
        risk_preds.iter().map(|p| (p.endpoint_id, p)).collect();

    let mut unified: Vec<UnifiedPrediction> = Vec::with_capacity(features.len());
    for (i, fr) in features.0.iter().enumerate() {
        let (nid, path, method) = match id_meta.get(i) {
            Some(t) => (t.0, t.1.clone(), t.2.clone()),
            None => continue,
        };
        let _ = method;
        let row = match rows.get(&nid.0) {
            Some(r) => r,
            None => continue,
        };
        let rule = rule_classifier::classify(RuleInput {
            in_registry: fr.in_registry != 0,
            owner_present: fr.owner_present != 0,
            deprecated_flag: fr.deprecated_flag != 0,
            call_count_7d: fr.call_count_7d,
            last_seen_days: fr.last_seen_days,
            auth_scheme: &fr.auth_scheme,
        });
        let ml = ml_by_id.get(&(i as i64));
        let (ml_state, ml_conf) = match ml {
            Some(p) => (
                Classification::from_str(&p.ml_state).unwrap_or(Classification::Active),
                p.ml_confidence as f32,
            ),
            None => (rule.state, 0.0),
        };
        let risk_score = risk_by_id
            .get(&(i as i64))
            .map(|p| p.risk_score as f32)
            .unwrap_or(0.0);
        let findings = owasp::findings(OwaspInput {
            path: &path,
            auth_scheme: &fr.auth_scheme,
            auth_fail_rate_7d: fr.auth_fail_rate_7d,
            max_cvss: fr.max_cvss,
            in_registry: fr.in_registry != 0,
            deprecated_flag: fr.deprecated_flag != 0,
            call_count_7d: fr.call_count_7d,
            last_deploy_days: Some(fr.last_deploy_days as i64),
            owner_present: fr.owner_present != 0,
            p95_latency_ms: fr.p95_latency_ms,
        });
        let u = UnifiedPrediction::merge(
            nid.0,
            &rule,
            ml_state,
            ml_conf,
            risk_score,
            findings,
            None,
        );
        let _ = row;
        unified.push(u);
    }

    if let Err(e) = state.predictions.upsert_batch(&unified) {
        crate::log::err("process_batch.predictions_write", &e.to_string());
        state.metrics.err();
        return;
    }
    state.metrics.predictions(unified.len());

    let updates: Vec<crate::ws::EndpointUpdate> = unified
        .iter()
        .map(crate::ws::EndpointUpdate::from)
        .collect();
    state.ws.broadcast(crate::ws::Message::EndpointUpdates(updates)).await;

    state.metrics.batch_done(n_events, unified.len());
    let _ = started.elapsed();
}
