use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use async_trait::async_trait;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{sleep, Duration, Instant};
use crate::cfg::RealTrafCfg;
use crate::events::{Event, Src, Tagged, Traffic};
use crate::log;
use crate::metrics::{M, Snap};
use crate::prod::Prod;
use crate::queue::{push_blocking, Tx};

pub struct RealTraf {
    cfg: RealTrafCfg,
    tx: Tx,
    m: Arc<M>,
    run: Arc<AtomicBool>,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl RealTraf {
    pub fn new(cfg: RealTrafCfg, tx: Tx) -> Self {
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
impl Prod for RealTraf {
    async fn start(&self) {
        if self.run.swap(true, Ordering::SeqCst) {
            return;
        }
        let cfg = self.cfg.clone();
        let tx = self.tx.clone();
        let m = self.m.clone();
        let run = self.run.clone();
        let h = tokio::spawn(async move {
            log::evt("start", "real_traf");
            let mut backoff = 1u64;
            let mut hb_at = Instant::now();
            while run.load(Ordering::SeqCst) {
                let s = match TcpStream::connect(&cfg.broker).await {
                    Ok(s) => s,
                    Err(e) => {
                        m.err();
                        log::err("real_traf", &e.to_string());
                        sleep(Duration::from_secs(backoff)).await;
                        backoff = (backoff * 2).min(30);
                        continue;
                    }
                };
                backoff = 1;
                let mut r = BufReader::new(s).lines();
                loop {
                    if !run.load(Ordering::SeqCst) {
                        break;
                    }
                    if hb_at.elapsed() >= Duration::from_secs(30) {
                        log::hb("real_traf", &m.snap());
                        hb_at = Instant::now();
                    }
                    match r.next_line().await {
                        Ok(Some(line)) => match translate(&line, &cfg.gateway) {
                            Some(t) => {
                                push_blocking(
                                    &tx,
                                    &m,
                                    Tagged {
                                        event_source: Src::RealTraffic,
                                        event: Event::Traffic(t),
                                    },
                                )
                                .await;
                            }
                            None => {
                                m.err();
                            }
                        },
                        Ok(None) => break,
                        Err(e) => {
                            m.err();
                            log::err("real_traf", &e.to_string());
                            break;
                        }
                    }
                }
            }
            log::evt("stop", "real_traf");
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

fn translate(line: &str, gw: &str) -> Option<Traffic> {
    let v: Value = serde_json::from_str(line).ok()?;
    if let Ok(t) = serde_json::from_value::<Traffic>(v.clone()) {
        return Some(t);
    }
    match gw {
        "kong" => kong(&v),
        _ => None,
    }
}

fn kong(v: &Value) -> Option<Traffic> {
    let req = v.get("request")?;
    let resp = v.get("response")?;
    let lat = v
        .get("latencies")
        .and_then(|x| x.get("request"))
        .and_then(|x| x.as_u64())
        .unwrap_or(0);
    let ts_ms = v.get("started_at").and_then(|x| x.as_u64()).unwrap_or(0);
    let ts = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ts_ms as i64)
        .unwrap_or_else(chrono::Utc::now);
    let ah = req
        .get("headers")
        .and_then(|h| h.get("authorization"))
        .and_then(|s| s.as_str())
        .unwrap_or("");
    let auth = if ah.is_empty() {
        "none"
    } else if ah.starts_with("Bearer") {
        "oauth2"
    } else if ah.starts_with("Basic") {
        "basic"
    } else {
        "api_key"
    };
    Some(Traffic {
        timestamp: ts,
        request_id: uuid::Uuid::new_v4(),
        method: req.get("method")?.as_str()?.to_string(),
        path: req.get("uri")?.as_str()?.to_string(),
        status_code: resp.get("status")?.as_u64()? as u16,
        latency_ms: lat as u32,
        client_id: v
            .get("client_ip")
            .and_then(|x| x.as_str())
            .unwrap_or("unknown")
            .into(),
        auth_scheme: auth.into(),
        upstream_service: v
            .get("service")
            .and_then(|s| s.get("name"))
            .and_then(|s| s.as_str())
            .unwrap_or("unknown")
            .into(),
        bytes_in: req.get("size").and_then(|x| x.as_u64()).unwrap_or(0),
        bytes_out: resp.get("size").and_then(|x| x.as_u64()).unwrap_or(0),
    })
}
