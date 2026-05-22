use std::time::Duration;
use axum::extract::{ws::WebSocketUpgrade, Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;
use chrono::Utc;
use graph::NodeId;
use crate::error::BackendError;
use crate::reports::ReportRow;
use crate::state::AppState;
use crate::unified::{Classification, RiskBand};
use crate::ws::Message;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .route("/api/stats/summary", get(stats_summary))
        .route("/api/endpoints", get(list_endpoints))
        .route("/api/endpoints/:id", get(get_endpoint))
        .route("/api/endpoints/:id/reports", get(list_reports))
        .route("/api/endpoints/:id/narrative", post(narrative))
        .route("/api/endpoints/:id/playbook", post(playbook))
        .route("/api/endpoints/:id/compliance", post(compliance))
        .route("/api/graph", get(graph_full))
        .route("/api/graph/blast-radius/:id", get(blast_radius))
        .route("/api/scan/start", post(scan_start))
        .route("/api/scan/:id", get(scan_get))
        .route("/api/scan/:id/events", get(scan_events))
        .route("/api/_dev/seed", post(dev_seed))
        .route("/ws", get(ws_upgrade))
}

async fn dev_seed(State(s): State<AppState>) -> Result<Json<serde_json::Value>, BackendError> {
    use chrono::Duration;
    use data::{Code, Event, Registry, Src, Tagged, Traffic};
    use uuid::Uuid;
    let now = Utc::now();
    let day_ago = now - Duration::days(1);
    let two_years_ago = now - Duration::days(720);

    let active_reg = Tagged {
        event_source: Src::SynRegistry,
        event: Event::Registry(Registry {
            timestamp: now,
            change_type: "added".into(),
            endpoint_path: "/v2/upi/collect".into(),
            method: "POST".into(),
            version: Some("v2".into()),
            service: "payments".into(),
            owner_team: Some("Payments".into()),
            auth_required: "oauth2".into(),
            deprecated_flag: false,
            sunset_date: None,
            last_modified: day_ago,
        }),
    };
    let active_code = Tagged {
        event_source: Src::SynCode,
        event: Event::Code(Code {
            timestamp: now,
            repo_name: "bank-apis".into(),
            commit_sha: "abc123def456".into(),
            endpoint_path: "/v2/upi/collect".into(),
            method: "POST".into(),
            service: "payments".into(),
            file_path: "src/payments/upi.py".into(),
            last_commit_date: day_ago,
            last_author: "alice".into(),
            runtime: "python".into(),
            runtime_version: "3.11".into(),
        }),
    };
    let active_traf = Tagged {
        event_source: Src::SynTraffic,
        event: Event::Traffic(Traffic {
            timestamp: now,
            request_id: Uuid::new_v4(),
            method: "POST".into(),
            path: "/v2/upi/collect".into(),
            status_code: 200,
            latency_ms: 87,
            client_id: "mobile".into(),
            auth_scheme: "oauth2".into(),
            upstream_service: "payments".into(),
            bytes_in: 256,
            bytes_out: 512,
        }),
    };

    let zombie_reg = Tagged {
        event_source: Src::SynRegistry,
        event: Event::Registry(Registry {
            timestamp: now,
            change_type: "added".into(),
            endpoint_path: "/internal/legacy/customer-search".into(),
            method: "POST".into(),
            version: None,
            service: "customer-service".into(),
            owner_team: None,
            auth_required: "none".into(),
            deprecated_flag: true,
            sunset_date: None,
            last_modified: two_years_ago,
        }),
    };
    let zombie_code = Tagged {
        event_source: Src::SynCode,
        event: Event::Code(Code {
            timestamp: now,
            repo_name: "legacy-banking".into(),
            commit_sha: "old1234567890abcdef".into(),
            endpoint_path: "/internal/legacy/customer-search".into(),
            method: "POST".into(),
            service: "customer-service".into(),
            file_path: "src/legacy/search.py".into(),
            last_commit_date: two_years_ago,
            last_author: "ex-employee".into(),
            runtime: "springboot".into(),
            runtime_version: "1.5".into(),
        }),
    };
    let zombie_traf = Tagged {
        event_source: Src::SynTraffic,
        event: Event::Traffic(Traffic {
            timestamp: now,
            request_id: Uuid::new_v4(),
            method: "POST".into(),
            path: "/internal/legacy/customer-search".into(),
            status_code: 200,
            latency_ms: 412,
            client_id: "internal-bot".into(),
            auth_scheme: "none".into(),
            upstream_service: "customer-service".into(),
            bytes_in: 1024,
            bytes_out: 8192,
        }),
    };

    let events = vec![
        active_reg,
        active_code,
        active_traf,
        zombie_reg,
        zombie_code,
        zombie_traf,
    ];
    crate::process_batch::run(&s, events).await;

    let active_id = NodeId::for_endpoint("payments", "POST", "/v2/upi/collect");
    let zombie_id = NodeId::for_endpoint(
        "customer-service",
        "POST",
        "/internal/legacy/customer-search",
    );
    Ok(Json(json!({
        "seeded": 6,
        "active_endpoint_id": hex::encode(active_id.0),
        "zombie_endpoint_id": hex::encode(zombie_id.0),
    })))
}

