# Zombie API Discovery — Model Training

Three production components serving different roles in the lifecycle decision.

| Component | Role | Algorithm | Output |
|---|---|---|---|
| **classifier/rule.py** | **source of truth** (auditable, exact) | deterministic 3-rule policy | `active` / `deprecated` / `orphaned` + reason |
| **classifier/model.joblib** | **discovery** (catches what registry got wrong) | HistGradientBoostingClassifier on telemetry | same 3-class output |
| **regressor/** | risk score 0-100 | HistGradientBoostingRegressor | float + band (low/medium/high/critical) |
| **anomaly/** | behavior change detector | IsolationForest on 30-day sequences | binary anomaly flag |

## The rule + ML dual setup (classifier directory)

The classifier directory contains **both** a deterministic rule and a trained ML model. They serve different purposes:

- **The rule reads the registry's metadata directly.** If `owner_present=0` it returns `orphaned`. If `deprecated_flag=1` it returns `deprecated`. It is exact, auditable, and trivially correct *when the metadata is correct*.
- **The ML model reads telemetry and structural features.** Traffic, latency, deploy age, auth scheme, runtime — soft signals that betray the lifecycle state without depending on registry hygiene.

**The interesting endpoints are where they disagree.** Disagreement means one of two things: (a) registry metadata is stale or wrong, and the ML model has correctly inferred the true state from behavior, or (b) the endpoint is behaviorally anomalous and the registry happens to be right. Both cases route to a human review queue. On our test split, **rule ↔ ML agreement is 94.5%** and the remaining 5.5% (21 endpoints) is precisely the review queue.

Use `compare.py` to generate the review queue from any test split.

## Run any component independently

```bash
cd models/<classifier|regressor|anomaly>
python preprocess.py        # → artifacts/{preprocessor,splits}.joblib
python train.py             # → artifacts/model.joblib  (default hyperparameters)
python test.py              # → artifacts/metrics.json
python tune.py              # → grid search; overwrites model.joblib + best_params.json
```

Classifier-only extras:
```bash
cd models/classifier
python rule.py              # apply deterministic rule, print agreement with labels
python compare.py           # rule vs ML on held-out test → artifacts/rule_vs_ml.csv
```

## Current numbers (with `SEED=42`, after de-leakage fix)

| Component | Metric | Value |
|---|---|---|
| classifier rule | label agreement on full set | 96.1% (4% gap = boundary-noise rows) |
| classifier ML  | test accuracy | 98.7% |
| classifier ML  | macro F1      | 0.993 |
| **rule ↔ ML agreement (test)** | | **94.5%** |
| **review queue size (test)**   | | **21 / 384** |
| regressor | test R² (max_cvss held out) | 0.95 |
| regressor | MAE on 0-100 scale | ~5 |
| anomaly   | test ROC-AUC | 0.93 |
| anomaly   | test F1 | 0.54 |

## Caveats (honest ML notes)

1. **Synthetic-data ceiling.** The classifier and regressor scores would be 85-92% / R² 0.75-0.85 on real banking telemetry — the synthetic generator produces near-non-overlapping per-scenario distributions, so models can over-fit the geometry of the generator's ranges. Two ways to lower the ceiling honestly: bump `BOUNDARY_RATE` (currently 0.12) in the lifecycle cell, OR add label noise in classifier `preprocess.py`. See `DATA.md` §6 for details.
2. **Regressor target leakage.** `risk_score` is computed deterministically from features with σ=5 Gaussian noise. Holding out `max_cvss` reduced R² from 0.99 → 0.94. Holding out `auth_fail_rate_7d` too would drop it further (~0.80). Decide based on whether you want the regressor to be honest or impressive.
3. **Anomaly difficulty too easy.** Sequence anomalies multiply call_count by 0.1 or 3.0 — 10× shifts are visually obvious. F1=0.54 is not lower because the model is bad; it's because contamination=0.10 produces some false positives by design. Tune the threshold for higher precision if needed.

## Dependencies

`scikit-learn >= 1.8`, `joblib`, `pandas`, `numpy`. Use the `zombie` conda env:

```bash
conda activate zombie  # or: /home/guy_who_likes_to_code/miniconda3/envs/zombie/bin/python
```
