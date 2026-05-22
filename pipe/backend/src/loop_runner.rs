use std::time::Duration;
use data::{Rx, Tagged};
use crate::state::AppState;

pub async fn run(mut rx: Rx, state: AppState) {
    let cap = state.cfg.loop_cfg.batch_size_hint;
    let win = Duration::from_secs(state.cfg.loop_cfg.window_secs);
    let mut window: Vec<Tagged> = Vec::with_capacity(cap);
    let mut ticker = tokio::time::interval(win);
    ticker.tick().await;
    crate::log::start_who("loop_runner");
    loop {
        tokio::select! {
            maybe = rx.recv() => {
                match maybe {
                    Some(tagged) => {
                        window.push(tagged);
                        if window.len() >= cap {
                            let batch = std::mem::take(&mut window);
                            crate::process_batch::run(&state, batch).await;
                        }
                    }
                    None => break,
                }
            }
            _ = ticker.tick() => {
                if !window.is_empty() {
                    let batch = std::mem::take(&mut window);
                    crate::process_batch::run(&state, batch).await;
                }
            }
        }
    }
}
