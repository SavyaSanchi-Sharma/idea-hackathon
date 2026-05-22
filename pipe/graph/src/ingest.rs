use std::collections::HashMap;
use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use data::{Code, Event, Registry, Tagged, Traffic};
use crate::error::IngestError;
use crate::schema::{Edge, EdgeType, Node, NodeId, NodeType, Props};
use crate::store::{Direction, EndpointStats, GraphStore, LATENCY_CAP};

pub async fn apply(store: &mut GraphStore, tagged: &Tagged) -> Result<NodeId, IngestError> {
    match &tagged.event {
        Event::Traffic(t) => apply_traffic(store, t).await,
        Event::Registry(r) => apply_registry(store, r).await,
        Event::Code(c) => apply_code(store, c).await,
    }
}

async fn apply_traffic(store: &mut GraphStore, t: &Traffic) -> Result<NodeId, IngestError> {
    let ts = t.timestamp;
    let eid = NodeId::for_endpoint(&t.upstream_service, &t.method, &t.path);
    let gid = NodeId::for_gateway("default");
    let sid = NodeId::for_service(&t.upstream_service);
    let cid = NodeId::for_consumer(&t.client_id);

    update_endpoint_stats(store, eid, t.latency_ms, t.status_code);
    let snap = store.stats.get(&eid).cloned().unwrap_or_default();
    let p95 = compute_p95(&snap);
    let mut sc = serde_json::Map::new();
    for (k, v) in &snap.status_counts {
        sc.insert(k.to_string(), json!(v));
    }

    let mut ep_props: Props = HashMap::new();
    ep_props.insert("service".into(), json!(t.upstream_service));
    ep_props.insert("method".into(), json!(t.method));
    ep_props.insert("path".into(), json!(t.path));
    ep_props.insert("auth_scheme".into(), json!(t.auth_scheme));
    ep_props.insert("calls_observed".into(), json!(snap.calls_observed));
    ep_props.insert("latency_p95_ms".into(), json!(p95));
    ep_props.insert("status_code_counts".into(), Value::Object(sc));

    upsert_typed(
        store,
        eid,
        NodeType::Endpoint,
        format!("{} {}", t.method, t.path),
        ep_props,
        ts,
    )
    .await?;
    upsert_typed(
        store,
        gid,
        NodeType::Gateway,
        "default-gateway".into(),
        HashMap::new(),
        ts,
    )
    .await?;
    upsert_typed(
        store,
        sid,
        NodeType::Service,
        t.upstream_service.clone(),
        HashMap::new(),
        ts,
    )
    .await?;
    upsert_typed(
        store,
        cid,
        NodeType::Consumer,
        t.client_id.clone(),
        HashMap::new(),
        ts,
    )
    .await?;

    bump_observed_edge(store, cid, gid, EdgeType::Calls, t.status_code, ts).await?;
    bump_observed_edge(store, gid, eid, EdgeType::RoutesTo, t.status_code, ts).await?;
    bump_observed_edge(store, eid, sid, EdgeType::Uses, t.status_code, ts).await?;

    Ok(eid)
}

