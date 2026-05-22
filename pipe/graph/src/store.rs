use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use petgraph::Direction as PgDir;
use petgraph::graph::{DiGraph, NodeIndex};
use petgraph::visit::EdgeRef;
use sqlx::SqlitePool;
use crate::error::GraphError;
use crate::metrics::{Metrics, Snap};
use crate::persist;
use crate::schema::{Edge, EdgeType, Node, NodeId};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    In,
    Out,
    Both,
}

pub const LATENCY_CAP: usize = 200;

#[derive(Default, Debug, Clone)]
pub struct EndpointStats {
    pub latency_samples: VecDeque<u32>,
    pub status_counts: HashMap<u16, u64>,
    pub calls_observed: u64,
}

pub struct GraphStore {
    g: DiGraph<NodeId, EdgeType>,
    idx: HashMap<NodeId, NodeIndex>,
    pub(crate) nodes: HashMap<NodeId, Node>,
    pub(crate) edges: HashMap<(NodeId, NodeId, EdgeType), Edge>,
    pub(crate) stats: HashMap<NodeId, EndpointStats>,
    pool: SqlitePool,
    metrics: Arc<Metrics>,
}

impl GraphStore {
    pub async fn rehydrate(db_path: &str) -> Result<Self, GraphError> {
        let pool = persist::open_pool(db_path).await?;
        let mut s = Self {
            g: DiGraph::new(),
            idx: HashMap::new(),
            nodes: HashMap::new(),
            edges: HashMap::new(),
            stats: HashMap::new(),
            pool,
            metrics: Metrics::new(),
        };
        let loaded = persist::load_all(&s.pool).await?;
        for n in loaded.nodes {
            let id = n.id;
            let ix = s.g.add_node(id);
            s.idx.insert(id, ix);
            s.nodes.insert(id, n);
        }
        for e in loaded.edges {
            let si = match s.idx.get(&e.src) {
                Some(i) => *i,
                None => {
                    crate::log::err("graph", "orphan edge in db, skipping");
                    continue;
                }
            };
            let di = match s.idx.get(&e.dst) {
                Some(i) => *i,
                None => {
                    crate::log::err("graph", "orphan edge in db, skipping");
                    continue;
                }
            };
            s.g.add_edge(si, di, e.kind);
            s.edges.insert((e.src, e.dst, e.kind), e);
        }
        Ok(s)
    }

    pub fn metrics(&self) -> Arc<Metrics> {
        self.metrics.clone()
    }

    pub fn health(&self) -> Snap {
        self.metrics.snap()
    }

    pub async fn upsert_node(&mut self, n: Node) -> Result<NodeId, GraphError> {
        let r = self.do_upsert_node(n).await;
        if r.is_err() {
            self.metrics.err();
        }
        r
    }

