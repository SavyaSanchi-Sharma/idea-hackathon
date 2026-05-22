use regex::Regex;
use std::sync::OnceLock;

static WEAK_AUTH: &[&str] = &["none", "basic", "api_key", "apiKey", "apiKey|basic"];

fn id_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\{\w*[Ii]d\}").unwrap())
}

#[derive(Debug, Clone)]
pub struct OwaspInput<'a> {
    pub path: &'a str,
    pub auth_scheme: &'a str,
    pub auth_fail_rate_7d: f64,
    pub max_cvss: f64,
    pub in_registry: bool,
    pub deprecated_flag: bool,
    pub call_count_7d: i64,
    pub last_deploy_days: Option<i64>,
    pub owner_present: bool,
    pub p95_latency_ms: f64,
}

pub fn findings(i: OwaspInput<'_>) -> Vec<String> {
    let mut f = Vec::new();
    if WEAK_AUTH.iter().any(|s| *s == i.auth_scheme) || i.auth_fail_rate_7d > 0.10 {
        f.push("API2:Broken-Authentication".into());
    }
    if i.max_cvss >= 7.0 {
        f.push("API8:Security-Misconfiguration".into());
    }
    if !i.in_registry {
        f.push("API9:Improper-Inventory-Management".into());
    } else if i.deprecated_flag && i.call_count_7d > 0 {
        f.push("API9:Improper-Inventory-Management".into());
    } else if i.last_deploy_days.unwrap_or(0) > 365 && !i.owner_present {
        f.push("API9:Improper-Inventory-Management".into());
    }
    if id_re().is_match(i.path) && WEAK_AUTH.iter().any(|s| *s == i.auth_scheme) {
        f.push("API1:BOLA".into());
    }
    if i.p95_latency_ms > 1000.0 {
        f.push("API4:Unrestricted-Resource-Consumption".into());
    }
    if i.last_deploy_days.unwrap_or(0) > 720 && i.max_cvss >= 7.0 {
        f.push("API10:Unsafe-Consumption-Of-APIs".into());
    }
    f
}
