use std::collections::HashMap;
use std::path::Path;
use crate::error::EndpointStoreError;

pub struct CveTable {
    map: HashMap<(String, String), Vec<(f32, String)>>,
}

impl CveTable {
    pub fn empty() -> Self {
        Self { map: HashMap::new() }
    }

    pub fn load(path: &Path) -> Result<Self, EndpointStoreError> {
        let mut map: HashMap<(String, String), Vec<(f32, String)>> = HashMap::new();
        let mut rdr = csv::Reader::from_path(path)
            .map_err(|e| EndpointStoreError::CveLoad(e.to_string()))?;
        for rec in rdr.records() {
            let rec = rec.map_err(|e| EndpointStoreError::CveLoad(e.to_string()))?;
            let runtime = rec.get(0).unwrap_or("").trim().to_lowercase();
            let version = rec.get(1).unwrap_or("").trim().to_string();
            let cve_id = rec.get(2).unwrap_or("").trim().to_string();
            let cvss: f32 = rec.get(3).unwrap_or("0").trim().parse().unwrap_or(0.0);
            if runtime.is_empty() || version.is_empty() {
                continue;
            }
            map.entry((runtime, version)).or_default().push((cvss, cve_id));
        }
        Ok(Self { map })
    }

    pub fn len(&self) -> usize {
        self.map.values().map(|v| v.len()).sum()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    pub fn lookup(&self, runtime: Option<&str>, version: Option<&str>) -> (f32, Vec<String>) {
        let rt = match runtime {
            Some(r) if !r.is_empty() => r.to_lowercase(),
            _ => return (0.0, vec![]),
        };
        let ver = match version {
            Some(v) if !v.is_empty() => v.to_string(),
            _ => return (0.0, vec![]),
        };
        let key = (rt, ver);
        let entries = match self.map.get(&key) {
            Some(e) => e,
            None => return (0.0, vec![]),
        };
        let max_cvss = entries.iter().map(|(c, _)| *c).fold(0.0_f32, f32::max);
        let ids: Vec<String> = entries.iter().map(|(_, id)| id.clone()).collect();
        (max_cvss, ids)
    }
}
