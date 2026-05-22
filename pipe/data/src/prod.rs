use async_trait::async_trait;
use crate::metrics::Snap;

#[async_trait]
pub trait Prod: Send + Sync {
    async fn start(&self);
    async fn stop(&self);
    fn health(&self) -> Snap;
}
