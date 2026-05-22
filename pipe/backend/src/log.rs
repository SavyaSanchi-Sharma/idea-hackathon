use serde::Serialize;

pub fn start_who(who: &str) {
    let t = chrono::Utc::now().to_rfc3339();
    println!(r#"{{"t":"{}","kind":"start","who":"{}"}}"#, t, who);
}

pub fn start_kv(who: &str, kvs: &[(&str, &str)]) {
    let t = chrono::Utc::now().to_rfc3339();
    let mut s = format!(r#"{{"t":"{}","kind":"start","who":"{}""#, t, who);
    for (k, v) in kvs {
        s.push_str(&format!(r#","{}":"{}""#, k, v.replace('"', "\\\"")));
    }
    s.push('}');
    println!("{}", s);
}

pub fn err(who: &str, msg: &str) {
    let t = chrono::Utc::now().to_rfc3339();
    let m = msg.replace('\\', "\\\\").replace('"', "\\\"");
    println!(
        r#"{{"t":"{}","kind":"error","who":"{}","msg":"{}"}}"#,
        t, who, m
    );
}

pub fn hb<S: Serialize>(who: &str, payload: &S) {
    let t = chrono::Utc::now().to_rfc3339();
    let body = serde_json::to_string(payload).unwrap_or_else(|_| "{}".into());
    println!(r#"{{"t":"{}","kind":"hb","who":"{}","data":{}}}"#, t, who, body);
}
