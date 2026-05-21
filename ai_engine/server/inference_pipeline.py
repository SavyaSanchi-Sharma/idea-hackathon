"""Run the unified inference once at startup and cache the result.

Mirrors train/models/inference.py so the server uses the same code path as
the offline tool. We pull predictions + the source feature rows together,
because the frontend Endpoint schema is richer than the raw model output
and needs both.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]  # ai_engine/
TRAIN = ROOT / "train"
DATA = TRAIN / "data" / "generated"
MODELS = TRAIN / "models"

# Reuse the deterministic rule classifier from the training package.
sys.path.insert(0, str(MODELS / "classifier"))
from rule import classify_batch  # noqa: E402

CLF_NUMERIC = ["schema_count", "last_seen_days", "call_count_7d",
               "auth_fail_rate_7d", "p95_latency_ms", "last_deploy_days", "max_cvss"]
CLF_CAT = ["auth_scheme", "runtime", "version_path"]
REG_NUMERIC = ["schema_count", "deprecated_flag", "in_registry", "last_seen_days",
               "call_count_7d", "auth_fail_rate_7d", "p95_latency_ms",
               "last_deploy_days", "owner_present"]
REG_CAT = ["auth_scheme", "runtime", "version_path"]
LABEL_MAP_INV = {0: "active", 1: "deprecated", 2: "orphaned"}
WEAK_AUTH = {"none", "apiKey", "basic", "apiKey|basic"}


# Module-level model cache. Loaded once on first call, shared between
# `run_inference()` (batch over the static CSV) and `predict_one()` (single
# row from the live-ingest aggregator).
_MODELS: dict | None = None


def _load_models() -> dict:
    global _MODELS
    if _MODELS is None:
        _MODELS = {
            "clf_pre": joblib.load(MODELS / "classifier" / "artifacts" / "preprocessor.joblib"),
            "clf": joblib.load(MODELS / "classifier" / "artifacts" / "model.joblib"),
            "reg_pre": joblib.load(MODELS / "regressor" / "artifacts" / "preprocessor.joblib"),
            "reg": joblib.load(MODELS / "regressor" / "artifacts" / "model.joblib"),
        }
    return _MODELS


def risk_band(score: float) -> str:
    if score >= 90:
        return "critical"
    if score >= 75:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def owasp_findings(row) -> list[str]:
    import re
    f: list[str] = []
    if row["auth_scheme"] == "none" or row["auth_fail_rate_7d"] > 0.10:
        f.append("API2:Broken-Authentication")
    if row["max_cvss"] >= 7.0:
        f.append("API8:Security-Misconfiguration")
    if row["in_registry"] == 0:
        f.append("API9:Improper-Inventory-Management")
    elif row["deprecated_flag"] == 1 and row["call_count_7d"] > 0:
        f.append("API9:Improper-Inventory-Management")
    elif row["last_deploy_days"] > 365 and row["owner_present"] == 0:
        f.append("API9:Improper-Inventory-Management")
    if re.search(r"\{\w*[Ii]d\}", row["endpoint"]) and row["auth_scheme"] in WEAK_AUTH:
        f.append("API1:BOLA")
    if row["p95_latency_ms"] > 1000:
        f.append("API4:Unrestricted-Resource-Consumption")
    if row["last_deploy_days"] > 720 and row["max_cvss"] >= 7.0:
        f.append("API10:Unsafe-Consumption-Of-APIs")
    return f


def _seq_features(seq: pd.DataFrame) -> list[float]:
    seq = seq.sort_values("day")
    calls = seq["call_count"].values.astype(float)
    af = seq["auth_fail_rate"].values
    lat = seq["p95_latency_ms"].values
    half = len(calls) // 2
    return [
        float(calls.mean()),
        float(calls.std()),
        float((calls.max() + 1) / (calls.min() + 1)),
        float(calls[-1] - calls[0]),
        float(calls[:half].mean()),
        float(calls[half:].mean()),
        float((calls[half:].mean() + 1) / (calls[:half].mean() + 1)),
        float(np.percentile(calls, 95) - np.percentile(calls, 5)),
        float(af.mean()),
        float(af.std()),
        float(af.max()),
        float(lat.mean()),
        float(lat.std()),
        float(lat.max()),
    ]


@dataclass
class InferenceResult:
    """Per-endpoint joined view: source features + model predictions + sequence."""
    features: pd.DataFrame          # one row per endpoint, raw features
    predictions: pd.DataFrame       # one row per endpoint, model outputs
    sparklines: dict[int, list[int]]  # endpoint_id → 30-day call_count
    trend_pct: dict[int, float]     # endpoint_id → (second-half mean / first-half mean - 1) × 100
    sequences: dict[int, list[dict]]  # endpoint_id → full 30-day rows for detail charts


def run_inference() -> InferenceResult:
    features = pd.read_csv(DATA / "lifecycle_training.csv")
    sequences = pd.read_csv(DATA / "lifecycle_sequences.csv")
    features["version_path"] = features["version_path"].astype(str)

    m = _load_models()

    # --- classifier ML pass
    X_clf = m["clf_pre"].transform(features[CLF_NUMERIC + CLF_CAT])
    ml_pred = m["clf"].predict(X_clf)
    ml_proba = m["clf"].predict_proba(X_clf)
    ml_state = [LABEL_MAP_INV[i] for i in ml_pred]
    ml_confidence = ml_proba.max(axis=1)

    # --- deterministic rule pass
    rule = classify_batch(features)

    # --- regressor pass
    X_reg = m["reg_pre"].transform(features[REG_NUMERIC + REG_CAT])
    risk = np.clip(m["reg"].predict(X_reg), 0, 100)

    # --- anomaly pass (per endpoint from 30-day sequence)
    anom_scaler = joblib.load(MODELS / "anomaly" / "artifacts" / "scaler.joblib")
    anom_model = joblib.load(MODELS / "anomaly" / "artifacts" / "model.joblib")
    seq_rows = []
    sparklines: dict[int, list[int]] = {}
    trend_pct: dict[int, float] = {}
    full_sequences: dict[int, list[dict]] = {}
    for ep_id, group in sequences.groupby("endpoint_id"):
        seq_rows.append({"endpoint_id": int(ep_id), "_features": _seq_features(group)})
        ordered = group.sort_values("day")
        sparklines[int(ep_id)] = ordered["call_count"].astype(int).tolist()
        first = ordered["call_count"].iloc[: len(ordered) // 2].mean()
        second = ordered["call_count"].iloc[len(ordered) // 2 :].mean()
        trend_pct[int(ep_id)] = float(((second + 1) / (first + 1) - 1) * 100)
        full_sequences[int(ep_id)] = [
            {
                "day": int(r["day"]),
                "call_count": int(r["call_count"]),
                "auth_fail_rate": float(r["auth_fail_rate"]),
                "p95_latency_ms": float(r["p95_latency_ms"]),
            }
            for _, r in ordered.iterrows()
        ]
    seq_index = pd.DataFrame(seq_rows)
    anom_X = anom_scaler.transform(np.array(seq_index["_features"].tolist()))
    seq_index["anomaly_flag"] = (anom_model.predict(anom_X) == -1).astype(int)
    seq_index["anomaly_score"] = -anom_model.score_samples(anom_X)
    anom_join = features[["endpoint_id"]].merge(
        seq_index[["endpoint_id", "anomaly_flag", "anomaly_score"]],
        on="endpoint_id", how="left",
    )

    findings = features.apply(lambda r: "|".join(owasp_findings(r)), axis=1)
    finding_count = findings.apply(lambda s: 0 if s == "" else len(s.split("|")))

    predictions = pd.DataFrame({
        "endpoint_id": features["endpoint_id"].values,
        "rule_state": rule["rule_state"].values,
        "rule_is_zombie": rule["rule_is_zombie"].values,
        "rule_is_shadow": rule["rule_is_shadow"].values,
        "rule_reason": rule["rule_reason"].values,
        "ml_state": ml_state,
        "ml_confidence": np.round(ml_confidence, 4),
        "needs_review": (rule["rule_state"].values != np.array(ml_state)).astype(int),
        "risk_score": np.round(risk, 2),
        "risk_band": [risk_band(r) for r in risk],
        "anomaly_flag": anom_join["anomaly_flag"].fillna(0).astype(int).values,
        "anomaly_score": anom_join["anomaly_score"].round(4).values,
        "owasp_findings": findings.values,
        "finding_count": finding_count.values,
    })

    return InferenceResult(
        features=features,
        predictions=predictions,
        sparklines=sparklines,
        trend_pct=trend_pct,
        sequences=full_sequences,
    )


# ─── single-row inference for live-ingest endpoints ─────────────────────────

# Defaults for log-invisible feature columns. The aggregator fills what logs
# can show (call_count_7d, auth_fail_rate_7d, p95_latency_ms, last_seen_days,
# method, path); the rest fall back to these — overridden by the per-site
# registration where the user supplied real values (runtime, runtime_version,
# service, owner_present).
LIVE_FEATURE_DEFAULTS: dict = {
    "schema_count": 1,
    "deprecated_flag": 0,
    "in_registry": 1,
    "owner_present": 1,
    "last_deploy_days": 30.0,
    "max_cvss": 0.0,
    "cve_id": "",
    "auth_scheme": "http:bearer",
    "runtime": "python",
    "runtime_version": "3.11",
    "version_path": "v1",
    "service": "payments",
}


def predict_one(features: dict, endpoint_uid: str) -> dict:
    """Run the 3-model pipeline on one feature dict and return a frontend Endpoint.

    `features` may be a partial dict; missing keys are filled from
    LIVE_FEATURE_DEFAULTS. `endpoint_uid` becomes the frontend `id` (overrides
    the synthetic ep_NNNN that `to_endpoint` would otherwise generate).

    Anomaly is skipped — that model needs a 30-day sequence we don't have for
    a freshly-discovered live endpoint. anomaly_flag=0, anomaly_score=None.
    """
    # local import to avoid circular: mapping imports nothing from this file,
    # but keeping inference_pipeline import-light is helpful for tooling.
    from .mapping import to_endpoint

    row = {**LIVE_FEATURE_DEFAULTS, **features}
    # endpoint_id is required by to_endpoint() (it's used to derive a synthetic
    # specimen_id and the static ep_NNNN id). Hash uid → stable int outside the
    # static 0–9999 range so it never collides with the CSV-loaded endpoints.
    row.setdefault("endpoint_id", 100_000_000 + (hash(endpoint_uid) & 0x7FFFFFFF) % 9_000_000)
    row.setdefault("endpoint", "/unknown")
    row.setdefault("method", "GET")

    feat_df = pd.DataFrame([row])

    m = _load_models()
    X_clf = m["clf_pre"].transform(feat_df[CLF_NUMERIC + CLF_CAT])
    ml_pred = m["clf"].predict(X_clf)
    ml_proba = m["clf"].predict_proba(X_clf)
    ml_state = LABEL_MAP_INV[int(ml_pred[0])]
    ml_conf = float(ml_proba.max(axis=1)[0])

    rule = classify_batch(feat_df)

    X_reg = m["reg_pre"].transform(feat_df[REG_NUMERIC + REG_CAT])
    risk = float(np.clip(m["reg"].predict(X_reg)[0], 0, 100))

    findings = "|".join(owasp_findings(feat_df.iloc[0]))
    finding_count = 0 if findings == "" else len(findings.split("|"))

    pred_row = pd.Series({
        "endpoint_id": row["endpoint_id"],
        "rule_state": rule["rule_state"].iloc[0],
        "rule_is_zombie": int(rule["rule_is_zombie"].iloc[0]),
        "rule_is_shadow": int(rule["rule_is_shadow"].iloc[0]),
        "rule_reason": rule["rule_reason"].iloc[0],
        "ml_state": ml_state,
        "ml_confidence": round(ml_conf, 4),
        "needs_review": int(rule["rule_state"].iloc[0] != ml_state),
        "risk_score": round(risk, 2),
        "risk_band": risk_band(risk),
        "anomaly_flag": 0,
        "anomaly_score": np.nan,
        "owasp_findings": findings,
        "finding_count": finding_count,
    })

    endpoint = to_endpoint(feat_df.iloc[0], pred_row, sparkline=[], trend_pct=0.0)
    endpoint["id"] = endpoint_uid
    endpoint["from_live"] = True
    return endpoint
