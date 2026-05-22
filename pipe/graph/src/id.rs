use crate::schema::NodeId;

fn h16(s: &str) -> NodeId {
    let h = blake3::hash(s.as_bytes());
    let b = h.as_bytes();
    let mut out = [0u8; 16];
    out.copy_from_slice(&b[..16]);
    NodeId(out)
}

impl NodeId {
    pub fn for_endpoint(service: &str, method: &str, path: &str) -> Self {
        h16(&format!("endpoint|{}|{}|{}", service, method.to_uppercase(), path))
    }
    pub fn for_service(name: &str) -> Self {
        h16(&format!("service|{}", name))
    }
    pub fn for_database(name: &str) -> Self {
        h16(&format!("database|{}", name))
    }
    pub fn for_gateway(name: &str) -> Self {
        h16(&format!("gateway|{}", name))
    }
    pub fn for_team(name: &str) -> Self {
        h16(&format!("team|{}", name))
    }
    pub fn for_deployment(repo: &str, commit: &str) -> Self {
        h16(&format!("deployment|{}|{}", repo, commit))
    }
    pub fn for_consumer(client_id: &str) -> Self {
        h16(&format!("consumer|{}", client_id))
    }
    pub fn for_finding(endpoint_id: &NodeId, finding_kind: &str) -> Self {
        h16(&format!("finding|{}|{}", endpoint_id, finding_kind))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_input_same_id() {
        assert_eq!(NodeId::for_service("payments"), NodeId::for_service("payments"));
        assert_eq!(
            NodeId::for_endpoint("upi", "GET", "/v2/upi/status"),
            NodeId::for_endpoint("upi", "GET", "/v2/upi/status"),
        );
        assert_eq!(NodeId::for_team("Customer"), NodeId::for_team("Customer"));
        assert_eq!(NodeId::for_gateway("kong"), NodeId::for_gateway("kong"));
        assert_eq!(NodeId::for_database("customer-db"), NodeId::for_database("customer-db"));
        assert_eq!(
            NodeId::for_deployment("auth-svc", "abc123"),
            NodeId::for_deployment("auth-svc", "abc123"),
        );
        assert_eq!(NodeId::for_consumer("mobile"), NodeId::for_consumer("mobile"));
        let ep = NodeId::for_endpoint("upi", "GET", "/v2/upi/status");
        assert_eq!(
            NodeId::for_finding(&ep, "no_auth"),
            NodeId::for_finding(&ep, "no_auth"),
        );
    }

    #[test]
    fn different_input_different_id() {
        assert_ne!(NodeId::for_service("payments"), NodeId::for_service("kyc"));
        assert_ne!(
            NodeId::for_endpoint("upi", "GET", "/v2/upi/status"),
            NodeId::for_endpoint("upi", "GET", "/v2/upi/collect"),
        );
        assert_ne!(
            NodeId::for_endpoint("upi", "GET", "/v2/upi/status"),
            NodeId::for_endpoint("upi", "POST", "/v2/upi/status"),
        );
        assert_ne!(
            NodeId::for_endpoint("upi", "GET", "/v2/upi/status"),
            NodeId::for_endpoint("neft", "GET", "/v2/upi/status"),
        );
        assert_ne!(NodeId::for_team("Customer"), NodeId::for_team("Payments"));
        assert_ne!(NodeId::for_gateway("kong"), NodeId::for_gateway("apigee"));
        assert_ne!(NodeId::for_database("customer-db"), NodeId::for_database("transactions-db"));
        assert_ne!(
            NodeId::for_deployment("auth-svc", "abc123"),
            NodeId::for_deployment("auth-svc", "def456"),
        );
        assert_ne!(NodeId::for_consumer("mobile"), NodeId::for_consumer("netbank"));
        let ep = NodeId::for_endpoint("upi", "GET", "/v2/upi/status");
        assert_ne!(
            NodeId::for_finding(&ep, "no_auth"),
            NodeId::for_finding(&ep, "stale_cve"),
        );
    }

    #[test]
    fn method_is_normalized() {
        assert_eq!(
            NodeId::for_endpoint("upi", "get", "/foo"),
            NodeId::for_endpoint("upi", "GET", "/foo"),
        );
    }

    #[test]
    fn types_do_not_collide() {
        assert_ne!(NodeId::for_service("x"), NodeId::for_team("x"));
        assert_ne!(NodeId::for_service("x"), NodeId::for_database("x"));
        assert_ne!(NodeId::for_consumer("x"), NodeId::for_gateway("x"));
        assert_ne!(NodeId::for_gateway("x"), NodeId::for_database("x"));
        assert_ne!(NodeId::for_team("x"), NodeId::for_consumer("x"));
    }

    #[test]
    fn hex_roundtrip() {
        let id = NodeId::for_service("payments");
        let s = id.to_string();
        assert_eq!(s.len(), 32);
        assert_eq!(NodeId::from_hex(&s), Some(id));
        assert!(s.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn json_roundtrip() {
        let id = NodeId::for_team("Payments");
        let j = serde_json::to_string(&id).unwrap();
        assert_eq!(j, format!(r#""{}""#, id));
        let back: NodeId = serde_json::from_str(&j).unwrap();
        assert_eq!(back, id);
    }
}
