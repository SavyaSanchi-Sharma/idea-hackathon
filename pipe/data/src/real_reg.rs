use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use async_trait::async_trait;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{sleep, Duration};
use crate::cfg::{RealRegCfg, RegMode};
use crate::events::{Event, Src, Tagged};
use crate::log;
use crate::metrics::{M, Snap};
use crate::prod::Prod;
use crate::queue::{push, Tx};
use crate::syn_reg::{diff_emit, key, to_ev, Entry};

#[derive(Clone)]
struct St {
    tx: Tx,
    m: Arc<M>,
}

#[derive(Deserialize)]
struct WhBody {
    changes: Vec<WhChange>,
}

#[derive(Deserialize)]
struct WhChange {
    change_type: String,
    #[serde(flatten)]
    entry: Entry,
}

pub struct RealReg {
    cfg: RealRegCfg,
    tx: Tx,
    m: Arc<M>,
    run: Arc<AtomicBool>,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl RealReg {
    pub fn new(cfg: RealRegCfg, tx: Tx) -> Self {
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
impl Prod for RealReg {
    async fn start(&self) {
        if self.run.swap(true, Ordering::SeqCst) {
            return;
        }
        let mode = self.cfg.mode.clone();
        let tx = self.tx.clone();
        let m = self.m.clone();
        let run = self.run.clone();
        let h = match mode {
            RegMode::Poll { url, secs } => tokio::spawn(async move {
                log::evt("start", "real_reg_poll");
                let mut state: HashMap<String, Entry> = HashMap::new();
                let mut first = true;
                let client = reqwest::Client::new();
                while run.load(Ordering::SeqCst) {
                    match client.get(&url).send().await {
                        Ok(r) => match r.json::<Vec<Entry>>().await {
                            Ok(v) => {
                                let next: HashMap<String, Entry> =
                                    v.into_iter().map(|e| (key(&e), e)).collect();
                                if first {
                                    for e in next.values() {
                                        push(
                                            &tx,
                                            &m,
                                            Tagged {
                                                event_source: Src::RealRegistry,
                                                event: Event::Registry(to_ev(e, "added")),
                                            },
                                        );
                                    }
                                    first = false;
                                } else {
                                    diff_emit(&state, &next, Src::RealRegistry, &tx, &m);
                                }
                                state = next;
                            }
                            Err(e) => {
                                m.err();
                                log::err("real_reg", &e.to_string());
                            }
                        },
                        Err(e) => {
                            m.err();
                            log::err("real_reg", &e.to_string());
                        }
                    }
                    let mut left = secs;
                    while left > 0 && run.load(Ordering::SeqCst) {
                        let chunk = left.min(30);
                        sleep(Duration::from_secs(chunk)).await;
                        log::hb("real_reg", &m.snap());
                        left -= chunk;
                    }
                }
                log::evt("stop", "real_reg_poll");
            }),
            RegMode::Webhook { bind, path } => tokio::spawn(async move {
                log::evt("start", "real_reg_wh");
                let st = St { tx: tx.clone(), m: m.clone() };
                let app: Router = Router::new().route(&path, post(wh)).with_state(st);
                let addr: SocketAddr = match bind.parse() {
                    Ok(a) => a,
                    Err(e) => {
                        m.err();
                        log::err("real_reg", &e.to_string());
                        return;
                    }
                };
                let listener = match tokio::net::TcpListener::bind(addr).await {
                    Ok(l) => l,
                    Err(e) => {
                        m.err();
                        log::err("real_reg", &e.to_string());
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
                log::evt("stop", "real_reg_wh");
            }),
        };
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

async fn wh(State(st): State<St>, Json(b): Json<WhBody>) -> StatusCode {
    for c in b.changes {
        push(
            &st.tx,
            &st.m,
            Tagged {
                event_source: Src::RealRegistry,
                event: Event::Registry(to_ev(&c.entry, &c.change_type)),
            },
        );
    }
    StatusCode::ACCEPTED
}
