use std::sync::Arc;
use tokio::sync::mpsc;
use crate::events::Tagged;
use crate::metrics::M;

pub type Tx = mpsc::Sender<Tagged>;
pub type Rx = mpsc::Receiver<Tagged>;

pub fn make(cap: usize) -> (Tx, Rx) {
    mpsc::channel(cap)
}

pub fn push(tx: &Tx, m: &Arc<M>, ev: Tagged) {
    match tx.try_send(ev) {
        Ok(_) => m.ok(),
        Err(_) => m.drop1(),
    }
}

pub async fn push_blocking(tx: &Tx, m: &Arc<M>, ev: Tagged) {
    match tx.send(ev).await {
        Ok(_) => m.ok(),
        Err(_) => m.drop1(),
    }
}
