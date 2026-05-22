use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureRow {
    pub endpoint_id: i64,
    pub endpoint: String,
    pub method: String,
    pub service: String,
    pub in_registry: i32,
    pub owner_present: i32,
    pub deprecated_flag: i32,
    pub call_count_7d: i64,
    pub auth_fail_rate_7d: f64,
    pub p95_latency_ms: f64,
    pub last_seen_days: f64,
    pub last_deploy_days: f64,
    pub auth_scheme: String,
    pub runtime: String,
    pub runtime_version: String,
    pub schema_count: i32,
    pub max_cvss: f64,
}

#[derive(Debug, Clone, Default)]
pub struct AssembleInput<'a> {
    pub endpoint_id: i64,
    pub endpoint: &'a str,
    pub method: &'a str,
    pub service: &'a str,
    pub in_registry: bool,
    pub owner_present: bool,
    pub deprecated_flag: bool,
    pub call_count_7d: i64,
    pub auth_fail_rate_7d: f64,
    pub p95_latency_ms: f64,
    pub last_seen_days: f64,
    pub last_deploy_days: f64,
    pub auth_scheme: &'a str,
    pub runtime: Option<&'a str>,
    pub runtime_version: Option<&'a str>,
    pub schema_count: i32,
    pub max_cvss: f64,
}

impl FeatureRow {
    pub fn assemble(i: AssembleInput<'_>) -> Self {
        Self {
            endpoint_id: i.endpoint_id,
            endpoint: i.endpoint.to_string(),
            method: i.method.to_string(),
            service: i.service.to_string(),
            in_registry: if i.in_registry { 1 } else { 0 },
            owner_present: if i.owner_present { 1 } else { 0 },
            deprecated_flag: if i.deprecated_flag { 1 } else { 0 },
            call_count_7d: i.call_count_7d,
            auth_fail_rate_7d: i.auth_fail_rate_7d,
            p95_latency_ms: i.p95_latency_ms,
            last_seen_days: i.last_seen_days,
            last_deploy_days: i.last_deploy_days,
            auth_scheme: i.auth_scheme.to_string(),
            runtime: i.runtime.unwrap_or("unknown").to_string(),
            runtime_version: i.runtime_version.unwrap_or("unknown").to_string(),
            schema_count: i.schema_count,
            max_cvss: i.max_cvss,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FeatureBatch(pub Vec<FeatureRow>);

impl FeatureBatch {
    pub fn new(rows: Vec<FeatureRow>) -> Self {
        Self(rows)
    }
    pub fn push(&mut self, row: FeatureRow) {
        self.0.push(row);
    }
    pub fn len(&self) -> usize {
        self.0.len()
    }
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_roundtrip() {
        let row = FeatureRow {
            endpoint_id: 7,
            endpoint: "/v2/charges/{id}".into(),
            method: "POST".into(),
            service: "payments".into(),
            in_registry: 1,
            owner_present: 1,
            deprecated_flag: 0,
            call_count_7d: 1024,
            auth_fail_rate_7d: 0.02,
            p95_latency_ms: 87.5,
            last_seen_days: 0.5,
            last_deploy_days: 14.0,
            auth_scheme: "oauth2".into(),
            runtime: "python".into(),
            runtime_version: "3.11".into(),
            schema_count: 3,
            max_cvss: 0.0,
        };
        let s = serde_json::to_string(&row).unwrap();
        let back: FeatureRow = serde_json::from_str(&s).unwrap();
        assert_eq!(back.endpoint_id, 7);
        assert_eq!(back.method, "POST");
        assert_eq!(back.runtime, "python");
    }

    #[test]
    fn batch_roundtrip_preserves_order() {
        let rows: Vec<FeatureRow> = (0..3)
            .map(|i| FeatureRow {
                endpoint_id: i,
                endpoint: format!("/p/{}", i),
                method: "GET".into(),
                service: "x".into(),
                in_registry: 1,
                owner_present: 1,
                deprecated_flag: 0,
                call_count_7d: i,
                auth_fail_rate_7d: 0.0,
                p95_latency_ms: 1.0,
                last_seen_days: 0.0,
                last_deploy_days: 0.0,
                auth_scheme: "none".into(),
                runtime: "go".into(),
                runtime_version: "1.22".into(),
                schema_count: 1,
                max_cvss: 0.0,
            })
            .collect();
        let batch = FeatureBatch::new(rows);
        let s = serde_json::to_string(&batch.0).unwrap();
        let back: Vec<FeatureRow> = serde_json::from_str(&s).unwrap();
        assert_eq!(back.len(), 3);
        for (i, r) in back.iter().enumerate() {
            assert_eq!(r.endpoint_id, i as i64);
        }
    }
}
