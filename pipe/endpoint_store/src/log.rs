use crate::metrics::Snap;

pub fn start(who: &str, cve_entries: usize) {
    let t = chrono::Utc::now().to_rfc3339();
    println!(
        r#"{{"t":"{}","kind":"start","who":"{}","cve_entries":{}}}"#,
        t, who, cve_entries
    );
}

pub fn err(who: &str, msg: &str) {
    let t = chrono::Utc::now().to_rfc3339();
    let m = msg.replace('\\', "\\\\").replace('"', "\\\"");
    println!(
        r#"{{"t":"{}","kind":"error","who":"{}","msg":"{}"}}"#,
        t, who, m
    );
}

pub fn hb(who: &str, s: &Snap) {
    let t = chrono::Utc::now().to_rfc3339();
    println!(
        r#"{{"t":"{}","kind":"hb","who":"{}","upserts":{},"rows":{},"errors":{}}}"#,
        t, who, s.upserts_total, s.row_count, s.errors_total
    );
}
