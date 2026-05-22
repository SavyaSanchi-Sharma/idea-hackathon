use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use async_trait::async_trait;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use axum::Router;
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::Sha256;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{sleep, Duration};
use crate::cfg::RealCodeCfg;
use crate::events::{Code, Event, Src, Tagged};
use crate::log;
use crate::metrics::{M, Snap};
use crate::prod::Prod;
use crate::queue::{push, Tx};
use crate::syn_code::parse_routes;

type Hm = Hmac<Sha256>;

#[derive(Deserialize)]
struct Push {
    repository: Repo,
    after: String,
    commits: Vec<Commit>,
}

#[derive(Deserialize)]
struct Repo {
    name: String,
    full_name: String,
}

#[derive(Deserialize)]
struct Commit {
    timestamp: chrono::DateTime<chrono::Utc>,
    author: Author,
    #[serde(default)]
    added: Vec<String>,
    #[serde(default)]
    modified: Vec<String>,
}

#[derive(Deserialize)]
struct Author {
    name: String,
}

#[derive(Clone)]
struct St {
    tx: Tx,
    m: Arc<M>,
    secret: String,
    api: String,
    tok: String,
}

pub struct RealCode {
    cfg: RealCodeCfg,
    tx: Tx,
    m: Arc<M>,
    run: Arc<AtomicBool>,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl RealCode {
    pub fn new(cfg: RealCodeCfg, tx: Tx) -> Self {
        Self {
            cfg,
            tx,
            m: M::new(),
            run: Arc::new(AtomicBool::new(false)),
            task: Mutex::new(None),
        }
    }
}

#[async_trait]
impl Prod for RealCode {
    async fn start(&self) {
        if self.run.swap(true, Ordering::SeqCst) {
            return;
        }
        let cfg = self.cfg.clone();
        let tx = self.tx.clone();
        let m = self.m.clone();
        let run = self.run.clone();
        let h = tokio::spawn(async move {
            log::evt("start", "real_code");
            let st = St {
                tx,
                m: m.clone(),
                secret: cfg.secret.clone(),
                api: cfg.api_base.clone(),
                tok: cfg.api_token.clone(),
            };
            let app: Router = Router::new()
                .route(&cfg.path, post(hook))
                .with_state(st);
            let addr: SocketAddr = match cfg.bind.parse() {
                Ok(a) => a,
                Err(e) => {
                    m.err();
                    log::err("real_code", &e.to_string());
                    return;
                }
            };
            let listener = match tokio::net::TcpListener::bind(addr).await {
                Ok(l) => l,
                Err(e) => {
                    m.err();
                    log::err("real_code", &e.to_string());
                    return;
                }
            };
            let r2 = run.clone();
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    while r2.load(Ordering::SeqCst) {
                        sleep(Duration::from_millis(200)).await;
                    }
                })
                .await;
            log::evt("stop", "real_code");
        });
        *self.task.lock().await = Some(h);
    }

    async fn stop(&self) {
        self.run.store(false, Ordering::SeqCst);
        let h = self.task.lock().await.take();
        if let Some(h) = h {
            let _ = h.await;
        }
    }

    fn health(&self) -> Snap {
        self.m.snap()
    }
}

fn verify(secret: &str, sig: &str, body: &[u8]) -> bool {
    let s = sig.strip_prefix("sha256=").unwrap_or(sig);
    let expected = match hex::decode(s) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let mut mac = match Hm::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(body);
    mac.verify_slice(&expected).is_ok()
}

fn detect(p: &str) -> Option<&'static str> {
    if p.ends_with(".py") {
        Some("python")
    } else if p.ends_with(".ts") || p.ends_with(".js") {
        Some("nodejs")
    } else if p.ends_with(".java") {
        Some("java")
    } else if p.ends_with(".go") {
        Some("golang")
    } else if p.ends_with(".cs") {
        Some("dotnet")
    } else {
        None
    }
}

async fn hook(State(st): State<St>, headers: HeaderMap, body: Bytes) -> StatusCode {
    let sig = headers
        .get("x-hub-signature-256")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !verify(&st.secret, &sig, &body) {
        st.m.err();
        return StatusCode::UNAUTHORIZED;
    }
    let push_evt: Push = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => {
            st.m.err();
            log::err("real_code", &e.to_string());
            return StatusCode::BAD_REQUEST;
        }
    };
    tokio::spawn(async move {
        let client = reqwest::Client::new();
        for c in &push_evt.commits {
            for f in c.added.iter().chain(c.modified.iter()) {
                let rt = match detect(f) {
                    Some(x) => x,
                    None => continue,
                };
                let url = format!(
                    "{}/repos/{}/contents/{}?ref={}",
                    st.api, push_evt.repository.full_name, f, push_evt.after
                );
                let body = match client
                    .get(&url)
                    .bearer_auth(&st.tok)
                    .header("Accept", "application/vnd.github.v3.raw")
                    .header("User-Agent", "data-ingest")
                    .send()
                    .await
                {
                    Ok(r) => match r.text().await {
                        Ok(t) => t,
                        Err(e) => {
                            st.m.err();
                            log::err("real_code", &e.to_string());
                            continue;
                        }
                    },
                    Err(e) => {
                        st.m.err();
                        log::err("real_code", &e.to_string());
                        continue;
                    }
                };
                for (mth, path) in parse_routes(&body, rt) {
                    let ev = Code {
                        timestamp: chrono::Utc::now(),
                        repo_name: push_evt.repository.name.clone(),
                        commit_sha: push_evt.after.clone(),
                        endpoint_path: path,
                        method: mth,
                        service: f.split('/').next().unwrap_or("unknown").to_string(),
                        file_path: f.clone(),
                        last_commit_date: c.timestamp,
                        last_author: c.author.name.clone(),
                        runtime: rt.into(),
                        runtime_version: "unknown".into(),
                    };
                    push(
                        &st.tx,
                        &st.m,
                        Tagged {
                            event_source: Src::RealCode,
                            event: Event::Code(ev),
                        },
                    );
                }
            }
        }
    });
    StatusCode::ACCEPTED
}
