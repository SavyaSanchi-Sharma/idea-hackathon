use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Classification {
    Active,
    Deprecated,
    Orphaned,
}

impl Classification {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Deprecated => "deprecated",
            Self::Orphaned => "orphaned",
        }
    }
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "active" => Some(Self::Active),
            "deprecated" => Some(Self::Deprecated),
            "orphaned" => Some(Self::Orphaned),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskBand {
    Low,
    Medium,
    High,
    Critical,
}

impl RiskBand {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Critical => "critical",
        }
    }
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "low" => Some(Self::Low),
            "medium" => Some(Self::Medium),
            "high" => Some(Self::High),
            "critical" => Some(Self::Critical),
            _ => None,
        }
    }
    pub fn from_score(score: f32) -> Self {
        if score >= 90.0 {
            Self::Critical
        } else if score >= 75.0 {
            Self::High
        } else if score >= 40.0 {
            Self::Medium
        } else {
            Self::Low
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct UnifiedPrediction {
    pub endpoint_id: [u8; 16],
    pub rule_state: Classification,
    pub rule_reason: String,
    pub rule_is_zombie: bool,
    pub rule_is_shadow: bool,
    pub ml_state: Classification,
    pub ml_confidence: f32,
    pub lifecycle_agreement: bool,
    pub needs_review: bool,
    pub risk_score: f32,
    pub risk_band: RiskBand,
    pub anomaly_flag: Option<bool>,
    pub anomaly_score: Option<f32>,
    pub owasp_findings: Vec<String>,
    pub finding_count: u32,
    pub updated_at: DateTime<Utc>,
}

impl UnifiedPrediction {
    pub fn merge(
        endpoint_id: [u8; 16],
        rule: &crate::rule_classifier::RuleResult,
        ml_state: Classification,
        ml_confidence: f32,
        risk_score: f32,
        owasp_findings: Vec<String>,
        anomaly: Option<(bool, f32)>,
    ) -> Self {
        let agreement = rule.state == ml_state;
        let finding_count = owasp_findings.len() as u32;
        Self {
            endpoint_id,
            rule_state: rule.state,
            rule_reason: rule.reason.clone(),
            rule_is_zombie: rule.is_zombie,
            rule_is_shadow: rule.is_shadow,
            ml_state,
            ml_confidence,
            lifecycle_agreement: agreement,
            needs_review: !agreement,
            risk_score,
            risk_band: RiskBand::from_score(risk_score),
            anomaly_flag: anomaly.map(|(f, _)| f),
            anomaly_score: anomaly.map(|(_, s)| s),
            owasp_findings,
            finding_count,
            updated_at: Utc::now(),
        }
    }
}
