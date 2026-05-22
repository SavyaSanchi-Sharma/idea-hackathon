import json
import re
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn

_STATE = {}

CLF_NUMERIC = ["schema_count", "last_seen_days", "call_count_7d",
               "auth_fail_rate_7d", "p95_latency_ms", "last_deploy_days", "max_cvss"]
CLF_CAT = ["auth_scheme", "runtime", "version_path"]
REG_NUMERIC = ["schema_count", "deprecated_flag", "in_registry", "last_seen_days",
               "call_count_7d", "auth_fail_rate_7d", "p95_latency_ms",
               "last_deploy_days", "owner_present"]
REG_CAT = ["auth_scheme", "runtime", "version_path"]
LABEL_MAP_INV = {0: "active", 1: "deprecated", 2: "orphaned"}
WEAK_AUTH = {"none", "apiKey", "basic", "apiKey|basic"}

_VPATH_RE = re.compile(r"/v(\d+)")
_ID_TOKEN_RE = re.compile(r"\{\w*[Ii]d\}")


def _band(score):
    if score >= 90:
        return "critical"
    if score >= 75:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def _owasp(row):
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
    if _ID_TOKEN_RE.search(row["endpoint"]) and row["auth_scheme"] in WEAK_AUTH:
        f.append("API1:BOLA")
    if row["p95_latency_ms"] > 1000:
        f.append("API4:Unrestricted-Resource-Consumption")
    if row["last_deploy_days"] > 720 and row["max_cvss"] >= 7.0:
        f.append("API10:Unsafe-Consumption-Of-APIs")
    return f


def _build_sequence_features(seq):
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


def _derive_version_path(endpoint):
    m = _VPATH_RE.search(endpoint or "")
    return f"v{m.group(1)}" if m else "v1"


def _prepare_features(rows):
    df = pd.DataFrame(rows)
    if "version_path" not in df.columns:
        df["version_path"] = df["endpoint"].apply(_derive_version_path)
    df["version_path"] = df["version_path"].astype(str)
    return df


def _rule_classify(df):
    fn = _STATE.get("rule_fn")
    if fn is None:
        rule_dir = _STATE["artifacts_root"] / "classifier"
        if str(rule_dir) not in sys.path:
            sys.path.insert(0, str(rule_dir))
        try:
            from rule import classify_batch
        except ImportError:
            alt = _STATE["artifacts_root"]
            if str(alt) not in sys.path:
                sys.path.insert(0, str(alt))
            from rule import classify_batch
        fn = classify_batch
        _STATE["rule_fn"] = fn
    return fn(df)


def init(artifacts_root):
    root = Path(artifacts_root)
    _STATE["artifacts_root"] = root
    _STATE["sklearn_version"] = sklearn.__version__
    _STATE["clf_pre"] = joblib.load(root / "classifier" / "artifacts" / "preprocessor.joblib")
    _STATE["clf"] = joblib.load(root / "classifier" / "artifacts" / "model.joblib")
    _STATE["reg_pre"] = joblib.load(root / "regressor" / "artifacts" / "preprocessor.joblib")
    _STATE["reg"] = joblib.load(root / "regressor" / "artifacts" / "model.joblib")
    _STATE["anom_scaler"] = joblib.load(root / "anomaly" / "artifacts" / "scaler.joblib")
    _STATE["anom"] = joblib.load(root / "anomaly" / "artifacts" / "model.joblib")
    return json.dumps({"sklearn": sklearn.__version__, "ok": True})


def classify(features_json):
    rows = json.loads(features_json)
    if not rows:
        return json.dumps([])
    df = _prepare_features(rows)
    X = _STATE["clf_pre"].transform(df[CLF_NUMERIC + CLF_CAT])
    pred = _STATE["clf"].predict(X)
    proba = _STATE["clf"].predict_proba(X)
    ml_state = [LABEL_MAP_INV[int(i)] for i in pred]
    ml_conf = proba.max(axis=1)
    rule = _rule_classify(df)
    rule_state = rule["rule_state"].values
    findings = df.apply(_owasp, axis=1)
    out = []
    for i in range(len(df)):
        agree = int(rule_state[i] == ml_state[i])
        out.append({
            "endpoint_id": int(df["endpoint_id"].iloc[i]),
            "endpoint": str(df["endpoint"].iloc[i]),
            "method": str(df["method"].iloc[i]),
            "rule_state": str(rule_state[i]),
            "rule_is_zombie": int(rule["rule_is_zombie"].iloc[i]),
            "rule_is_shadow": int(rule["rule_is_shadow"].iloc[i]),
            "rule_reason": str(rule["rule_reason"].iloc[i]),
            "ml_state": ml_state[i],
            "ml_confidence": round(float(ml_conf[i]), 4),
            "lifecycle_agreement": agree,
            "needs_review": 1 - agree,
            "risk_score": 0.0,
            "risk_band": "low",
            "owasp_findings": list(findings.iloc[i]),
            "finding_count": len(findings.iloc[i]),
        })
    return json.dumps(out)


def risk(features_json):
    rows = json.loads(features_json)
    if not rows:
        return json.dumps([])
    df = _prepare_features(rows)
    X = _STATE["reg_pre"].transform(df[REG_NUMERIC + REG_CAT])
    risks = np.clip(_STATE["reg"].predict(X), 0, 100)
    findings = df.apply(_owasp, axis=1)
    out = []
    for i in range(len(df)):
        score = round(float(risks[i]), 2)
        out.append({
            "endpoint_id": int(df["endpoint_id"].iloc[i]),
            "endpoint": str(df["endpoint"].iloc[i]),
            "method": str(df["method"].iloc[i]),
            "rule_state": "",
            "rule_is_zombie": 0,
            "rule_is_shadow": 0,
            "rule_reason": "",
            "ml_state": "",
            "ml_confidence": 0.0,
            "lifecycle_agreement": 0,
            "needs_review": 0,
            "risk_score": score,
            "risk_band": _band(score),
            "owasp_findings": list(findings.iloc[i]),
            "finding_count": len(findings.iloc[i]),
        })
    return json.dumps(out)


def anomaly(sequences_json):
    rows = json.loads(sequences_json)
    if not rows:
        return json.dumps([])
    df = pd.DataFrame(rows)
    ids = []
    feats = []
    for ep_id, group in df.groupby("endpoint_id"):
        ids.append(int(ep_id))
        feats.append(_build_sequence_features(group))
    if not feats:
        return json.dumps([])
    X = _STATE["anom_scaler"].transform(np.array(feats))
    flag = (_STATE["anom"].predict(X) == -1).astype(int)
    score = -_STATE["anom"].score_samples(X)
    out = []
    for i, ep_id in enumerate(ids):
        out.append({
            "endpoint_id": ep_id,
            "anomaly_flag": int(flag[i]),
            "anomaly_score": round(float(score[i]), 4),
        })
    return json.dumps(out)
