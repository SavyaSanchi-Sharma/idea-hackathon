use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use async_trait::async_trait;
use regex::Regex;
use serde::Deserialize;
use tokio::fs;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{sleep, Duration};
use crate::cfg::SynCodeCfg;
use crate::events::{Code, Event, Src, Tagged};
use crate::log;
use crate::metrics::{M, Snap};
use crate::prod::Prod;
use crate::queue::{push, Tx};

#[derive(Deserialize, Clone)]
pub struct Meta {
    pub last_commit_date: chrono::DateTime<chrono::Utc>,
    pub last_author: String,
    pub runtime: String,
    pub runtime_version: String,
}

pub fn parse_routes(src: &str, runtime: &str) -> Vec<(String, String)> {
    let r = match runtime {
        "python" => r#"@\w+\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']"#,
        "nodejs" => r#"\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']"#,
        "java" | "springboot" => r#"@(Get|Post|Put|Delete|Patch)Mapping\(\s*(?:value\s*=\s*)?["']([^"')]+)["']"#,
        "golang" => r#"\.(GET|POST|PUT|DELETE|PATCH)\(\s*["']([^"']+)["']"#,
        "dotnet" => r#"\[Http(Get|Post|Put|Delete|Patch)\(\s*["']?([^"')]+)["']?\s*\)\]"#,
        _ => return vec![],
    };
    let re = match Regex::new(r) {
        Ok(re) => re,
        Err(_) => return vec![],
    };
    let mut out = vec![];
    for c in re.captures_iter(src) {
        let mth = c
            .get(1)
            .map(|x| x.as_str().to_uppercase())
            .unwrap_or_default();
        let p = c.get(2).map(|x| x.as_str().to_string()).unwrap_or_default();
        if !mth.is_empty() && !p.is_empty() {
            out.push((mth, p));
        }
    }
    out
}

fn service_of(rel: &str) -> String {
    rel.split('/').next().unwrap_or("unknown").to_string()
}

pub struct SynCode {
    cfg: SynCodeCfg,
    tx: Tx,
    m: Arc<M>,
    run: Arc<AtomicBool>,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl SynCode {
    pub fn new(cfg: SynCodeCfg, tx: Tx) -> Self {
        Self {
            cfg,
            tx,
            m: M::new(),
            run: Arc::new(AtomicBool::new(false)),
            task: Mutex::new(None),
        }
    }

    pub async fn rescan(&self) {
        scan(&self.cfg, &self.tx, &self.m).await;
    }
}

#[async_trait]
impl Prod for SynCode {
    async fn start(&self) {
        if self.run.swap(true, Ordering::SeqCst) {
            return;
        }
        let cfg = self.cfg.clone();
        let tx = self.tx.clone();
        let m = self.m.clone();
        let run = self.run.clone();
        let h = tokio::spawn(async move {
            log::evt("start", "syn_code");
            scan(&cfg, &tx, &m).await;
            while run.load(Ordering::SeqCst) {
                sleep(Duration::from_secs(30)).await;
                log::hb("syn_code", &m.snap());
            }
            log::evt("stop", "syn_code");
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

async fn scan(cfg: &SynCodeCfg, tx: &Tx, m: &Arc<M>) {
    let meta: HashMap<String, Meta> = match fs::read(&cfg.meta).await {
        Ok(b) => match serde_json::from_slice(&b) {
            Ok(v) => v,
            Err(e) => {
                m.err();
                log::err("syn_code", &e.to_string());
                return;
            }
        },
        Err(e) => {
            m.err();
            log::err("syn_code", &e.to_string());
            return;
        }
    };

    let repo = cfg
        .dir
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut stack: Vec<PathBuf> = vec![cfg.dir.clone()];
    while let Some(p) = stack.pop() {
        let mut rd = match fs::read_dir(&p).await {
            Ok(r) => r,
            Err(e) => {
                m.err();
                log::err("syn_code", &e.to_string());
                continue;
            }
        };
        loop {
            let ent = match rd.next_entry().await {
                Ok(Some(e)) => e,
                Ok(None) => break,
                Err(e) => {
                    m.err();
                    log::err("syn_code", &e.to_string());
                    break;
                }
            };
            let ep = ent.path();
            let ft = match ent.file_type().await {
                Ok(t) => t,
                Err(_) => continue,
            };
            if ft.is_dir() {
                stack.push(ep);
                continue;
            }
            let rel = ep
                .strip_prefix(&cfg.dir)
                .unwrap_or(&ep)
                .to_string_lossy()
                .to_string();
            let md = match meta.get(&rel) {
                Some(x) => x,
                None => continue,
            };
            let body = match fs::read_to_string(&ep).await {
                Ok(s) => s,
                Err(e) => {
                    m.err();
                    log::err("syn_code", &e.to_string());
                    continue;
                }
            };
            let svc = service_of(&rel);
            let routes = parse_routes(&body, &md.runtime);
            for (mth, path) in routes {
                let ev = Code {
                    timestamp: chrono::Utc::now(),
                    repo_name: repo.clone(),
                    commit_sha: "synthetic".into(),
                    endpoint_path: path,
                    method: mth,
                    service: svc.clone(),
                    file_path: rel.clone(),
                    last_commit_date: md.last_commit_date,
                    last_author: md.last_author.clone(),
                    runtime: md.runtime.clone(),
                    runtime_version: md.runtime_version.clone(),
                };
                push(
                    tx,
                    m,
                    Tagged {
                        event_source: Src::SynCode,
                        event: Event::Code(ev),
                    },
                );
            }
        }
    }
}
