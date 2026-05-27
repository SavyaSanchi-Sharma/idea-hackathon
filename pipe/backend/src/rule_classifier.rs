use crate::unified::Classification;

#[derive(Debug, Clone)]
pub struct RuleInput<'a> {
    pub in_registry: bool,
    pub owner_present: bool,
    pub deprecated_flag: bool,
    pub call_count_7d: i64,
    pub last_seen_days: f64,
    pub auth_scheme: &'a str,
}

#[derive(Debug, Clone)]
pub struct RuleResult {
    pub state: Classification,
    pub is_zombie: bool,
    pub is_shadow: bool,
    pub reason: String,
}

pub fn classify(r: RuleInput<'_>) -> RuleResult {
    let mut reasons: Vec<String> = Vec::new();

    if !r.owner_present {
        reasons.push("no owner".into());
        if r.deprecated_flag {
            reasons.push("deprecated flag set".into());
        }
        if r.last_seen_days > 30.0 {
            reasons.push(format!("dormant {:.0}d", r.last_seen_days));
        }
        return RuleResult {
            state: Classification::Orphaned,
            is_zombie: true,
            is_shadow: !r.in_registry,
            reason: reasons.join(", "),
        };
    }
    if r.deprecated_flag {
        reasons.push("deprecated flag set".into());
        if r.call_count_7d > 0 {
            reasons.push(format!(
                "still receiving traffic ({} calls/7d)",
                r.call_count_7d
            ));
        }
        return RuleResult {
            state: Classification::Deprecated,
            is_zombie: true,
            is_shadow: !r.in_registry,
            reason: reasons.join(", "),
        };
    }
    RuleResult {
        state: Classification::Active,
        is_zombie: false,
        is_shadow: !r.in_registry,
        reason: "owner present, not deprecated".into(),
    }
}