fn parse_id(id: &str) -> Result<NodeId, BackendError> {
    NodeId::from_hex(id).ok_or_else(|| BackendError::BadId(id.into()))
}

// ─── health + stats ────────────────────────────────────────────────────────

async fn health(State(s): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "status": "healthy",
        "slm_loaded": true,
        "slm_model": s.slm_runtime.model_name(),
        "slm_device": s.slm_runtime.device(),
        "model_loader_loaded": true,
        "db_ok": true,
        "metrics": s.metrics.snap(),
    }))
}

async fn stats_summary(State(s): State<AppState>) -> Result<Json<serde_json::Value>, BackendError> {
    let preds = s.predictions.list_all()?;
    let total = preds.len();
    let active = preds.iter().filter(|p| p.rule_state == Classification::Active).count();
    let deprecated = preds.iter().filter(|p| p.rule_state == Classification::Deprecated).count();
    let orphaned = preds.iter().filter(|p| p.rule_state == Classification::Orphaned).count();
    let critical = preds.iter().filter(|p| p.risk_band == RiskBand::Critical).count();
    let needs_review = preds.iter().filter(|p| p.needs_review).count();
    let in_registry = {
        let ids = s.endpoint_store.list_ids()?;
        let rows = s.endpoint_store.get_many(&ids)?;
        rows.values().filter(|r| r.in_registry).count()
    };
    Ok(Json(json!({
        "registry_baseline": in_registry,
        "total_discovered": total,
        "active": active,
        "deprecated": deprecated,
        "orphaned": orphaned,
        "critical": critical,
        "needs_review": needs_review,
        "last_scan_at": null,
    })))
}

// ─── endpoint list + detail ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub classification: Option<String>,
    pub risk_tier: Option<String>,
    pub search: Option<String>,
    pub sort: Option<String>,
    pub page: Option<usize>,
    pub page_size: Option<usize>,
    pub needs_review: Option<bool>,
}