    async fn do_upsert_node(&mut self, n: Node) -> Result<NodeId, GraphError> {
        let id = n.id;
        let is_new = !self.nodes.contains_key(&id);

        let (final_label, final_props, final_first, final_last) = match self.nodes.get(&id) {
            Some(cur) => {
                let mut merged = cur.props.clone();
                for (k, v) in &n.props {
                    merged.insert(k.clone(), v.clone());
                }
                let label = if n.label.is_empty() {
                    cur.label.clone()
                } else {
                    n.label.clone()
                };
                let last = if n.last_seen > cur.last_seen {
                    n.last_seen
                } else {
                    cur.last_seen
                };
                (label, merged, cur.first_seen, last)
            }
            None => (n.label.clone(), n.props.clone(), n.first_seen, n.last_seen),
        };

        let id_blob = persist::id_bytes(&id);
        let nt = n.kind.as_str();
        let props_s = persist::encode_props(&final_props)?;
        let fs = persist::encode_ts(&final_first);
        let ls = persist::encode_ts(&final_last);

        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "INSERT INTO graph_nodes (id, node_type, label, props_json, first_seen, last_seen)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                label = excluded.label,
                props_json = excluded.props_json,
                last_seen = excluded.last_seen",
        )
        .bind(&id_blob)
        .bind(nt)
        .bind(&final_label)
        .bind(&props_s)
        .bind(fs)
        .bind(ls)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        if is_new {
            let ix = self.g.add_node(id);
            self.idx.insert(id, ix);
            self.metrics.add_node();
        }
        self.nodes.insert(
            id,
            Node {
                id,
                kind: n.kind,
                label: final_label,
                props: final_props,
                first_seen: final_first,
                last_seen: final_last,
            },
        );
        self.metrics.mutation();
        Ok(id)
    }

    pub async fn upsert_edge(&mut self, e: Edge) -> Result<(), GraphError> {
        let r = self.do_upsert_edge(e).await;
        if r.is_err() {
            self.metrics.err();
        }
        r
    }

    async fn do_upsert_edge(&mut self, e: Edge) -> Result<(), GraphError> {
        if !self.idx.contains_key(&e.src) {
            return Err(GraphError::MissingNode(e.src));
        }
        if !self.idx.contains_key(&e.dst) {
            return Err(GraphError::MissingNode(e.dst));
        }
        let k = (e.src, e.dst, e.kind);
        let is_new = !self.edges.contains_key(&k);

        let (final_props, final_first, final_last) = match self.edges.get(&k) {
            Some(cur) => {
                let mut merged = cur.props.clone();
                for (pk, pv) in &e.props {
                    merged.insert(pk.clone(), pv.clone());
                }
                let last = if e.last_seen > cur.last_seen {
                    e.last_seen
                } else {
                    cur.last_seen
                };
                (merged, cur.first_seen, last)
            }
            None => (e.props.clone(), e.first_seen, e.last_seen),
        };

        let s_blob = persist::id_bytes(&e.src);
        let d_blob = persist::id_bytes(&e.dst);
        let et = e.kind.as_str();
        let props_s = persist::encode_props(&final_props)?;
        let fs = persist::encode_ts(&final_first);
        let ls = persist::encode_ts(&final_last);

        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "INSERT INTO graph_edges (source_id, target_id, edge_type, props_json, first_seen, last_seen)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(source_id, target_id, edge_type) DO UPDATE SET
                props_json = excluded.props_json,
                last_seen = excluded.last_seen",
        )
        .bind(&s_blob)
        .bind(&d_blob)
        .bind(et)
        .bind(&props_s)
        .bind(fs)
        .bind(ls)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        if is_new {
            let si = self.idx[&e.src];
            let di = self.idx[&e.dst];
            self.g.add_edge(si, di, e.kind);
            self.metrics.add_edge();
        }
        self.edges.insert(
            k,
            Edge {
                src: e.src,
                dst: e.dst,
                kind: e.kind,
                props: final_props,
                first_seen: final_first,
                last_seen: final_last,
            },
        );
        self.metrics.mutation();
        Ok(())
    }

    pub async fn remove_node(&mut self, id: &NodeId) -> Result<bool, GraphError> {
        let r = self.do_remove_node(id).await;
        if r.is_err() {
            self.metrics.err();
        }
        r
    }

    async fn do_remove_node(&mut self, id: &NodeId) -> Result<bool, GraphError> {
        if !self.idx.contains_key(id) {
            return Ok(false);
        }
        let id_blob = persist::id_bytes(id);
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM graph_edges WHERE source_id = ?1 OR target_id = ?1")
            .bind(&id_blob)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM graph_nodes WHERE id = ?")
            .bind(&id_blob)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;

        let ix = self.idx.remove(id).unwrap();
        self.nodes.remove(id);
        self.stats.remove(id);
        self.edges.retain(|(s, d, _), _| s != id && d != id);
        self.g.remove_node(ix);
        self.idx.clear();
        for ix in self.g.node_indices() {
            let nid = self.g[ix];
            self.idx.insert(nid, ix);
        }
        self.metrics.mutation();
        Ok(true)
    }

    pub async fn remove_edge(
        &mut self,
        src: &NodeId,
        dst: &NodeId,
        kind: EdgeType,
    ) -> Result<bool, GraphError> {
        let r = self.do_remove_edge(src, dst, kind).await;
        if r.is_err() {
            self.metrics.err();
        }
        r
    }

    async fn do_remove_edge(
        &mut self,
        src: &NodeId,
        dst: &NodeId,
        kind: EdgeType,
    ) -> Result<bool, GraphError> {
        let k = (*src, *dst, kind);
        if !self.edges.contains_key(&k) {
            return Ok(false);
        }
        let s_blob = persist::id_bytes(src);
        let d_blob = persist::id_bytes(dst);
        let et = kind.as_str();
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "DELETE FROM graph_edges WHERE source_id = ? AND target_id = ? AND edge_type = ?",
        )
        .bind(&s_blob)
        .bind(&d_blob)
        .bind(et)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        self.edges.remove(&k);
        let si = self.idx[src];
        let di = self.idx[dst];
        let ei = self
            .g
            .edges_connecting(si, di)
            .find(|er| *er.weight() == kind)
            .map(|er| er.id());
        if let Some(ei) = ei {
            self.g.remove_edge(ei);
        }
        self.metrics.mutation();
        Ok(true)
    }

    pub fn get_node(&self, id: &NodeId) -> Option<&Node> {
        self.nodes.get(id)
    }

    pub fn endpoint_stats(&self, id: &NodeId) -> Option<EndpointStats> {
        self.stats.get(id).cloned()
    }

    pub fn iter_endpoint_stats(&self) -> impl Iterator<Item = (&NodeId, &EndpointStats)> {
        self.stats.iter()
    }

    pub fn neighbors(&self, id: &NodeId, dir: Direction, kind: Option<EdgeType>) -> Vec<NodeId> {
        let ix = match self.idx.get(id) {
            Some(i) => *i,
            None => return vec![],
        };
        let mut out = vec![];
        if matches!(dir, Direction::Out | Direction::Both) {
            for er in self.g.edges_directed(ix, PgDir::Outgoing) {
                if let Some(k) = kind {
                    if *er.weight() != k {
                        continue;
                    }
                }
                out.push(self.g[er.target()]);
            }
        }
        if matches!(dir, Direction::In | Direction::Both) {
            for er in self.g.edges_directed(ix, PgDir::Incoming) {
                if let Some(k) = kind {
                    if *er.weight() != k {
                        continue;
                    }
                }
                out.push(self.g[er.source()]);
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::{Edge, EdgeType, Node, NodeId, NodeType};
    use chrono::{DateTime, Duration, Utc};
    use std::collections::HashMap;

    fn mk_node(id: NodeId, k: NodeType, label: &str, ts: DateTime<Utc>) -> Node {
        Node {
            id,
            kind: k,
            label: label.into(),
            props: Default::default(),
            first_seen: ts,
            last_seen: ts,
        }
    }

    fn mk_node_p(
        id: NodeId,
        k: NodeType,
        label: &str,
        kvs: &[(&str, serde_json::Value)],
        ts: DateTime<Utc>,
    ) -> Node {
        let mut p = HashMap::new();
        for (a, b) in kvs {
            p.insert((*a).to_string(), b.clone());
        }
        Node {
            id,
            kind: k,
            label: label.into(),
            props: p,
            first_seen: ts,
            last_seen: ts,
        }
    }

    fn mk_edge(src: NodeId, dst: NodeId, k: EdgeType, ts: DateTime<Utc>) -> Edge {
        Edge {
            src,
            dst,
            kind: k,
            props: Default::default(),
            first_seen: ts,
            last_seen: ts,
        }
    }

    #[tokio::test]
    async fn insert_and_get() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        let id = NodeId::for_service("payments");
        let now = Utc::now();
        s.upsert_node(mk_node(id, NodeType::Service, "payments", now))
            .await
            .unwrap();
        let got = s.get_node(&id).unwrap();
        assert_eq!(got.id, id);
        assert_eq!(got.label, "payments");
        assert!(s.get_node(&NodeId::for_service("nope")).is_none());
    }

    #[tokio::test]
    async fn update_merges_props_and_advances_last_seen() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        let id = NodeId::for_service("payments");
        let t0 = Utc::now();
        let t1 = t0 + Duration::seconds(10);
        s.upsert_node(mk_node_p(
            id,
            NodeType::Service,
            "payments",
            &[("owner", serde_json::json!("alice"))],
            t0,
        ))
        .await
        .unwrap();
        s.upsert_node(mk_node_p(
            id,
            NodeType::Service,
            "payments",
            &[("region", serde_json::json!("ap-south-1"))],
            t1,
        ))
        .await
        .unwrap();
        let got = s.get_node(&id).unwrap();
        assert_eq!(got.props.get("owner"), Some(&serde_json::json!("alice")));
        assert_eq!(
            got.props.get("region"),
            Some(&serde_json::json!("ap-south-1"))
        );
        assert_eq!(got.last_seen.timestamp_millis(), t1.timestamp_millis());
        assert_eq!(got.first_seen.timestamp_millis(), t0.timestamp_millis());
    }

    #[tokio::test]
    async fn update_does_not_regress_last_seen() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        let id = NodeId::for_service("payments");
        let t0 = Utc::now();
        let t_back = t0 - Duration::seconds(60);
        s.upsert_node(mk_node(id, NodeType::Service, "payments", t0))
            .await
            .unwrap();
        s.upsert_node(mk_node(id, NodeType::Service, "payments", t_back))
            .await
            .unwrap();
        assert_eq!(
            s.get_node(&id).unwrap().last_seen.timestamp_millis(),
            t0.timestamp_millis()
        );
    }

    #[tokio::test]
    async fn upsert_edge_merges_on_existing() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        let a = NodeId::for_service("a");
        let b = NodeId::for_service("b");
        let t0 = Utc::now();
        let t1 = t0 + Duration::seconds(5);
        s.upsert_node(mk_node(a, NodeType::Service, "a", t0))
            .await
            .unwrap();
        s.upsert_node(mk_node(b, NodeType::Service, "b", t0))
            .await
            .unwrap();
        let mut e = mk_edge(a, b, EdgeType::Uses, t0);
        e.props.insert("calls".into(), serde_json::json!(10));
        s.upsert_edge(e).await.unwrap();
        let mut e2 = mk_edge(a, b, EdgeType::Uses, t1);
        e2.props.insert("p95_ms".into(), serde_json::json!(82));
        s.upsert_edge(e2).await.unwrap();
        let neigh = s.neighbors(&a, Direction::Out, None);
        assert_eq!(neigh, vec![b]);
    }

    #[tokio::test]
    async fn upsert_edge_with_missing_endpoint_errors() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        let a = NodeId::for_service("a");
        let b = NodeId::for_service("b");
        let t0 = Utc::now();
        s.upsert_node(mk_node(a, NodeType::Service, "a", t0))
            .await
            .unwrap();
        let r = s.upsert_edge(mk_edge(a, b, EdgeType::Uses, t0)).await;
        assert!(matches!(r, Err(GraphError::MissingNode(_))));
    }

    #[tokio::test]
    async fn remove_node_cascades_edges() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        let a = NodeId::for_service("a");
        let b = NodeId::for_service("b");
        let c = NodeId::for_service("c");
        let t0 = Utc::now();
        s.upsert_node(mk_node(a, NodeType::Service, "a", t0))
            .await
            .unwrap();
        s.upsert_node(mk_node(b, NodeType::Service, "b", t0))
            .await
            .unwrap();
        s.upsert_node(mk_node(c, NodeType::Service, "c", t0))
            .await
            .unwrap();
        s.upsert_edge(mk_edge(a, b, EdgeType::Uses, t0))
            .await
            .unwrap();
        s.upsert_edge(mk_edge(c, b, EdgeType::Uses, t0))
            .await
            .unwrap();
        s.upsert_edge(mk_edge(b, a, EdgeType::Calls, t0))
            .await
            .unwrap();
        assert!(s.remove_node(&b).await.unwrap());
        assert!(s.get_node(&b).is_none());
        assert!(s.get_node(&a).is_some());
        assert!(s.get_node(&c).is_some());
        assert!(s.neighbors(&a, Direction::Both, None).is_empty());
        assert!(s.neighbors(&c, Direction::Out, None).is_empty());
        assert!(!s.remove_node(&b).await.unwrap());
    }

    #[tokio::test]
    async fn remove_edge_removes_one_keeps_others() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        let a = NodeId::for_service("a");
        let b = NodeId::for_service("b");
        let t0 = Utc::now();
        s.upsert_node(mk_node(a, NodeType::Service, "a", t0))
            .await
            .unwrap();
        s.upsert_node(mk_node(b, NodeType::Service, "b", t0))
            .await
            .unwrap();
        s.upsert_edge(mk_edge(a, b, EdgeType::Uses, t0))
            .await
            .unwrap();
        s.upsert_edge(mk_edge(a, b, EdgeType::Calls, t0))
            .await
            .unwrap();
        assert!(s.remove_edge(&a, &b, EdgeType::Uses).await.unwrap());
        let outs = s.neighbors(&a, Direction::Out, None);
        assert_eq!(outs, vec![b]);
        let only_calls = s.neighbors(&a, Direction::Out, Some(EdgeType::Calls));
        assert_eq!(only_calls, vec![b]);
        let none_uses = s.neighbors(&a, Direction::Out, Some(EdgeType::Uses));
        assert!(none_uses.is_empty());
        assert!(!s.remove_edge(&a, &b, EdgeType::Uses).await.unwrap());
    }

    #[tokio::test]
    async fn neighbors_directional_and_filtered() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        let gw = NodeId::for_gateway("gw");
        let ep = NodeId::for_endpoint("upi", "GET", "/v2/upi/status");
        let svc = NodeId::for_service("upi-service");
        let team = NodeId::for_team("Payments");
        let t0 = Utc::now();
        s.upsert_node(mk_node(gw, NodeType::Gateway, "gw", t0))
            .await
            .unwrap();
        s.upsert_node(mk_node(ep, NodeType::Endpoint, "GET /v2/upi/status", t0))
            .await
            .unwrap();
        s.upsert_node(mk_node(svc, NodeType::Service, "upi-service", t0))
            .await
            .unwrap();
        s.upsert_node(mk_node(team, NodeType::Team, "Payments", t0))
            .await
            .unwrap();
        s.upsert_edge(mk_edge(gw, ep, EdgeType::RoutesTo, t0))
            .await
            .unwrap();
        s.upsert_edge(mk_edge(ep, svc, EdgeType::Uses, t0))
            .await
            .unwrap();
        s.upsert_edge(mk_edge(ep, team, EdgeType::OwnedBy, t0))
            .await
            .unwrap();

        let outs = s.neighbors(&ep, Direction::Out, None);
        assert_eq!(outs.len(), 2);
        assert!(outs.contains(&svc));
        assert!(outs.contains(&team));

        let ins = s.neighbors(&ep, Direction::In, None);
        assert_eq!(ins, vec![gw]);

        let both = s.neighbors(&ep, Direction::Both, None);
        assert_eq!(both.len(), 3);

        let only_uses = s.neighbors(&ep, Direction::Out, Some(EdgeType::Uses));
        assert_eq!(only_uses, vec![svc]);

        let no_in_uses = s.neighbors(&ep, Direction::In, Some(EdgeType::Uses));
        assert!(no_in_uses.is_empty());

        let in_routes = s.neighbors(&ep, Direction::In, Some(EdgeType::RoutesTo));
        assert_eq!(in_routes, vec![gw]);
    }

    #[tokio::test]
    async fn rehydrate_round_trip() {
        let path = format!(
            "/tmp/zh-graph-test-{}.sqlite",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let a = NodeId::for_service("a");
        let b = NodeId::for_service("b");
        let t0 = Utc::now();
        {
            let mut s = GraphStore::rehydrate(&path).await.unwrap();
            s.upsert_node(mk_node(a, NodeType::Service, "a", t0))
                .await
                .unwrap();
            s.upsert_node(mk_node(b, NodeType::Service, "b", t0))
                .await
                .unwrap();
            s.upsert_edge(mk_edge(a, b, EdgeType::Uses, t0))
                .await
                .unwrap();
        }
        let s = GraphStore::rehydrate(&path).await.unwrap();
        assert!(s.get_node(&a).is_some());
        assert!(s.get_node(&b).is_some());
        assert_eq!(s.neighbors(&a, Direction::Out, Some(EdgeType::Uses)), vec![b]);
        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn metrics_track_mutations() {
        let mut s = GraphStore::rehydrate(":memory:").await.unwrap();
        let a = NodeId::for_service("a");
        let b = NodeId::for_service("b");
        let t0 = Utc::now();
        assert_eq!(s.health().nodes_added, 0);
        s.upsert_node(mk_node(a, NodeType::Service, "a", t0))
            .await
            .unwrap();
        s.upsert_node(mk_node(b, NodeType::Service, "b", t0))
            .await
            .unwrap();
        s.upsert_edge(mk_edge(a, b, EdgeType::Uses, t0))
            .await
            .unwrap();
        let snap = s.health();
        assert_eq!(snap.nodes_added, 2);
        assert_eq!(snap.edges_added, 1);
        assert_eq!(snap.mutations_total, 3);
        assert!(snap.last_mutation_ts > 0);
    }
}