async fn apply_registry(store: &mut GraphStore, r: &Registry) -> Result<NodeId, IngestError> {
    let ts = r.timestamp;
    let eid = NodeId::for_endpoint(&r.service, &r.method, &r.endpoint_path);

    if r.change_type == "added" || r.change_type == "modified" {
        let mut props: Props = HashMap::new();
        if let Some(v) = &r.version {
            props.insert("version".into(), json!(v));
        }
        props.insert("service".into(), json!(r.service));
        props.insert("auth_required".into(), json!(r.auth_required));
        props.insert("deprecated_flag".into(), json!(r.deprecated_flag));
        if let Some(s) = &r.sunset_date {
            props.insert("sunset_date".into(), json!(s.to_rfc3339()));
        }
        props.insert("in_registry".into(), json!(true));
        props.insert(
            "registry_last_modified".into(),
            json!(r.last_modified.to_rfc3339()),
        );
        if r.change_type == "added" {
            let absent = match store.get_node(&eid) {
                Some(cur) => !cur.props.contains_key("registry_first_seen"),
                None => true,
            };
            if absent {
                props.insert(
                    "registry_first_seen".into(),
                    json!(r.timestamp.to_rfc3339()),
                );
            }
        }
        let label = format!("{} {}", r.method, r.endpoint_path);
        upsert_typed(store, eid, NodeType::Endpoint, label, props, ts).await?;

        if let Some(team_name) = &r.owner_team {
            let tid = NodeId::for_team(team_name);
            upsert_typed(
                store,
                tid,
                NodeType::Team,
                team_name.clone(),
                HashMap::new(),
                ts,
            )
            .await?;

            let key = (eid, tid, EdgeType::OwnedBy);
            let mut e_props: Props = HashMap::new();
            if !store.edges.contains_key(&key) {
                e_props.insert("owned_since".into(), json!(r.last_modified.to_rfc3339()));
            }
            let edge = Edge {
                src: eid,
                dst: tid,
                kind: EdgeType::OwnedBy,
                props: e_props,
                first_seen: ts,
                last_seen: ts,
            };
            store.upsert_edge(edge).await.map_err(IngestError::from)?;
        }
    } else if r.change_type == "deleted" {
        let mut props: Props = HashMap::new();
        props.insert("in_registry".into(), json!(false));
        props.insert(
            "registry_deleted_at".into(),
            json!(r.timestamp.to_rfc3339()),
        );
        let label = match store.get_node(&eid) {
            Some(cur) => cur.label.clone(),
            None => format!("{} {}", r.method, r.endpoint_path),
        };
        upsert_typed(store, eid, NodeType::Endpoint, label, props, ts).await?;

        let teams: Vec<NodeId> = store.neighbors(&eid, Direction::Out, Some(EdgeType::OwnedBy));
        for t in teams {
            store
                .remove_edge(&eid, &t, EdgeType::OwnedBy)
                .await
                .map_err(IngestError::from)?;
        }
    }

    Ok(eid)
}

async fn apply_code(store: &mut GraphStore, c: &Code) -> Result<NodeId, IngestError> {
    let ts = c.timestamp;
    let eid = NodeId::for_endpoint(&c.service, &c.method, &c.endpoint_path);
    let did = NodeId::for_deployment(&c.repo_name, &c.commit_sha);

    let mut ep_props: Props = HashMap::new();
    ep_props.insert("service".into(), json!(c.service));
    ep_props.insert("method".into(), json!(c.method));
    ep_props.insert("path".into(), json!(c.endpoint_path));
    ep_props.insert("file_path".into(), json!(c.file_path));
    ep_props.insert(
        "last_commit_date".into(),
        json!(c.last_commit_date.to_rfc3339()),
    );
    ep_props.insert("last_author".into(), json!(c.last_author));
    ep_props.insert("runtime".into(), json!(c.runtime));
    ep_props.insert("runtime_version".into(), json!(c.runtime_version));
    ep_props.insert("discovered_in_code".into(), json!(true));
    upsert_typed(
        store,
        eid,
        NodeType::Endpoint,
        format!("{} {}", c.method, c.endpoint_path),
        ep_props,
        ts,
    )
    .await?;

    let short = if c.commit_sha.len() >= 8 {
        &c.commit_sha[..8]
    } else {
        &c.commit_sha
    };
    let mut dep_props: Props = HashMap::new();
    dep_props.insert("repo_name".into(), json!(c.repo_name));
    dep_props.insert("commit_sha".into(), json!(c.commit_sha));
    upsert_typed(
        store,
        did,
        NodeType::Deployment,
        format!("{}@{}", c.repo_name, short),
        dep_props,
        ts,
    )
    .await?;

    let edge = Edge {
        src: eid,
        dst: did,
        kind: EdgeType::DeployedOn,
        props: HashMap::new(),
        first_seen: ts,
        last_seen: ts,
    };
    store.upsert_edge(edge).await.map_err(IngestError::from)?;

    Ok(eid)
}

async fn upsert_typed(
    store: &mut GraphStore,
    id: NodeId,
    kind: NodeType,
    label: String,
    props: Props,
    ts: DateTime<Utc>,
) -> Result<(), IngestError> {
    let node = Node {
        id,
        kind,
        label,
        props,
        first_seen: ts,
        last_seen: ts,
    };
    store.upsert_node(node).await.map_err(IngestError::from)?;
    Ok(())
}

