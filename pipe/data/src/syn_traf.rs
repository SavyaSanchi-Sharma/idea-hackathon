use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use async_trait::async_trait;
use tokio::fs::File;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{sleep, Duration, Instant};
use crate::cfg::SynTrafCfg;
use crate::events::{Event, Src, Tagged, Traffic};
use crate::log;
use crate::metrics::{M, Snap};
use crate::prod::Prod;
use crate::queue::{push, Tx};

pub struct SynTraf {
    cfg: SynTrafCfg,
    tx: Tx,
    m: Arc<M>,
    rate: Arc<AtomicU32>,
    run: Arc<AtomicBool>,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl SynTraf {
    pub fn new(cfg: SynTrafCfg, tx: Tx) -> Self {
        let rate = Arc::new(AtomicU32::new(cfg.rate.max(1)));
        Self {
            cfg,
            tx,
            m: M::new(),
            rate,
            run: Arc::new(AtomicBool::new(false)),
            task: Mutex::new(None),
        }
    }

    pub fn set_rate(&self, r: u32) {
        self.rate.store(r.max(1), Ordering::Relaxed);
    }
}

#[async_trait]
impl Prod for SynTraf {
    async fn start(&self) {
        if self.run.swap(true, Ordering::SeqCst) {
            return;
        }
        let cfg = self.cfg.clone();
        let tx = self.tx.clone();
        let m = self.m.clone();
        let rate = self.rate.clone();
        let run = self.run.clone();
        let h = tokio::spawn(async move {
            log::evt("start", "syn_traf");
            let mut hb_at = Instant::now();
            'outer: while run.load(Ordering::SeqCst) {
                let f = match File::open(&cfg.file).await {
                    Ok(f) => f,
                    Err(e) => {
                        m.err();
                        log::err("syn_traf", &e.to_string());
                        sleep(Duration::from_secs(2)).await;
                        continue;
                    }
                };
                let mut r = BufReader::new(f).lines();
                let mut prev: Option<chrono::DateTime<chrono::Utc>> = None;
                loop {
                    if !run.load(Ordering::SeqCst) {
                        break 'outer;
                    }
                    if hb_at.elapsed() >= Duration::from_secs(30) {
                        log::hb("syn_traf", &m.snap());
                        hb_at = Instant::now();
                    }
                    let ln = match r.next_line().await {
                        Ok(Some(ln)) => ln,
                        Ok(None) => break,
                        Err(e) => {
                            m.err();
                            log::err("syn_traf", &e.to_string());
                            break;
                        }
                    };
                    if ln.trim().is_empty() {
                        continue;
                    }
                    let t: Traffic = match serde_json::from_str(&ln) {
                        Ok(t) => t,
                        Err(e) => {
                            m.err();
                            log::err("syn_traf", &e.to_string());
                            continue;
                        }
                    };
                    let cur = rate.load(Ordering::Relaxed).max(1) as u64;
                    let floor_ms = 1000 / cur;
                    let wait_ms = match prev {
                        Some(p) => {
                            let d = (t.timestamp - p).num_milliseconds().max(0) as u64;
                            let scaled = (d as f32 / cfg.compress.max(0.001)) as u64;
                            scaled.max(floor_ms).min(5_000)
                        }
                        None => 0,
                    };
                    if wait_ms > 0 {
                        sleep(Duration::from_millis(wait_ms)).await;
                    }
                    prev = Some(t.timestamp);
                    push(
                        &tx,
                        &m,
                        Tagged {
                            event_source: Src::SynTraffic,
                            event: Event::Traffic(t),
                        },
                    );
                }
            }
            log::evt("stop", "syn_traf");
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
