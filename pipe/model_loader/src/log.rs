use crate::metrics::Snap;

pub fn start(who: &str) {
    let t = chrono::Utc::now().to_rfc3339();
    println!(r#"{{"t":"{}","kind":"start","who":"{}"}}"#, t, who);
}

pub fn err(who: &str, msg: &str) {
    let t = chrono::Utc::now().to_rfc3339();
    let m = msg.replace('\\', "\\\\").replace('"', "\\\"");
    println!(r#"{{"t":"{}","kind":"error","who":"{}","msg":"{}"}}"#, t, who, m);
}

pub fn hb(who: &str, s: &Snap) {
    let t = chrono::Utc::now().to_rfc3339();
    println!(
        r#"{{"t":"{}","kind":"hb","who":"{}","classify":{},"risk":{},"anomaly":{},"rows":{},"errors":{}}}"#,
        t, who, s.classify_calls, s.risk_calls, s.anomaly_calls, s.rows_processed, s.errors_total
    );
}