async fn list_endpoints(
    State(s): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, BackendError> {
    let preds = s.predictions.list_all()?;
    let ids: Vec<[u8; 16]> = preds.iter().map(|p| p.endpoint_id).collect();
    let rows = s.endpoint_store.get_many(&ids)?;

    let mut items: Vec<serde_json::Value> = Vec::with_capacity(preds.len());
    for p in &preds {
        let row = rows.get(&p.endpoint_id);
        let path = row.map(|r| r.path.clone()).unwrap_or_default();
        let method = row.map(|r| r.method.clone()).unwrap_or_default();
        let service = row.map(|r| r.service.clone()).unwrap_or_default();
        let owner = row.and_then(|r| r.owner_team.clone());
        let in_registry = row.map(|r| r.in_registry).unwrap_or(false);
        items.push(json!({
            "endpoint_id": hex::encode(p.endpoint_id),
            "method": method,
            "path": path,
            "service": service,
            "owner_team": owner,
            "in_registry": in_registry,
            "rule_state": p.rule_state,
            "ml_state": p.ml_state,
            "ml_confidence": p.ml_confidence,
            "needs_review": p.needs_review,
            "risk_score": p.risk_score,
            "risk_band": p.risk_band,
            "owasp_findings": p.owasp_findings,
            "finding_count": p.finding_count,
            "rule_is_zombie": p.rule_is_zombie,
            "rule_is_shadow": p.rule_is_shadow,
            "updated_at": p.updated_at.to_rfc3339(),
        }));
    }

    if let Some(cls) = q.classification.as_deref() {
        if cls != "all" {
            items.retain(|v| v.get("rule_state").and_then(|s| s.as_str()) == Some(cls));
        }
    }
    if let Some(tier) = q.risk_tier.as_deref() {
        if tier != "all" {
            items.retain(|v| v.get("risk_band").and_then(|s| s.as_str()) == Some(tier));
        }
    }
    if let Some(true) = q.needs_review {
        items.retain(|v| v.get("needs_review").and_then(|x| x.as_bool()) == Some(true));
    }
    if let Some(needle) = q.search.as_deref() {
        let n = needle.to_lowercase();
        items.retain(|v| {
            let hay = format!(
                "{} {} {}",
                v.get("path").and_then(|s| s.as_str()).unwrap_or(""),
                v.get("service").and_then(|s| s.as_str()).unwrap_or(""),
                v.get("endpoint_id").and_then(|s| s.as_str()).unwrap_or(""),
            )
            .to_lowercase();
            hay.contains(&n)
        });
    }

    let total = items.len();
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(50).clamp(1, 500);
    let start = (page - 1) * page_size;
    let items: Vec<serde_json::Value> = items.into_iter().skip(start).take(page_size).collect();
    Ok(Json(json!({"items": items, "total": total, "page": page})))
}

async fn get_endpoint(
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, BackendError> {
    let nid = parse_id(&id)?;
    let row = s.endpoint_store.get(&nid.0)?.ok_or(BackendError::NotFound)?;
    let pred = s.predictions.get(&nid.0)?;
    let reports = s.reports.list_for_endpoint(&nid.0)?;
    let graph_features = {
        let g = s.graph.read().await;
        graph::queries::classification_features(&g, nid)
    };
    Ok(Json(json!({
        "endpoint_id": id,
        "method": row.method,
        "path": row.path,
        "service": row.service,
        "in_registry": row.in_registry,
        "owner_present": row.owner_present,
        "owner_team": row.owner_team,
        "deprecated_flag": row.deprecated_flag,
        "auth_scheme": row.auth_scheme,
        "runtime": row.runtime,
        "runtime_version": row.runtime_version,
        "schema_count": row.schema_count,
        "max_cvss": row.max_cvss,
        "cve_ids": row.cve_ids,
        "last_commit_date": row.last_commit_date.map(|t| t.to_rfc3339()),
        "registry_first_seen": row.registry_first_seen.map(|t| t.to_rfc3339()),
        "registry_last_modified": row.registry_last_modified.map(|t| t.to_rfc3339()),
        "registry_deleted_at": row.registry_deleted_at.map(|t| t.to_rfc3339()),
        "prediction": pred,
        "graph_features": graph_features,
        "reports": reports,
    })))
}

// ─── graph ─────────────────────────────────────────────────────────────────

async fn graph_full(State(s): State<AppState>) -> Result<Json<serde_json::Value>, BackendError> {
    let g = s.graph.read().await;
    let mut nodes: Vec<serde_json::Value> = Vec::new();
    let mut edges: Vec<serde_json::Value> = Vec::new();
    for id in s.endpoint_store.list_ids()? {
        let nid = NodeId(id);
        if let Some(n) = g.get_node(&nid) {
            nodes.push(json!({
                "id": hex::encode(n.id.0),
                "kind": n.kind,
                "label": n.label,
            }));
        }
    }
    let _ = &mut edges;
    Ok(Json(json!({"nodes": nodes, "edges": edges})))
}

async fn blast_radius(
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, BackendError> {
    let nid = parse_id(&id)?;
    let g = s.graph.read().await;
    let br = graph::queries::blast_radius(&g, nid, 3);
    Ok(Json(serde_json::to_value(br)?))
}

// ─── scan ──────────────────────────────────────────────────────────────────

async fn scan_start(
    State(s): State<AppState>,
) -> Result<Json<serde_json::Value>, BackendError> {
    let job = s.scans.new_job();
    let id = job.id.clone();
    let st = s.clone();
    tokio::spawn(async move {
        crate::scan_runner::run_consultation(st, id).await;
    });
    Ok(Json(json!({"scan_id": job.id})))
}

async fn scan_get(
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, BackendError> {
    let job = s.scans.get(&id).ok_or(BackendError::NotFound)?;
    Ok(Json(serde_json::to_value(job)?))
}

async fn scan_events(
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, BackendError> {
    let events = s.scans.events_for(&id);
    Ok(Json(serde_json::to_value(events)?))
}

// ─── reports ───────────────────────────────────────────────────────────────

async fn list_reports(
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, BackendError> {
    let nid = parse_id(&id)?;
    let reports = s.reports.list_for_endpoint(&nid.0)?;
    Ok(Json(serde_json::to_value(reports)?))
}

// ─── narrative / playbook / compliance ─────────────────────────────────────

#[derive(Debug, Serialize)]
struct NarrativeResponse {
    endpoint_id: String,
    report_kind: String,
    framework: String,
    output: String,
    generation_ms: i64,
    model: String,
}

async fn narrative(
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<NarrativeResponse>, BackendError> {
    generate_report(s, &id, "threat_narrative", None, 320).await
}

async fn playbook(
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<NarrativeResponse>, BackendError> {
    generate_report(s, &id, "remediation_playbook", None, 600).await
}

#[derive(Debug, Deserialize)]
pub struct ComplianceQuery {
    pub framework: Option<String>,
}

async fn compliance(
    State(s): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<ComplianceQuery>,
) -> Result<Json<NarrativeResponse>, BackendError> {
    let fw = q.framework.unwrap_or_else(|| "rbi_2024".into());
    if fw != "rbi_2024" && fw != "pci_dss" {
        return Err(BackendError::BadRequest(format!("unknown framework: {}", fw)));
    }
    generate_report(s, &id, "compliance_summary", Some(fw), 400).await
}

async fn generate_report(
    s: AppState,
    id_hex: &str,
    kind: &str,
    framework: Option<String>,
    max_new_tokens: u32,
) -> Result<Json<NarrativeResponse>, BackendError> {
    let nid = parse_id(id_hex)?;
    let row = s.endpoint_store.get(&nid.0)?.ok_or(BackendError::NotFound)?;
    let pred = s.predictions.get(&nid.0)?.ok_or(BackendError::NotFound)?;
    let graph_features = {
        let g = s.graph.read().await;
        graph::queries::classification_features(&g, nid)
    };
    let stats = {
        let g = s.graph.read().await;
        g.endpoint_stats(&nid)
    };
    let (calls_7d, p95, fail_rate) = match stats.as_ref() {
        Some(st) => {
            let total: u64 = st.status_counts.values().sum();
            let fails: u64 = st
                .status_counts
                .iter()
                .filter(|(k, _)| **k == 401 || **k == 403)
                .map(|(_, v)| *v)
                .sum();
            let rate = if total == 0 { 0.0 } else { fails as f64 / total as f64 };
            let mut v: Vec<u32> = st.latency_samples.iter().copied().collect();
            v.sort_unstable();
            let p = if v.is_empty() {
                0.0
            } else {
                let idx = (((v.len() as f64) * 0.95).ceil() as usize).saturating_sub(1).min(v.len() - 1);
                v[idx] as f64
            };
            (st.calls_observed as i64, p, rate)
        }
        None => (0, 0.0, 0.0),
    };

    let payload = json!({
        "endpoint": {
            "endpoint_id": id_hex,
            "service": row.service,
            "method": row.method,
            "path": row.path,
            "in_registry": row.in_registry,
            "owner_present": row.owner_present,
            "owner_team": row.owner_team,
            "deprecated_flag": row.deprecated_flag,
            "auth_scheme": row.auth_scheme,
            "runtime": row.runtime,
            "runtime_version": row.runtime_version,
            "last_commit_date": row.last_commit_date.map(|t| t.to_rfc3339()),
            "last_deploy_days": null,
            "last_seen_days": null,
            "schema_count": row.schema_count,
            "max_cvss": row.max_cvss,
            "cve_ids": row.cve_ids,
        },
        "classification": {
            "rule_state": pred.rule_state.as_str(),
            "rule_reason": pred.rule_reason,
            "ml_state": pred.ml_state.as_str(),
            "ml_confidence": pred.ml_confidence,
            "agreement": pred.lifecycle_agreement,
            "is_zombie": pred.rule_is_zombie,
            "is_shadow": pred.rule_is_shadow,
        },
        "risk": {
            "score": pred.risk_score,
            "band": pred.risk_band.as_str(),
            "factors": {},
        },
        "graph": {
            "in_routes_to": graph_features.in_routes_to,
            "out_owned_by": graph_features.out_owned_by,
            "out_deployed_on": graph_features.out_deployed_on,
            "blast_radius_total": 0,
            "sensitive_db_count": 0,
            "internet_reachable": false,
        },
        "traffic": {
            "calls_7d": calls_7d,
            "calls_30d": calls_7d,
            "auth_fail_rate_7d": fail_rate,
            "p95_latency_ms": p95,
            "trend_pct_30d": 0.0,
        },
        "owasp_findings": pred.owasp_findings,
        "anomaly": null,
        "framework": framework.clone().unwrap_or_default(),
    });

    let prompt_out = match kind {
        "threat_narrative" => s.python_promptmaker.build_threat_narrative(&payload).await?,
        "remediation_playbook" => s.python_promptmaker.build_remediation_playbook(&payload).await?,
        "compliance_summary" => s.python_promptmaker.build_compliance_summary(&payload).await?,
        _ => return Err(BackendError::BadRequest(format!("unknown kind: {}", kind))),
    };

    let user_context_json = prompt_out.user_context.to_string();
    let started = std::time::Instant::now();
    let timeout = Duration::from_millis(s.cfg.slm.timeout_ms);
    let result = tokio::time::timeout(
        timeout,
        s.slm_runtime
            .generate(&prompt_out.system_prompt, &user_context_json, max_new_tokens),
    )
    .await
    .map_err(|_| BackendError::SlmTimeout)??;
    let generation_ms = started.elapsed().as_millis() as i64;

    let fw_value = framework.clone().unwrap_or_default();
    let report = ReportRow {
        endpoint_id: nid.0,
        report_kind: kind.into(),
        framework: fw_value.clone(),
        system_prompt: prompt_out.system_prompt.clone(),
        user_context: user_context_json,
        model_output: result.clone(),
        model_name: s.slm_runtime.model_name().into(),
        generated_at: Utc::now().timestamp_millis(),
        generation_ms,
    };
    s.reports.upsert(&report)?;
    s.metrics.report();

    s.ws.broadcast(Message::ReportReady {
        endpoint_id: id_hex.to_string(),
        report_kind: kind.into(),
        framework: fw_value.clone(),
    })
    .await;

    Ok(Json(NarrativeResponse {
        endpoint_id: id_hex.to_string(),
        report_kind: kind.into(),
        framework: fw_value,
        output: result,
        generation_ms,
        model: s.slm_runtime.model_name().into(),
    }))
}

// ─── WebSocket ─────────────────────────────────────────────────────────────

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(s): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_ws(socket, s))
}

async fn handle_ws(mut socket: axum::extract::ws::WebSocket, state: AppState) {
    use axum::extract::ws::Message as WsMsg;
    let mut rx = state.ws.subscribe();
    loop {
        tokio::select! {
            recv = rx.recv() => {
                match recv {
                    Ok(text) => {
                        if socket.send(WsMsg::Text(text)).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(WsMsg::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }
}

// Unused 5xx fallback to make IntoResponse complete in some axum versions.
#[allow(dead_code)]
async fn _fallback() -> impl IntoResponse {
    (StatusCode::NOT_FOUND, "not found")
}
