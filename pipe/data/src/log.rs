use crate::metrics::Snap;

pub fn evt(kind: &str, who: &str) {
    let t = chrono::Utc::now().to_rfc3339();
    println!(r#"{{"t":"{}","kind":"{}","who":"{}"}}"#, t, kind, who);
}

pub fn err(who: &str, msg: &str) {
    let t = chrono::Utc::now().to_rfc3339();
    let m = msg.replace('\\', "\\\\").replace('"', "\\\"");
    println!(r#"{{"t":"{}","kind":"error","who":"{}","msg":"{}"}}"#, t, who, m);
}

pub fn hb(who: &str, s: &Snap) {
    let t = chrono::Utc::now().to_rfc3339();
    println!(
        r#"{{"t":"{}","kind":"hb","who":"{}","emit":{},"drop":{},"err":{}}}"#,
        t, who, s.emitted, s.dropped, s.errors
    );
}
