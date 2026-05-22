
"""Unified inference script for all three models.

Loads:
- classifier ML model + preprocessor + deterministic rule
- regressor model + preprocessor
- anomaly model + scaler

Reads:
- a features CSV (one row per endpoint, schema matching lifecycle_training.csv)
- optional sequences CSV (30 rows per endpoint, schema matching lifecycle_sequences.csv)

Writes one unified predictions CSV with rule + ML classifications, agreement
flag, risk score + band, anomaly flag + score, and OWASP findings.

Usage:
    python inference.py --features <features.csv> [--sequences <seq.csv>] [--output <out.csv>]
"""
import argparse
import re
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "classifier"))
from rule import classify_batch  # noqa: E402

CLASSIFIER_DIR = ROOT / "classifier" / "artifacts"
REGRESSOR_DIR = ROOT / "regressor" / "artifacts"
ANOMALY_DIR = ROOT / "anomaly" / "artifacts"

CLF_NUMERIC = ["schema_count", "last_seen_days", "call_count_7d",
               "auth_fail_rate_7d", "p95_latency_ms", "last_deploy_days", "max_cvss"]
CLF_CAT = ["auth_scheme", "runtime", "version_path"]

REG_NUMERIC = ["schema_count", "deprecated_flag", "in_registry", "last_seen_days",
               "call_count_7d", "auth_fail_rate_7d", "p95_latency_ms",
               "last_deploy_days", "owner_present"]
REG_CAT = ["auth_scheme", "runtime", "version_path"]

LABEL_MAP_INV = {0: "active", 1: "deprecated", 2: "orphaned"}
WEAK_AUTH = {"none", "apiKey", "basic", "apiKey|basic"}

REQUIRED_FEATURE_COLS = {"endpoint", "method", "in_registry", "owner_present",
                         "deprecated_flag", "call_count_7d", "auth_scheme",
                         "runtime", "version_path", "schema_count",
                         "last_seen_days", "auth_fail_rate_7d", "p95_latency_ms",
                         "last_deploy_days", "max_cvss"}


def risk_band(score):
    if score >= 90:
        return "critical"
    if score >= 75:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def owasp_findings(row):
    f = []
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


def build_sequence_features(seq):
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


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--features", required=True, help="Endpoint features CSV")
    parser.add_argument("--sequences", help="Optional 30-day sequences CSV for anomaly model")
    parser.add_argument("--output", default="predictions.csv", help="Output CSV path")
    args = parser.parse_args()

    features_df = pd.read_csv(args.features)
    missing = REQUIRED_FEATURE_COLS - set(features_df.columns)
    if missing:
        print(f"ERROR: missing required columns: {sorted(missing)}", file=sys.stderr)
        sys.exit(1)
    if "endpoint_id" not in features_df.columns:
        features_df["endpoint_id"] = range(len(features_df))
    features_df["version_path"] = features_df["version_path"].astype(str)

    clf_pre = joblib.load(CLASSIFIER_DIR / "preprocessor.joblib")
    clf_model = joblib.load(CLASSIFIER_DIR / "model.joblib")
    X_clf = clf_pre.transform(features_df[CLF_NUMERIC + CLF_CAT])
    ml_pred = clf_model.predict(X_clf)
    ml_proba = clf_model.predict_proba(X_clf)
    ml_state = [LABEL_MAP_INV[i] for i in ml_pred]
    ml_confidence = ml_proba.max(axis=1)

    rule = classify_batch(features_df)
    rule_state = rule["rule_state"].values

    reg_pre = joblib.load(REGRESSOR_DIR / "preprocessor.joblib")
    reg_model = joblib.load(REGRESSOR_DIR / "model.joblib")
    X_reg = reg_pre.transform(features_df[REG_NUMERIC + REG_CAT])
    risk = np.clip(reg_model.predict(X_reg), 0, 100)
    bands = [risk_band(r) for r in risk]

    findings = features_df.apply(lambda r: "|".join(owasp_findings(r)), axis=1)
    finding_count = findings.apply(lambda s: 0 if s == "" else len(s.split("|")))

    if args.sequences:
        seq_df = pd.read_csv(args.sequences)
        scaler = joblib.load(ANOMALY_DIR / "scaler.joblib")
        anom_model = joblib.load(ANOMALY_DIR / "model.joblib")
        anom_rows = []
        for ep_id, group in seq_df.groupby("endpoint_id"):
            anom_rows.append({"endpoint_id": int(ep_id),
                              "_features": build_sequence_features(group)})
        anom_index = pd.DataFrame(anom_rows)
        anom_X = scaler.transform(np.array(anom_index["_features"].tolist()))
        anom_index["anomaly_flag"] = (anom_model.predict(anom_X) == -1).astype(int)
        anom_index["anomaly_score"] = -anom_model.score_samples(anom_X)
        anom_join = features_df[["endpoint_id"]].merge(
            anom_index[["endpoint_id", "anomaly_flag", "anomaly_score"]],
            on="endpoint_id", how="left",
        )
        anom_flag_col = anom_join["anomaly_flag"].fillna(-1).astype(int).values
        anom_score_col = anom_join["anomaly_score"].round(4).values
    else:
        anom_flag_col = np.full(len(features_df), -1, dtype=int)
        anom_score_col = np.full(len(features_df), np.nan)

    out = pd.DataFrame({
        "endpoint_id": features_df["endpoint_id"].values,
        "endpoint": features_df["endpoint"].values,
        "method": features_df["method"].values,
        "rule_state": rule_state,
        "rule_is_zombie": rule["rule_is_zombie"].values,
        "rule_is_shadow": rule["rule_is_shadow"].values,
        "rule_reason": rule["rule_reason"].values,
        "ml_state": ml_state,
        "ml_confidence": np.round(ml_confidence, 4),
        "lifecycle_agreement": (rule_state == np.array(ml_state)).astype(int),
        "needs_review": (rule_state != np.array(ml_state)).astype(int),
        "risk_score": np.round(risk, 2),
        "risk_band": bands,
        "anomaly_flag": anom_flag_col,
        "anomaly_score": anom_score_col,
        "owasp_findings": findings.values,
        "finding_count": finding_count.values,
    })

    out.to_csv(args.output, index=False)

    print(f"=== inference complete: {len(out)} endpoints → {args.output} ===")
    print()
    print(f"rule_state:       {dict(out['rule_state'].value_counts())}")
    print(f"ml_state:         {dict(out['ml_state'].value_counts())}")
    print(f"agreement rate:   {out['lifecycle_agreement'].mean():.1%}")
    print(f"needs review:     {int(out['needs_review'].sum())} endpoints")
    print()
    print(f"risk_band:        {dict(out['risk_band'].value_counts())}")
    print(f"mean risk_score:  {out['risk_score'].mean():.2f}")
    if args.sequences:
        flagged = int((out["anomaly_flag"] == 1).sum())
        print(f"anomaly endpoints: {flagged}")
    print()
    print("top 5 highest risk endpoints:")
    cols = ["endpoint_id", "endpoint", "method", "ml_state",
            "risk_score", "risk_band", "finding_count", "needs_review"]
    print(out.nlargest(5, "risk_score")[cols].to_string(index=False))


if __name__ == "__main__":
    main()
