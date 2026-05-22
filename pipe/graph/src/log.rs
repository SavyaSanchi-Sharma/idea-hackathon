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
        r#"{{"t":"{}","kind":"hb","who":"{}","nodes_added":{},"edges_added":{},"mutations":{},"errors":{},"last_mutation_ts":{}}}"#,
        t, who, s.nodes_added, s.edges_added, s.mutations_total, s.errors_total, s.last_mutation_ts
    );
}
