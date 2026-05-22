use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequenceRow {
    pub endpoint_id: i64,
    pub day: i32,
    pub call_count: i64,
    pub auth_fail_rate: f64,
    pub p95_latency_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SequenceBatch(pub Vec<SequenceRow>);

impl SequenceBatch {
    pub fn new(rows: Vec<SequenceRow>) -> Self {
        Self(rows)
    }
    pub fn len(&self) -> usize {
        self.0.len()
    }
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sequence_roundtrip() {
        let r = SequenceRow {
            endpoint_id: 11,
            day: 0,
            call_count: 500,
            auth_fail_rate: 0.04,
            p95_latency_ms: 120.0,
        };
        let s = serde_json::to_string(&r).unwrap();
        let back: SequenceRow = serde_json::from_str(&s).unwrap();
        assert_eq!(back.day, 0);
        assert_eq!(back.call_count, 500);
    }

    #[test]
    fn batch_empty_is_empty() {
        let b: SequenceBatch = SequenceBatch::default();
        assert!(b.is_empty());
        assert_eq!(b.len(), 0);
    }
}
