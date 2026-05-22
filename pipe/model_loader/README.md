# `pipe/model_loader`

A Rust crate that loads the three trained scikit-learn artifacts (lifecycle classifier, risk regressor, anomaly detector) through an **embedded** Python interpreter (pyo3 + `auto-initialize`) and exposes async `classify` / `risk` / `anomaly` methods to the rest of the Rust pipeline.

The Python side is a single helper file (`src/python_helper.py`) embedded into the binary at compile time via `include_str!`. It mirrors `ai_engine/train/models/inference.py` verbatim: same column lists (`CLF_NUMERIC`, `CLF_CAT`, `REG_NUMERIC`, `REG_CAT`), same `LABEL_MAP_INV`, same `risk_band` thresholds, same 14-dim sequence-feature construction, same OWASP rule predicates.

## Host requirements

The host machine must have a Python 3 development environment available **before `cargo build`**:

```bash
# Debian / Ubuntu
sudo apt install python3-dev python3-pip

# Arch
sudo pacman -S python python-pip

# Fedora / RHEL
sudo dnf install python3-devel python3-pip
```

pyo3 needs the Python headers (`Python.h`) and the matching `libpython` at link time. `cargo check` alone does not link, but `cargo build` / `cargo test` does.

### pyo3 version vs Python version

| pyo3 | supported Python |
|---|---|
| `0.22` (pinned here) | 3.7 – 3.12 |
| `0.23` | 3.7 – 3.13 |
| `0.24+` | 3.8 – 3.14 |

If your `python3` is newer than 3.12, you have three options:
- **Use the stable ABI forward-compat flag** (verified on Python 3.14): `PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1 cargo build`. This compiles against `abi3` and silences the version check. This crate builds and tests pass cleanly on Python 3.14 with this flag set.
- Install a 3.12 build alongside (`apt install python3.12 python3.12-dev`) and point pyo3 at it: `PYO3_PYTHON=python3.12 cargo build`.
- Bump pyo3 in `Cargo.toml` to a version that supports your Python.

## Python runtime requirements

The embedded interpreter must have these packages installed in its `site-packages`:

```bash
pip install -r requirements.txt
```

Pinned: `scikit-learn==1.7.2`, `joblib>=1.3`, `numpy>=1.26`, `pandas>=2.0`.

`scikit-learn` is hard-pinned because the artifacts in `ai_engine/train/models/*/artifacts/*.joblib` were saved with a specific version. If `joblib.load` warns about cross-minor unpickling, you'll see it in stderr at `ModelLoader::new` and the symptoms (silent prediction drift) are notoriously hard to debug. **Confirm the version against the artifacts** by running:

```bash
python3 -c "import joblib, sklearn; joblib.load('ai_engine/train/models/classifier/artifacts/model.joblib'); print('sklearn:', sklearn.__version__)"
```

`ModelLoader::new(cfg)` reads the loaded `sklearn.__version__` and compares it against `cfg.pinned_sklearn`. Mismatch returns `ModelError::SklearnMismatch` and refuses to start.

## Usage

```rust
use std::path::PathBuf;
use model_loader::{FeatureBatch, ModelLoader, ModelLoaderCfg};

let cfg = ModelLoaderCfg::new(PathBuf::from("ai_engine/train/models"))
    .with_sklearn("1.7.2");
let loader = ModelLoader::new(cfg)?;

let batch: FeatureBatch = /* fill from your inventory */;
let (lifecycle, risk) = tokio::try_join!(
    loader.classify(&batch),
    loader.risk(&batch),
)?;
```

## Concurrency model

`ModelLoader` holds a `Mutex<()>` that serializes every `classify` / `risk` / `anomaly` call before entering `tokio::task::spawn_blocking` and `Python::with_gil`. Python's GIL already serializes execution; the Rust-level mutex makes that backpressure visible at the call site instead of having blocking-pool threads contend invisibly. If you need higher throughput, batch larger; do not try to parallelize across `ModelLoader` instances (the embedded Python interpreter is process-global).

## What's stored vs derived

- `FeatureRow` is the wire shape Rust sends. 17 fields; **`version_path` is derived inside `python_helper.py`** from the endpoint URL via a `/v\d+/` regex before the sklearn preprocessor sees it.
- `Prediction` is the wire shape Python returns. `classify` fills the lifecycle/rule fields and leaves `risk_score=0`/`risk_band="low"`. `risk` fills `risk_score`/`risk_band` and leaves the rule/ML fields blank. The caller (process_batch in `runner`, when that crate exists) merges them.
- `AnomalyPrediction` is `{endpoint_id, anomaly_flag (0/1), anomaly_score}`. Requires the full 30-day sequence window per endpoint.

## Counters

`loader.health()` returns a `Snap` of:
- `classify_calls`, `risk_calls`, `anomaly_calls`
- `rows_processed` (sum of batch sizes)
- `errors_total`
- `last_call_ts` (epoch seconds UTC)

`metrics::spawn_heartbeat(loader.metrics())` returns a `JoinHandle` that logs a JSON-line heartbeat every 30 s.

## Caveats

- **pyo3 0.22 + Python 3.14 will not build.** See the version table above.
- **`build.rs` calls `pyo3_build_config::add_extension_module_link_args()`** as specified, but this is the hook for `cdylib` extension modules — it's a no-op for normal `rlib` builds. Left in place because the spec asked for it; safe to call regardless.
- **The Python helper imports `rule.py` from `<artifacts_root>/classifier/`** at first `classify` call. Make sure that file (the deterministic rule classifier) ships alongside the joblib artifacts on the target host.
