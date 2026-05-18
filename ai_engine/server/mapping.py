"""Translate (features + predictions) → rich Endpoint payload the frontend expects.

The training dataset is synthetic banking telemetry; the React app's Endpoint
type is denormalized into many display-only fields (specimen_id, threat
narrative, score factors, blast radius). This module fills those in
deterministically so the UI stays coherent.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import pandas as pd

# Map the synthetic-data service column → frontend ServiceLane.
SERVICE_LANE_MAP = {
    "core-banking": "core",
    "payments": "payments",
    "cards": "cards",
    "loans": "internal",
    "kyc": "kyc",
    "wealth": "internal",
    "forex": "internal",
    "notifications": "internal",
    "audit": "internal",
    "aa-bridge": "internal",
}

# Path keyword → preferred lane (overrides service map when the endpoint path
# itself is obviously a specific rail).
PATH_LANE_HINTS = [
    ("/upi", "upi"),
    ("/imps", "imps"),
    ("/neft", "neft"),
    ("/rtgs", "rtgs"),
    ("/kyc", "kyc"),
    ("/aml", "aml"),
    ("/cards", "cards"),
    ("/internal/", "internal"),
    ("/legacy/", "legacy"),
    ("/auth", "auth"),
    ("/accounts", "core"),
]

# Path keyword → data classes that endpoint plausibly touches.
PATH_DATA_CLASSES = [
    ("aadhaar", ["Aadhaar", "PII", "KYC"]),
    ("kyc", ["PII", "KYC"]),
    ("pan", ["PAN", "PII"]),
    ("video", ["PII", "video-kyc"]),
    ("statement", ["account", "transaction"]),
    ("balance", ["account"]),
    ("transfer", ["transaction", "account"]),
    ("payment", ["transaction"]),
    ("upi", ["VPA", "transaction"]),
    ("imps", ["PII", "transaction"]),
    ("neft", ["account", "transaction"]),
    ("rtgs", ["account", "transaction"]),
    ("cards", ["PAN"]),
    ("session", ["session"]),
    ("auth", ["credentials"]),
    ("loan", ["PII", "loan"]),
    ("beneficiar", ["PII"]),
    ("forex", ["transaction"]),
    ("mandate", ["transaction"]),
    ("audit", ["audit-log"]),
    ("aml", ["PII", "AML"]),
]

AUTH_TYPE_PRETTY = {
    "none": "none",
    "apiKey": "api_key",
    "basic": "basic",
    "apiKey|basic": "basic+api_key",
    "http:bearer": "OAuth2",
    "http:basic|http:bearer": "basic+bearer",
    "oauth2:implicit": "OAuth2",
    "oauth2:authorizationCode": "OAuth2",
    "oauth2:clientCredentials": "OAuth2",
    "openIdConnect": "OAuth2",
    "mutualTLS": "mTLS",
}

OWASP_TAG_MAP = {
    "API1:BOLA": "API1:2023",
    "API2:Broken-Authentication": "API2:2023",
    "API3:Excessive-Data-Exposure": "API3:2023",
    "API4:Unrestricted-Resource-Consumption": "API4:2023",
    "API5:Broken-Function-Level-Auth": "API5:2023",
    "API8:Security-Misconfiguration": "API8:2023",
    "API9:Improper-Inventory-Management": "API9:2023",
    "API10:Unsafe-Consumption-Of-APIs": "API10:2023",
}

CVE_SUMMARIES = {
    "CVE-2022-22965": "Spring4Shell RCE via data binding",
    "CVE-2023-20860": "Security bypass via pattern matching",
    "CVE-2024-22243": "URL parsing open redirect",
    "CVE-2023-30581": "Permission model bypass via Module",
    "CVE-2024-22019": "HTTP request smuggling chunked encoding",
    "CVE-2024-21892": "Privilege escalation via env vars",
    "CVE-2023-24329": "urllib.parse scheme bypass",
    "CVE-2023-40217": "TLS handshake data leak",
    "CVE-2024-0397": "ssl module memory race",
    "CVE-2023-29406": "HTTP host header validation bypass",
    "CVE-2024-24784": "net/mail comment parsing",
    "CVE-2024-21386": "SignalR denial of service",
    "CVE-2024-30045": "Remote code execution via deserialization",
}

# Stable "now" for relative timestamps so every response renders identically.
NOW = datetime.now(timezone.utc)


def _specimen_id(endpoint_id: int) -> str:
    h = hashlib.md5(f"ep_{endpoint_id}".encode()).hexdigest()
    n = int(h[:6], 16) % 9000 + 1000
    return f"zh-{n:04d}"


def _service_lane(service: str, path: str) -> str:
    for needle, lane in PATH_LANE_HINTS:
        if needle in path:
            return lane
    return SERVICE_LANE_MAP.get(service, "internal")


def _data_classes(path: str) -> list[str]:
    p = path.lower()
    out: list[str] = []
    for needle, classes in PATH_DATA_CLASSES:
        if needle in p:
            for c in classes:
                if c not in out:
                    out.append(c)
    return out


def _auth_type(scheme: str) -> str:
    return AUTH_TYPE_PRETTY.get(scheme, scheme or "unknown")


@lru_cache(maxsize=None)
def _team_for_service(service: str) -> str:
    return {
        "core-banking": "core-banking",
        "payments": "payments-platform",
        "cards": "card-platform",
        "loans": "lending",
        "kyc": "kyc-platform",
        "wealth": "wealth",
        "forex": "treasury",
        "notifications": "platform-notifications",
        "audit": "compliance-eng",
        "aa-bridge": "aa-bridge",
    }.get(service, "platform")


def _days_to_iso(days: float) -> str:
    return (NOW - timedelta(days=float(days))).isoformat().replace("+00:00", "Z")


def _owasp_tags(findings_str: str) -> list[str]:
    if not findings_str or pd.isna(findings_str):
        return []
    return [OWASP_TAG_MAP.get(f, f) for f in str(findings_str).split("|") if f]


def _classification_reasons(feat: pd.Series, pred: pd.Series) -> list[str]:
    reasons = [pred["rule_reason"]]
    state = pred["ml_state"]
    if state == "orphaned":
        if feat["last_deploy_days"] > 365:
            reasons.append(f"{int(feat['last_deploy_days'] / 30)} months since last deploy")
        if feat["call_count_7d"] >= 3000:
            reasons.append(f"high traffic ({int(feat['call_count_7d']):,} calls/7d) on zombie surface")
        if feat["in_registry"] == 0:
            reasons.append("absent from API registry — shadow endpoint")
    elif state == "deprecated":
        reasons.append("marked deprecated in registry · replacement candidate exists")
    else:
        reasons.append("registered, owned, active maintenance")
    if pred["ml_confidence"] < 0.85:
        reasons.append(f"ml confidence {pred['ml_confidence']:.0%} — boundary case")
    if pred["anomaly_flag"] == 1:
        reasons.append("30-day behavior shift detected by anomaly model")
    return reasons


def _recommended_action(state: str, risk_tier: str, is_shadow: bool) -> str:
    if risk_tier == "critical" or is_shadow:
        return "block"
    if state == "orphaned" and risk_tier == "high":
        return "block"
    if state == "deprecated":
        return "quarantine"
    if risk_tier in {"medium", "high"}:
        return "playbook"
    return "monitor"


def _discovery_sources(in_registry: int, deprecated_flag: int) -> list[str]:
    out = ["traffic_logs"]
    if in_registry:
        out.append("registry")
    if deprecated_flag or not in_registry:
        out.append("code_scan")
    return out


def _score_factors(feat: pd.Series, pred: pd.Series) -> dict:
    """Decompose the regressor risk into the five-factor view the UI shows.

    Mirrors the formula in DATA.md §4.7 so the scores add up to ~ posture_score.
    """
    score = float(pred["risk_score"])
    fail_rate = float(feat["auth_fail_rate_7d"])
    cvss = float(feat["max_cvss"])
    no_owner = 1 - int(feat["owner_present"])
    no_registry = 1 - int(feat["in_registry"])
    deploy = min(float(feat["last_deploy_days"]) / 1000.0, 1.0)
    no_auth = 1 if feat["auth_scheme"] == "none" else 0
    is_zombie = int(pred["rule_is_zombie"])

    return {
        "data_sensitivity": {
            "score": round(min(10.0, 6.0 + cvss / 3 + (1.5 if "kyc" in feat["endpoint"].lower() else 0)), 1),
            "weight": 0.25,
            "detail": "PII + financial data exposed in payload" if cvss >= 5 else "limited PII surface",
        },
        "auth_strength": {
            "score": round(min(10.0, 4.0 + fail_rate * 30 + no_auth * 4), 1),
            "weight": 0.25,
            "detail": f"{feat['auth_scheme']} · auth_fail_rate {fail_rate:.1%}",
        },
        "staleness": {
            "score": round(min(10.0, 1.0 + deploy * 9), 1),
            "weight": 0.20,
            "detail": f"{int(feat['last_deploy_days'])} days since last deploy",
        },
        "blast_radius": {
            "score": round(min(10.0, 3.0 + 4 * is_zombie + 2 * no_registry + 1 * no_owner), 1),
            "weight": 0.15,
            "detail": "zombie + high traffic" if is_zombie else "scoped to service",
        },
        "cve_owasp_match": {
            "score": round(min(10.0, cvss + (1.5 if pred["finding_count"] >= 3 else 0)), 1),
            "weight": 0.15,
            "detail": f"{int(pred['finding_count'])} OWASP categories · max CVSS {cvss:.1f}",
        },
    }


def _threat_narrative(feat: pd.Series, pred: pd.Series) -> str:
    fail_rate = float(feat["auth_fail_rate_7d"])
    cvss = float(feat["max_cvss"])
    calls = int(feat["call_count_7d"])
    deploy_days = int(feat["last_deploy_days"])
    auth = feat["auth_scheme"]
    parts: list[str] = []

    if pred["rule_is_shadow"]:
        parts.append(
            f"{feat['endpoint']} is not registered with the API CMDB — a shadow surface "
            f"deployed by {feat['service']} runtime ({feat['runtime']} {feat['runtime_version']})."
        )
    elif pred["rule_is_zombie"]:
        parts.append(
            f"{feat['endpoint']} carries {calls:,} calls in the last 7 days yet has no owning team. "
            f"Last deploy was {deploy_days} days ago — a zombie surface kept alive by integrations no one tracks."
        )
    elif pred["ml_state"] == "deprecated":
        parts.append(
            f"{feat['endpoint']} is marked deprecated; a replacement surface should be live. "
            f"It still sees {calls:,} calls/7d, blocking cut-over."
        )
    else:
        parts.append(
            f"{feat['endpoint']} is the {pred['ml_state']} {feat['method']} surface for "
            f"{feat['service']} on {feat['runtime']} {feat['runtime_version']}."
        )

    if auth == "none":
        parts.append("Authentication is **none** — any reachable caller can hit it.")
    elif fail_rate > 0.10:
        parts.append(f"Authentication failure rate is {fail_rate:.1%}, indicating broken or guessable scopes.")

    if cvss >= 7.0:
        parts.append(
            f"Runtime {feat['runtime']} {feat['runtime_version']} is exposed to "
            f"{feat['cve_id']} (CVSS {cvss:.1f}): {CVE_SUMMARIES.get(feat['cve_id'], 'known runtime CVE')}."
        )
    if int(pred["anomaly_flag"]) == 1:
        parts.append("Anomaly detector flagged a step-change in traffic during the 30-day window.")
    parts.append(
        f"Recommended action: **{_recommended_action(pred['ml_state'], pred['risk_band'], bool(pred['rule_is_shadow']))}**."
    )
    return " ".join(parts)


def _blast_radius_nodes(service: str, lane: str) -> list[str]:
    nodes = [f"svc_{service.replace('-', '_')}"]
    if lane in {"upi", "imps", "neft", "rtgs"}:
        nodes.append(f"ext_npci_{lane}")
    if lane == "core":
        nodes.extend(["db_core_accounts", "svc_core_banking"])
    if lane == "kyc":
        nodes.extend(["db_kyc_docs", "ext_uidai"])
    if lane == "cards":
        nodes.append("svc_card_hsm")
    return nodes


def _birth_year(deploy_days: float) -> int:
    """Approximate first-deploy year from deploy-days-ago. Older deploys → older birth."""
    years_ago = float(deploy_days) / 365.25 + 0.5
    return max(2008, NOW.year - int(years_ago))


def _endpoint_id(raw_id: int) -> str:
    return f"ep_{raw_id:04d}"


def to_endpoint(feat: pd.Series, pred: pd.Series, sparkline: list[int], trend_pct: float) -> dict:
    """Build one frontend-shaped Endpoint object from a feature+prediction row."""
    path = str(feat["endpoint"])
    service = str(feat["service"])
    lane = _service_lane(service, path)
    state = str(pred["ml_state"])
    rule_state = str(pred["rule_state"])
    risk_band = str(pred["risk_band"])
    is_shadow = bool(int(pred["rule_is_shadow"]))
    is_zombie = bool(int(pred["rule_is_zombie"]))
    needs_review = bool(int(pred["needs_review"]))
    anomaly_flag = bool(int(pred["anomaly_flag"]))
    in_registry = bool(int(feat["in_registry"]))
    owner_present = bool(int(feat["owner_present"]))
    cve_id = str(feat["cve_id"]) if not pd.isna(feat["cve_id"]) else ""
    cvss = float(feat["max_cvss"])
    runtime = str(feat["runtime"])
    runtime_version = str(feat["runtime_version"])
    cve_matches = []
    if cve_id and cvss > 0:
        cve_matches.append({
            "id": cve_id,
            "score": cvss,
            "summary": CVE_SUMMARIES.get(cve_id, f"{cve_id} on {runtime} {runtime_version}"),
        })
    return {
        "id": _endpoint_id(int(feat["endpoint_id"])),
        "specimen_id": _specimen_id(int(feat["endpoint_id"])),
        "birth_year": _birth_year(feat["last_deploy_days"]),
        "t0": _days_to_iso(feat["last_deploy_days"]),
        "service_lane": lane,
        "method": str(feat["method"]).upper(),
        "path": path,
        "service": service,
        "classification": state,
        "classification_reasons": _classification_reasons(feat, pred),
        "posture_score": float(pred["risk_score"]),
        "score_factors": _score_factors(feat, pred),
        "risk_tier": risk_band,
        "discovery_sources": _discovery_sources(int(feat["in_registry"]), int(feat["deprecated_flag"])),
        "in_registry": in_registry,
        "owner": {
            "team": _team_for_service(service) if owner_present else None,
            "last_author": (f"lead.{service.replace('-', '')}@unionbank.in"
                            if owner_present else None),
        },
        "traffic": {
            "calls_30d": int(int(feat["call_count_7d"]) * 30 / 7),
            "last_seen": _days_to_iso(feat["last_seen_days"]),
            "trend_pct": round(trend_pct, 1),
            "sparkline": sparkline,
        },
        "auth": {
            "type": _auth_type(str(feat["auth_scheme"])),
            "rate_limited": float(feat["auth_fail_rate_7d"]) < 0.05 and state == "active",
            "mfa": state == "active" and float(feat["auth_fail_rate_7d"]) < 0.02,
        },
        "data_classes": _data_classes(path),
        "last_commit": _days_to_iso(min(float(feat["last_deploy_days"]) + 7, 9000)),
        "last_deploy": _days_to_iso(feat["last_deploy_days"]),
        "cve_matches": cve_matches,
        "owasp_tags": _owasp_tags(pred["owasp_findings"]),
        "threat_narrative": _threat_narrative(feat, pred),
        "recommended_action": _recommended_action(state, risk_band, is_shadow),
        "blast_radius_nodes": _blast_radius_nodes(service, lane),
        # ─── model signals (added so the UI can show what the models actually say)
        "rule_state": rule_state,
        "ml_state": state,
        "ml_confidence": float(pred["ml_confidence"]),
        "needs_review": needs_review,
        "is_zombie": is_zombie,
        "is_shadow": is_shadow,
        "anomaly_flag": anomaly_flag,
        "anomaly_score": (None if pd.isna(pred["anomaly_score"])
                          else float(pred["anomaly_score"])),
        "finding_count": int(pred["finding_count"]),
        "signals": {
            "auth_fail_rate_7d": float(feat["auth_fail_rate_7d"]),
            "p95_latency_ms": int(feat["p95_latency_ms"]),
            "call_count_7d": int(feat["call_count_7d"]),
            "schema_count": int(feat["schema_count"]),
            "runtime": runtime,
            "runtime_version": runtime_version,
            "cve_id": cve_id or None,
            "max_cvss": cvss,
            "last_seen_days": int(feat["last_seen_days"]),
            "last_deploy_days": int(feat["last_deploy_days"]),
        },
    }


def to_endpoint_list(features: pd.DataFrame, predictions: pd.DataFrame,
                     sparklines: dict[int, list[int]],
                     trend_pct: dict[int, float]) -> list[dict]:
    # Drop the training-time label columns so they don't collide with prediction
    # outputs of the same name (`risk_score`, `is_zombie`, `is_shadow`).
    feat_clean = features.drop(
        columns=[c for c in ("lifecycle_state", "is_zombie", "is_shadow", "risk_score")
                 if c in features.columns]
    )
    merged = feat_clean.merge(predictions, on="endpoint_id", how="inner")
    out: list[dict] = []
    for _, row in merged.iterrows():
        ep_id = int(row["endpoint_id"])
        out.append(to_endpoint(
            row,
            row,
            sparkline=sparklines.get(ep_id, []),
            trend_pct=trend_pct.get(ep_id, 0.0),
        ))
    return out