async fn bump_observed_edge(
    store: &mut GraphStore,
    src: NodeId,
    dst: NodeId,
    kind: EdgeType,
    status: u16,
    ts: DateTime<Utc>,
) -> Result<(), IngestError> {
    let cur = store
        .edges
        .get(&(src, dst, kind))
        .and_then(|e| e.props.get("observation_count"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let mut p: Props = HashMap::new();
    p.insert("observation_count".into(), json!(cur + 1));
    p.insert("last_status".into(), json!(status));
    let edge = Edge {
        src,
        dst,
        kind,
        props: p,
        first_seen: ts,
        last_seen: ts,
    };
    store.upsert_edge(edge).await.map_err(IngestError::from)
}

fn update_endpoint_stats(store: &mut GraphStore, eid: NodeId, latency_ms: u32, status: u16) {
    let s = store.stats.entry(eid).or_insert_with(EndpointStats::default);
    s.latency_samples.push_back(latency_ms);
    if s.latency_samples.len() > LATENCY_CAP {
        s.latency_samples.pop_front();
    }
    *s.status_counts.entry(status).or_insert(0) += 1;
    s.calls_observed += 1;
}

fn compute_p95(s: &EndpointStats) -> u32 {
    if s.latency_samples.is_empty() {
        return 0;
    }
    let mut v: Vec<u32> = s.latency_samples.iter().copied().collect();
    v.sort_unstable();
    let n = v.len();
    let idx = ((n as f64) * 0.95).ceil() as usize;
    let idx = idx.saturating_sub(1).min(n - 1);
    v[idx]
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use data::Src;

    fn traf(svc: &str, method: &str, path: &str, client: &str, status: u16, lat: u32) -> Tagged {
        Tagged {
            event_source: Src::SynTraffic,
            event: Event::Traffic(Traffic {
                timestamp: Utc::now(),
                request_id: uuid::Uuid::nil(),
                method: method.into(),
                path: path.into(),
                status_code: status,
                latency_ms: lat,
                client_id: client.into(),
                auth_scheme: "oauth2".into(),
                upstream_service: svc.into(),
                bytes_in: 100,
                bytes_out: 200,
            }),
        }
    }

    fn reg(
        svc: &str,
        method: &str,
        path: &str,
        owner: Option<&str>,
        change: &str,
    ) -> Tagged {
        let now = Utc::now();
        Tagged {
            event_source: Src::SynRegistry,
            event: Event::Registry(Registry {
                timestamp: now,
                change_type: change.into(),
                endpoint_path: path.into(),
                method: method.into(),
                version: Some("v1".into()),
                service: svc.into(),
                owner_team: owner.map(String::from),
                auth_required: "bearer".into(),
                deprecated_flag: false,
                sunset_date: None,
                last_modified: now,
            }),
        }
    }

    fn code_ev(svc: &str, method: &str, path: &str, repo: &str, commit: &str) -> Tagged {
        let now = Utc::now();
        Tagged {
            event_source: Src::SynCode,
            event: Event::Code(Code {
                timestamp: now,
                repo_name: repo.into(),
                commit_sha: commit.into(),
                endpoint_path: path.into(),
                method: method.into(),
                service: svc.into(),
                file_path: "src/app.py".into(),
                last_commit_date: now,
                last_author: "alice".into(),
                runtime: "python".into(),
                runtime_version: "3.11".into(),
            }),
        }
    }

    #[tokio::test]
    async fn traffic_creates_four_nodes_three_edges() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        apply(&mut s, &traf("payments", "POST", "/v1/charges", "mobile", 200, 50))
            .await
            .unwrap();

        let eid = NodeId::for_endpoint("payments", "POST", "/v1/charges");
        let gid = NodeId::for_gateway("default");
        let sid = NodeId::for_service("payments");
        let cid = NodeId::for_consumer("mobile");

        assert!(s.get_node(&eid).is_some());
        assert!(s.get_node(&gid).is_some());
        assert!(s.get_node(&sid).is_some());
        assert!(s.get_node(&cid).is_some());

        assert_eq!(
            s.neighbors(&cid, Direction::Out, Some(EdgeType::Calls)),
            vec![gid]
        );
        assert_eq!(
            s.neighbors(&gid, Direction::Out, Some(EdgeType::RoutesTo)),
            vec![eid]
        );
        assert_eq!(
            s.neighbors(&eid, Direction::Out, Some(EdgeType::Uses)),
            vec![sid]
        );

        let ep = s.get_node(&eid).unwrap();
        assert_eq!(ep.props.get("calls_observed"), Some(&json!(1)));
        assert_eq!(ep.props.get("latency_p95_ms"), Some(&json!(50)));
    }

    #[tokio::test]
    async fn repeated_traffic_increments_observation_count() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        for _ in 0..5 {
            apply(&mut s, &traf("payments", "GET", "/x", "mobile", 200, 10))
                .await
                .unwrap();
        }
        let eid = NodeId::for_endpoint("payments", "GET", "/x");
        let sid = NodeId::for_service("payments");
        let edge = s.edges.get(&(eid, sid, EdgeType::Uses)).unwrap();
        assert_eq!(edge.props.get("observation_count"), Some(&json!(5)));
        let ep = s.get_node(&eid).unwrap();
        assert_eq!(ep.props.get("calls_observed"), Some(&json!(5)));
    }

    #[tokio::test]
    async fn registry_added_creates_endpoint_team_owned_by() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        apply(
            &mut s,
            &reg("kyc", "GET", "/v1/lookup", Some("Customer"), "added"),
        )
        .await
        .unwrap();

        let eid = NodeId::for_endpoint("kyc", "GET", "/v1/lookup");
        let tid = NodeId::for_team("Customer");
        assert!(s.get_node(&eid).is_some());
        assert!(s.get_node(&tid).is_some());
        assert_eq!(
            s.neighbors(&eid, Direction::Out, Some(EdgeType::OwnedBy)),
            vec![tid]
        );
        let ep = s.get_node(&eid).unwrap();
        assert_eq!(ep.props.get("in_registry"), Some(&json!(true)));
        assert!(ep.props.contains_key("registry_first_seen"));
        let edge = s.edges.get(&(eid, tid, EdgeType::OwnedBy)).unwrap();
        assert!(edge.props.contains_key("owned_since"));
    }

    #[tokio::test]
    async fn registry_deleted_marks_endpoint_and_removes_owned_by() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        apply(
            &mut s,
            &reg("kyc", "GET", "/v1/lookup", Some("Customer"), "added"),
        )
        .await
        .unwrap();
        apply(&mut s, &reg("kyc", "GET", "/v1/lookup", None, "deleted"))
            .await
            .unwrap();
        let eid = NodeId::for_endpoint("kyc", "GET", "/v1/lookup");
        let tid = NodeId::for_team("Customer");
        assert!(s.get_node(&eid).is_some(), "endpoint must remain");
        assert!(s.get_node(&tid).is_some(), "team must remain");
        assert!(s.neighbors(&eid, Direction::Out, Some(EdgeType::OwnedBy)).is_empty());
        let ep = s.get_node(&eid).unwrap();
        assert_eq!(ep.props.get("in_registry"), Some(&json!(false)));
        assert!(ep.props.contains_key("registry_deleted_at"));
    }

    #[tokio::test]
    async fn code_event_creates_deployment_and_deployed_on() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        apply(
            &mut s,
            &code_ev("payments", "GET", "/v1/charges", "bank-apis", "abcdef0123456789"),
        )
        .await
        .unwrap();
        let eid = NodeId::for_endpoint("payments", "GET", "/v1/charges");
        let did = NodeId::for_deployment("bank-apis", "abcdef0123456789");
        assert!(s.get_node(&eid).is_some());
        assert!(s.get_node(&did).is_some());
        assert_eq!(
            s.neighbors(&eid, Direction::Out, Some(EdgeType::DeployedOn)),
            vec![did]
        );
        let dep = s.get_node(&did).unwrap();
        assert_eq!(dep.label, "bank-apis@abcdef01");
        let ep = s.get_node(&eid).unwrap();
        assert_eq!(ep.props.get("runtime"), Some(&json!("python")));
        assert_eq!(ep.props.get("discovered_in_code"), Some(&json!(true)));
    }
}
