use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prediction {
    pub endpoint_id: i64,
    pub endpoint: String,
    pub method: String,
    pub rule_state: String,
    pub rule_is_zombie: i32,
    pub rule_is_shadow: i32,
    pub rule_reason: String,
    pub ml_state: String,
    pub ml_confidence: f64,
    pub lifecycle_agreement: i32,
    pub needs_review: i32,
    pub risk_score: f64,
    pub risk_band: String,
    pub owasp_findings: Vec<String>,
    pub finding_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PredictionBatch(pub Vec<Prediction>);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnomalyPrediction {
    pub endpoint_id: i64,
    pub anomaly_flag: i32,
    pub anomaly_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AnomalyPredictionBatch(pub Vec<AnomalyPrediction>);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prediction_json_matches_python_shape() {
        let p = Prediction {
            endpoint_id: 42,
            endpoint: "/v1/x".into(),
            method: "GET".into(),
            rule_state: "active".into(),
            rule_is_zombie: 0,
            rule_is_shadow: 0,
            rule_reason: "in_registry".into(),
            ml_state: "active".into(),
            ml_confidence: 0.987,
            lifecycle_agreement: 1,
            needs_review: 0,
            risk_score: 12.3,
            risk_band: "low".into(),
            owasp_findings: vec!["API1:BOLA".into()],
            finding_count: 1,
        };
        let s = serde_json::to_string(&p).unwrap();
        assert!(s.contains(r#""owasp_findings":["API1:BOLA"]"#));
        assert!(s.contains(r#""ml_confidence":0.987"#));
        let back: Prediction = serde_json::from_str(&s).unwrap();
        assert_eq!(back.endpoint_id, 42);
        assert_eq!(back.owasp_findings.len(), 1);
    }

    #[test]
    fn anomaly_json_roundtrip() {
        let a = AnomalyPrediction {
            endpoint_id: 9,
            anomaly_flag: 1,
            anomaly_score: 0.7321,
        };
        let s = serde_json::to_string(&a).unwrap();
        let back: AnomalyPrediction = serde_json::from_str(&s).unwrap();
        assert_eq!(back.anomaly_flag, 1);
        assert!((back.anomaly_score - 0.7321).abs() < 1e-9);
    }
}
