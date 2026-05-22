use std::collections::HashMap;
use std::fmt;
use std::str::FromStr;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use crate::error::GraphError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    Consumer,
    Gateway,
    Endpoint,
    Service,
    Database,
    Team,
    Deployment,
    Finding,
}

impl NodeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Consumer => "consumer",
            Self::Gateway => "gateway",
            Self::Endpoint => "endpoint",
            Self::Service => "service",
            Self::Database => "database",
            Self::Team => "team",
            Self::Deployment => "deployment",
            Self::Finding => "finding",
        }
    }
}

impl FromStr for NodeType {
    type Err = GraphError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "consumer" => Ok(Self::Consumer),
            "gateway" => Ok(Self::Gateway),
            "endpoint" => Ok(Self::Endpoint),
            "service" => Ok(Self::Service),
            "database" => Ok(Self::Database),
            "team" => Ok(Self::Team),
            "deployment" => Ok(Self::Deployment),
            "finding" => Ok(Self::Finding),
            _ => Err(GraphError::ParseType(s.into())),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeType {
    Calls,
    RoutesTo,
    Uses,
    Queries,
    OwnedBy,
    DeployedOn,
    HasFindings,
}

impl EdgeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Calls => "calls",
            Self::RoutesTo => "routes_to",
            Self::Uses => "uses",
            Self::Queries => "queries",
            Self::OwnedBy => "owned_by",
            Self::DeployedOn => "deployed_on",
            Self::HasFindings => "has_findings",
        }
    }
}

impl FromStr for EdgeType {
    type Err = GraphError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "calls" => Ok(Self::Calls),
            "routes_to" => Ok(Self::RoutesTo),
            "uses" => Ok(Self::Uses),
            "queries" => Ok(Self::Queries),
            "owned_by" => Ok(Self::OwnedBy),
            "deployed_on" => Ok(Self::DeployedOn),
            "has_findings" => Ok(Self::HasFindings),
            _ => Err(GraphError::ParseType(s.into())),
        }
    }
}

pub type Props = HashMap<String, serde_json::Value>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct NodeId(pub [u8; 16]);

impl NodeId {
    pub fn from_bytes(b: [u8; 16]) -> Self {
        Self(b)
    }
    pub fn as_bytes(&self) -> &[u8; 16] {
        &self.0
    }
    pub fn to_hex(&self) -> String {
        let mut s = String::with_capacity(32);
        for b in &self.0 {
            s.push_str(&format!("{:02x}", b));
        }
        s
    }
    pub fn from_hex(s: &str) -> Option<Self> {
        if s.len() != 32 {
            return None;
        }
        let mut out = [0u8; 16];
        for i in 0..16 {
            out[i] = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).ok()?;
        }
        Some(Self(out))
    }
}

impl fmt::Display for NodeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_hex())
    }
}

impl Serialize for NodeId {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_hex())
    }
}

impl<'de> Deserialize<'de> for NodeId {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        NodeId::from_hex(&s).ok_or_else(|| serde::de::Error::custom("invalid NodeId hex"))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: NodeId,
    pub kind: NodeType,
    pub label: String,
    pub props: Props,
    pub first_seen: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub src: NodeId,
    pub dst: NodeId,
    pub kind: EdgeType,
    pub props: Props,
    pub first_seen: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
}
