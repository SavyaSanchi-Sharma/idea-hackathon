use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use async_trait::async_trait;
use serde::Deserialize;
use tokio::fs;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{sleep, Duration};
use crate::cfg::SynRegCfg;
use crate::events::{Event, Registry, Src, Tagged};
use crate::log;
use crate::metrics::{M, Snap};
use crate::prod::Prod;
use crate::queue::{push, Tx};

#[derive(Deserialize, Clone, PartialEq, Eq)]
pub struct Entry {
    pub endpoint_path: String,
    pub method: String,
    pub version: Option<String>,
    pub service: String,
    pub owner_team: Option<String>,
    pub auth_required: String,
    pub deprecated_flag: bool,
    pub sunset_date: Option<chrono::DateTime<chrono::Utc>>,
    pub last_modified: chrono::DateTime<chrono::Utc>,
}

pub fn key(e: &Entry) -> String {
    format!("{}|{}|{}", e.endpoint_path, e.method, e.service)
}

pub fn to_ev(e: &Entry, c: &str) -> Registry {
    Registry {
        timestamp: chrono::Utc::now(),
        change_type: c.into(),
        endpoint_path: e.endpoint_path.clone(),
        method: e.method.clone(),
        version: e.version.clone(),
        service: e.service.clone(),
        owner_team: e.owner_team.clone(),
        auth_required: e.auth_required.clone(),
        deprecated_flag: e.deprecated_flag,
        sunset_date: e.sunset_date,
        last_modified: e.last_modified,
    }
}

pub fn diff_emit(prev: &HashMap<String, Entry>, next: &HashMap<String, Entry>, src: Src, tx: &Tx, m: &Arc<M>) {
    for (k, e) in next {
        match prev.get(k) {
            None => push(tx, m, Tagged { event_source: src, event: Event::Registry(to_ev(e, "added")) }),
            Some(p) if p != e => push(tx, m, Tagged { event_source: src, event: Event::Registry(to_ev(e, "modified")) }),
            _ => {}
        }
    }
    for (k, p) in prev {
        if !next.contains_key(k) {
            push(tx, m, Tagged { event_source: src, event: Event::Registry(to_ev(p, "deleted")) });
        }
    }
}

pub struct SynReg {
    cfg: SynRegCfg,
    tx: Tx,
    m: Arc<M>,
    run: Arc<AtomicBool>,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl SynReg {
    pub fn new(cfg: SynRegCfg, tx: Tx) -> Self {
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
impl Prod for SynReg {
    async fn start(&self) {
        if self.run.swap(true, Ordering::SeqCst) {
            return;
        }
        let cfg = self.cfg.clone();
        let tx = self.tx.clone();
        let m = self.m.clone();
        let run = self.run.clone();
        let h = tokio::spawn(async move {
            log::evt("start", "syn_reg");
            let mut state: HashMap<String, Entry> = HashMap::new();
            let mut first = true;
            while run.load(Ordering::SeqCst) {
                match fs::read(&cfg.file).await {
                    Ok(b) => match serde_json::from_slice::<Vec<Entry>>(&b) {
                        Ok(v) => {
                            let next: HashMap<String, Entry> =
                                v.into_iter().map(|e| (key(&e), e)).collect();
                            if first {
                                for e in next.values() {
                                    push(
                                        &tx,
                                        &m,
                                        Tagged {
                                            event_source: Src::SynRegistry,
                                            event: Event::Registry(to_ev(e, "added")),
                                        },
                                    );
                                }
                                first = false;
                            } else {
                                diff_emit(&state, &next, Src::SynRegistry, &tx, &m);
                            }
                            state = next;
                        }
                        Err(e) => {
                            m.err();
                            log::err("syn_reg", &e.to_string());
                        }
                    },
                    Err(e) => {
                        m.err();
                        log::err("syn_reg", &e.to_string());
                    }
                }
                let mut left = cfg.poll_secs;
                while left > 0 && run.load(Ordering::SeqCst) {
                    let chunk = left.min(30);
                    sleep(Duration::from_secs(chunk)).await;
                    log::hb("syn_reg", &m.snap());
                    left -= chunk;
                }
            }
            log::evt("stop", "syn_reg");
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
