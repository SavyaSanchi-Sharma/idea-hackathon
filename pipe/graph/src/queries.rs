use std::collections::{HashMap, HashSet, VecDeque};
use chrono::Utc;
use serde::Serialize;
use crate::schema::{EdgeType, NodeId, NodeType};
use crate::store::{Direction, GraphStore};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ClassificationFeatures {
    pub in_calls: usize,
    pub in_routes_to: usize,
    pub in_owned_by: usize,
    pub in_has_findings: usize,
    pub out_uses: usize,
    pub out_queries: usize,
    pub out_owned_by: usize,
    pub out_deployed_on: usize,
    pub out_has_findings: usize,
    pub has_owner: bool,
    pub has_gateway: bool,
    pub has_deployment: bool,
    pub has_findings: bool,
    pub days_since_last_seen: Option<i64>,
    pub days_since_last_commit: Option<i64>,
    pub days_since_last_deploy: Option<i64>,
    pub in_registry: Option<bool>,
    pub deprecated_flag: Option<bool>,
    pub auth_scheme: Option<String>,
    pub runtime: Option<String>,
    pub runtime_version: Option<String>,
}

pub fn classification_features(store: &GraphStore, id: NodeId) -> ClassificationFeatures {
    let in_calls = store.neighbors(&id, Direction::In, Some(EdgeType::Calls)).len();
    let in_routes_to = store
        .neighbors(&id, Direction::In, Some(EdgeType::RoutesTo))
        .len();
    let in_owned_by = store
        .neighbors(&id, Direction::In, Some(EdgeType::OwnedBy))
        .len();
    let in_has_findings = store
        .neighbors(&id, Direction::In, Some(EdgeType::HasFindings))
        .len();
    let out_uses = store.neighbors(&id, Direction::Out, Some(EdgeType::Uses)).len();
    let out_queries = store
        .neighbors(&id, Direction::Out, Some(EdgeType::Queries))
        .len();
    let out_owned_by = store
        .neighbors(&id, Direction::Out, Some(EdgeType::OwnedBy))
        .len();
    let out_deployed_on = store
        .neighbors(&id, Direction::Out, Some(EdgeType::DeployedOn))
        .len();
    let out_has_findings = store
        .neighbors(&id, Direction::Out, Some(EdgeType::HasFindings))
        .len();

    let now = Utc::now();
    let node = store.get_node(&id);
    let days_since_last_seen = node.map(|n| (now - n.last_seen).num_days());

    let days_since_last_commit = node
        .and_then(|n| n.props.get("last_commit_date"))
        .and_then(|v| v.as_str())
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|d| (now - d.with_timezone(&Utc)).num_days());

    let days_since_last_deploy = {
        let mut min: Option<i64> = None;
        for d in store.neighbors(&id, Direction::Out, Some(EdgeType::DeployedOn)) {
            if let Some(dn) = store.get_node(&d) {
                let days = (now - dn.last_seen).num_days();
                min = Some(min.map_or(days, |m| m.min(days)));
            }
        }
        min
    };

    let in_registry = node
        .and_then(|n| n.props.get("in_registry"))
        .and_then(|v| v.as_bool());
    let deprecated_flag = node
        .and_then(|n| n.props.get("deprecated_flag"))
        .and_then(|v| v.as_bool());
    let auth_scheme = node
        .and_then(|n| n.props.get("auth_scheme"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let runtime = node
        .and_then(|n| n.props.get("runtime"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let runtime_version = node
        .and_then(|n| n.props.get("runtime_version"))
        .and_then(|v| v.as_str())
        .map(String::from);

    ClassificationFeatures {
        in_calls,
        in_routes_to,
        in_owned_by,
        in_has_findings,
        out_uses,
        out_queries,
        out_owned_by,
        out_deployed_on,
        out_has_findings,
        has_owner: out_owned_by > 0,
        has_gateway: in_routes_to > 0,
        has_deployment: out_deployed_on > 0,
        has_findings: out_has_findings > 0,
        days_since_last_seen,
        days_since_last_commit,
        days_since_last_deploy,
        in_registry,
        deprecated_flag,
        auth_scheme,
        runtime,
        runtime_version,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BlastRadius {
    pub origin: NodeId,
    pub reachable: HashMap<NodeType, Vec<NodeId>>,
    pub total_reachable: usize,
    pub sensitive_db_count: usize,
    pub service_count: usize,
    pub max_depth_reached: usize,
    pub max_depth_requested: usize,
}

const BLAST_EDGES: &[EdgeType] = &[EdgeType::Uses, EdgeType::Queries];

pub fn blast_radius(store: &GraphStore, id: NodeId, max_depth: usize) -> BlastRadius {
    let mut reachable: HashMap<NodeType, Vec<NodeId>> = HashMap::new();
    let mut visited: HashSet<NodeId> = HashSet::new();
    let mut max_depth_reached = 0;
    let mut q: VecDeque<(NodeId, usize)> = VecDeque::new();
    visited.insert(id);
    q.push_back((id, 0));
    while let Some((cur, depth)) = q.pop_front() {
        if depth >= max_depth {
            continue;
        }
        for et in BLAST_EDGES {
            for n in store.neighbors(&cur, Direction::Out, Some(*et)) {
                if visited.insert(n) {
                    if let Some(node) = store.get_node(&n) {
                        reachable.entry(node.kind).or_default().push(n);
                    }
                    max_depth_reached = max_depth_reached.max(depth + 1);
                    q.push_back((n, depth + 1));
                }
            }
        }
    }

    let mut total_reachable = 0;
    let mut sensitive_db_count = 0;
    let mut service_count = 0;
    for (k, v) in &reachable {
        total_reachable += v.len();
        match k {
            NodeType::Database => {
                for nid in v {
                    if let Some(n) = store.get_node(nid) {
                        if n.props
                            .get("holds_pii")
                            .and_then(|x| x.as_bool())
                            .unwrap_or(false)
                        {
                            sensitive_db_count += 1;
                        }
                    }
                }
            }
            NodeType::Service => service_count += v.len(),
            _ => {}
        }
    }

    BlastRadius {
        origin: id,
        reachable,
        total_reachable,
        sensitive_db_count,
        service_count,
        max_depth_reached,
        max_depth_requested: max_depth,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ExposurePath {
    pub origin: NodeId,
    pub external_consumers: Vec<NodeId>,
    pub via_gateways: Vec<NodeId>,
    pub internet_reachable: bool,
    pub shortest_hops_from_consumer: Option<usize>,
}

const EXPOSURE_EDGES: &[EdgeType] = &[EdgeType::Calls, EdgeType::RoutesTo];

pub fn exposure_paths(store: &GraphStore, id: NodeId) -> ExposurePath {
    let mut consumers: Vec<NodeId> = Vec::new();
    let mut gateways: Vec<NodeId> = Vec::new();
    let mut visited: HashSet<NodeId> = HashSet::new();
    let mut hop_of: HashMap<NodeId, usize> = HashMap::new();
    let mut q: VecDeque<(NodeId, usize)> = VecDeque::new();
    visited.insert(id);
    hop_of.insert(id, 0);
    q.push_back((id, 0));
    while let Some((cur, depth)) = q.pop_front() {
        for et in EXPOSURE_EDGES {
            for n in store.neighbors(&cur, Direction::In, Some(*et)) {
                if visited.insert(n) {
                    hop_of.insert(n, depth + 1);
                    if let Some(node) = store.get_node(&n) {
                        match node.kind {
                            NodeType::Consumer => consumers.push(n),
                            NodeType::Gateway => gateways.push(n),
                            _ => {}
                        }
                    }
                    q.push_back((n, depth + 1));
                }
            }
        }
    }
    let shortest = consumers
        .iter()
        .filter_map(|c| hop_of.get(c).copied())
        .min();
    ExposurePath {
        origin: id,
        internet_reachable: !consumers.is_empty(),
        shortest_hops_from_consumer: shortest,
        external_consumers: consumers,
        via_gateways: gateways,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HiddenDependency {
    pub endpoint_id: NodeId,
    pub out_uses: usize,
    pub out_queries: usize,
    pub in_routes_to: usize,
    pub has_owner: bool,
    pub has_deployment: bool,
}

pub fn hidden_dependencies(store: &GraphStore) -> Vec<HiddenDependency> {
    let mut out = Vec::new();
    for (id, node) in &store.nodes {
        if node.kind != NodeType::Endpoint {
            continue;
        }
        let uses = store.neighbors(id, Direction::Out, Some(EdgeType::Uses)).len();
        let routes_in = store
            .neighbors(id, Direction::In, Some(EdgeType::RoutesTo))
            .len();
        if uses > 0 && routes_in == 0 {
            let queries = store.neighbors(id, Direction::Out, Some(EdgeType::Queries)).len();
            let owned = store
                .neighbors(id, Direction::Out, Some(EdgeType::OwnedBy))
                .len();
            let deployed = store
                .neighbors(id, Direction::Out, Some(EdgeType::DeployedOn))
                .len();
            out.push(HiddenDependency {
                endpoint_id: *id,
                out_uses: uses,
                out_queries: queries,
                in_routes_to: routes_in,
                has_owner: owned > 0,
                has_deployment: deployed > 0,
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::{Edge, Node, NodeId, NodeType};
    use chrono::Utc;
    use serde_json::json;
    use std::collections::HashMap;

    fn n(id: NodeId, k: NodeType, label: &str) -> Node {
        Node {
            id,
            kind: k,
            label: label.into(),
            props: HashMap::new(),
            first_seen: Utc::now(),
            last_seen: Utc::now(),
        }
    }

    fn n_with(id: NodeId, k: NodeType, label: &str, kvs: &[(&str, serde_json::Value)]) -> Node {
        let mut p = HashMap::new();
        for (a, b) in kvs {
            p.insert((*a).to_string(), b.clone());
        }
        Node {
            id,
            kind: k,
            label: label.into(),
            props: p,
            first_seen: Utc::now(),
            last_seen: Utc::now(),
        }
    }

    fn e(src: NodeId, dst: NodeId, k: EdgeType) -> Edge {
        Edge {
            src,
            dst,
            kind: k,
            props: HashMap::new(),
            first_seen: Utc::now(),
            last_seen: Utc::now(),
        }
    }

    async fn build_zombie_graph() -> GraphStore {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();

        let mobile = NodeId::for_consumer("mobile");
        let gw = NodeId::for_gateway("default");

        let live_ep = NodeId::for_endpoint("payments", "POST", "/v1/charge");
        let live_svc = NodeId::for_service("payments");
        let live_team = NodeId::for_team("Payments");

        let zombie_ep = NodeId::for_endpoint("legacy", "POST", "/internal/dump");
        let zombie_svc = NodeId::for_service("legacy");

        let pii_db = NodeId::for_database("customer-db");

        s.upsert_node(n(mobile, NodeType::Consumer, "mobile"))
            .await
            .unwrap();
        s.upsert_node(n(gw, NodeType::Gateway, "default"))
            .await
            .unwrap();
        s.upsert_node(n(live_ep, NodeType::Endpoint, "POST /v1/charge"))
            .await
            .unwrap();
        s.upsert_node(n(live_svc, NodeType::Service, "payments"))
            .await
            .unwrap();
        s.upsert_node(n(live_team, NodeType::Team, "Payments"))
            .await
            .unwrap();
        s.upsert_node(n(zombie_ep, NodeType::Endpoint, "POST /internal/dump"))
            .await
            .unwrap();
        s.upsert_node(n(zombie_svc, NodeType::Service, "legacy"))
            .await
            .unwrap();
        s.upsert_node(n_with(
            pii_db,
            NodeType::Database,
            "customer-db",
            &[("holds_pii", json!(true))],
        ))
        .await
        .unwrap();

        s.upsert_edge(e(mobile, gw, EdgeType::Calls)).await.unwrap();
        s.upsert_edge(e(gw, live_ep, EdgeType::RoutesTo))
            .await
            .unwrap();
        s.upsert_edge(e(live_ep, live_svc, EdgeType::Uses))
            .await
            .unwrap();
        s.upsert_edge(e(live_ep, live_team, EdgeType::OwnedBy))
            .await
            .unwrap();
        s.upsert_edge(e(live_svc, pii_db, EdgeType::Queries))
            .await
            .unwrap();
        s.upsert_edge(e(zombie_ep, zombie_svc, EdgeType::Uses))
            .await
            .unwrap();
        s.upsert_edge(e(zombie_svc, pii_db, EdgeType::Queries))
            .await
            .unwrap();

        s
    }

    #[tokio::test]
    async fn classification_features_for_live_endpoint() {
        let s = build_zombie_graph().await;
        let live_ep = NodeId::for_endpoint("payments", "POST", "/v1/charge");
        let cf = classification_features(&s, live_ep);
        assert_eq!(cf.in_routes_to, 1);
        assert!(cf.has_gateway);
        assert_eq!(cf.out_uses, 1);
        assert!(cf.has_owner);
        assert!(!cf.has_findings);
    }

    #[tokio::test]
    async fn classification_features_for_zombie() {
        let s = build_zombie_graph().await;
        let zombie = NodeId::for_endpoint("legacy", "POST", "/internal/dump");
        let cf = classification_features(&s, zombie);
        assert_eq!(cf.in_routes_to, 0);
        assert!(!cf.has_gateway);
        assert_eq!(cf.out_uses, 1);
        assert!(!cf.has_owner);
        assert!(!cf.has_deployment);
    }

    #[tokio::test]
    async fn blast_radius_picks_up_pii_db_through_service() {
        let s = build_zombie_graph().await;
        let live_ep = NodeId::for_endpoint("payments", "POST", "/v1/charge");
        let br = blast_radius(&s, live_ep, 3);
        assert_eq!(br.origin, live_ep);
        assert_eq!(br.service_count, 1);
        assert_eq!(br.sensitive_db_count, 1);
        assert!(br.total_reachable >= 2);
        assert!(br.max_depth_reached <= 3);
    }

    #[tokio::test]
    async fn blast_radius_respects_depth_cap() {
        let s = build_zombie_graph().await;
        let live_ep = NodeId::for_endpoint("payments", "POST", "/v1/charge");
        let br = blast_radius(&s, live_ep, 1);
        assert_eq!(br.service_count, 1);
        assert_eq!(br.sensitive_db_count, 0);
        assert_eq!(br.max_depth_reached, 1);
    }

    #[tokio::test]
    async fn exposure_paths_finds_consumer_through_gateway() {
        let s = build_zombie_graph().await;
        let live_ep = NodeId::for_endpoint("payments", "POST", "/v1/charge");
        let ex = exposure_paths(&s, live_ep);
        assert!(ex.internet_reachable);
        assert_eq!(ex.shortest_hops_from_consumer, Some(2));
        assert_eq!(ex.external_consumers.len(), 1);
        assert_eq!(ex.via_gateways.len(), 1);
    }

    #[tokio::test]
    async fn exposure_paths_zombie_not_internet_reachable() {
        let s = build_zombie_graph().await;
        let zombie = NodeId::for_endpoint("legacy", "POST", "/internal/dump");
        let ex = exposure_paths(&s, zombie);
        assert!(!ex.internet_reachable);
        assert!(ex.external_consumers.is_empty());
        assert_eq!(ex.shortest_hops_from_consumer, None);
    }

    #[tokio::test]
    async fn hidden_dependencies_surfaces_zombie() {
        let s = build_zombie_graph().await;
        let h = hidden_dependencies(&s);
        let zombie = NodeId::for_endpoint("legacy", "POST", "/internal/dump");
        let live = NodeId::for_endpoint("payments", "POST", "/v1/charge");
        assert!(h.iter().any(|d| d.endpoint_id == zombie));
        assert!(h.iter().all(|d| d.endpoint_id != live));
        let z = h.iter().find(|d| d.endpoint_id == zombie).unwrap();
        assert_eq!(z.out_uses, 1);
        assert_eq!(z.in_routes_to, 0);
        assert!(!z.has_owner);
        assert!(!z.has_deployment);
    }
}
