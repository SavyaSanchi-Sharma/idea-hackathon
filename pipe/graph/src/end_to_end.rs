#![cfg(test)]

use chrono::{Duration, Utc};
use data::{Code, Event, Registry, Src, Tagged, Traffic};
use crate::ingest;
use crate::queries;
use crate::store::GraphStore;
use crate::schema::NodeId;

fn traf(svc: &str, method: &str, path: &str, client: &str, status: u16, lat: u32, ts: chrono::DateTime<Utc>) -> Tagged {
    Tagged {
        event_source: Src::SynTraffic,
        event: Event::Traffic(Traffic {
            timestamp: ts,
            request_id: uuid::Uuid::new_v4(),
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

fn reg(svc: &str, method: &str, path: &str, owner: Option<&str>, change: &str, ts: chrono::DateTime<Utc>) -> Tagged {
    Tagged {
        event_source: Src::SynRegistry,
        event: Event::Registry(Registry {
            timestamp: ts,
            change_type: change.into(),
            endpoint_path: path.into(),
            method: method.into(),
            version: Some("v1".into()),
            service: svc.into(),
            owner_team: owner.map(String::from),
            auth_required: "bearer".into(),
            deprecated_flag: false,
            sunset_date: None,
            last_modified: ts,
        }),
    }
}

fn code_ev(svc: &str, method: &str, path: &str, repo: &str, commit: &str, ts: chrono::DateTime<Utc>) -> Tagged {
    Tagged {
        event_source: Src::SynCode,
        event: Event::Code(Code {
            timestamp: ts,
            repo_name: repo.into(),
            commit_sha: commit.into(),
            endpoint_path: path.into(),
            method: method.into(),
            service: svc.into(),
            file_path: format!("src/{}.py", path.replace('/', "_")),
            last_commit_date: ts,
            last_author: "alice".into(),
            runtime: "python".into(),
            runtime_version: "3.11".into(),
        }),
    }
}

#[tokio::test]
async fn end_to_end_50_events() {
    let mut store = GraphStore::rehydrate(":memory:").await.unwrap();
    let t0 = Utc::now();
    let mut events: Vec<Tagged> = Vec::with_capacity(50);

    for i in 0..25 {
        let (svc, path) = match i % 2 {
            0 => ("payments", "/v1/charges"),
            _ => ("kyc", "/v1/lookup"),
        };
        events.push(traf(svc, "GET", path, "mobile", 200, 30 + i as u32, t0 + Duration::seconds(i)));
    }

    for i in 0..15 {
        let (svc, method, path, owner) = if i % 2 == 0 {
            ("payments", "GET", "/v1/charges", Some("Payments"))
        } else {
            ("kyc", "GET", "/v1/lookup", Some("Customer"))
        };
        events.push(reg(svc, method, path, owner, "added", t0 + Duration::seconds(25 + i)));
    }

    for i in 0..10 {
        let (svc, path) = if i % 2 == 0 {
            ("payments", "/v1/charges")
        } else {
            ("kyc", "/v1/lookup")
        };
        events.push(code_ev(svc, "GET", path, "bank-apis", &format!("abcd{:04}", i), t0 + Duration::seconds(40 + i)));
    }

    assert_eq!(events.len(), 50);

    for ev in &events {
        ingest::apply(&mut store, ev).await.unwrap();
    }

    let payments_ep = NodeId::for_endpoint("payments", "GET", "/v1/charges");
    let kyc_ep = NodeId::for_endpoint("kyc", "GET", "/v1/lookup");
    let payments_svc = NodeId::for_service("payments");
    let kyc_svc = NodeId::for_service("kyc");

    assert!(store.get_node(&payments_ep).is_some());
    assert!(store.get_node(&kyc_ep).is_some());

    let hidden_from_events = queries::hidden_dependencies(&store);
    assert!(
        !hidden_from_events.iter().any(|h| h.endpoint_id == payments_ep),
        "payments was routed via gateway; cannot be hidden"
    );
    assert!(
        !hidden_from_events.iter().any(|h| h.endpoint_id == kyc_ep),
        "kyc was routed via gateway; cannot be hidden"
    );

    let shadow_ep = NodeId::for_endpoint("internal", "POST", "/legacy/admin");
    let shadow_svc = NodeId::for_service("legacy");
    use crate::schema::{Edge, EdgeType, Node, NodeType};
    use std::collections::HashMap;
    let shadow_node = Node {
        id: shadow_ep,
        kind: NodeType::Endpoint,
        label: "POST /legacy/admin".into(),
        props: HashMap::new(),
        first_seen: t0,
        last_seen: t0,
    };
    let shadow_svc_node = Node {
        id: shadow_svc,
        kind: NodeType::Service,
        label: "legacy".into(),
        props: HashMap::new(),
        first_seen: t0,
        last_seen: t0,
    };
    store.upsert_node(shadow_node).await.unwrap();
    store.upsert_node(shadow_svc_node).await.unwrap();
    store
        .upsert_edge(Edge {
            src: shadow_ep,
            dst: shadow_svc,
            kind: EdgeType::Uses,
            props: HashMap::new(),
            first_seen: t0,
            last_seen: t0,
        })
        .await
        .unwrap();

    let hidden = queries::hidden_dependencies(&store);
    assert!(hidden.iter().any(|h| h.endpoint_id == shadow_ep));
    let sh = hidden.iter().find(|h| h.endpoint_id == shadow_ep).unwrap();
    assert_eq!(sh.out_uses, 1);
    assert_eq!(sh.in_routes_to, 0);
    assert!(!sh.has_owner);
    assert!(!sh.has_deployment);

    let br = queries::blast_radius(&store, payments_ep, 3);
    assert_eq!(br.origin, payments_ep);
    assert!(br.reachable.contains_key(&NodeType::Service));
    let svcs = br.reachable.get(&NodeType::Service).unwrap();
    assert!(svcs.contains(&payments_svc));
    assert_eq!(br.service_count, 1);
    assert_eq!(br.sensitive_db_count, 0);
    assert!(br.max_depth_reached >= 1);

    let br_kyc = queries::blast_radius(&store, kyc_ep, 3);
    let kyc_svcs = br_kyc.reachable.get(&NodeType::Service).unwrap();
    assert!(kyc_svcs.contains(&kyc_svc));

    let cf = queries::classification_features(&store, payments_ep);
    assert!(cf.has_gateway);
    assert!(cf.has_owner);
    assert!(cf.has_deployment);
    assert_eq!(cf.in_registry, Some(true));
    assert_eq!(cf.runtime.as_deref(), Some("python"));
    assert_eq!(cf.auth_scheme.as_deref(), Some("oauth2"));

    let cf_shadow = queries::classification_features(&store, shadow_ep);
    assert!(!cf_shadow.has_gateway);
    assert!(!cf_shadow.has_owner);
    assert!(!cf_shadow.has_deployment);

    let snap = store.health();
    assert!(snap.nodes_added >= 7);
    assert!(snap.edges_added >= 3);
    assert!(snap.mutations_total > 0);
    assert_eq!(snap.errors_total, 0);
}
