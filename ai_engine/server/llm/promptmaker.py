"""Pure-logic prompt construction for the ZombieHunter SLM tier.

Three downstream tasks:
  - threat narrative (prose for the CISO console)
  - remediation playbook (structured action plan)
  - compliance summary (RBI / PCI control mapping)

Each builder returns a (system_prompt, user_context) tuple. The system prompt
is plain English; the user_context is a JSON-serializable dict. A separate SLM
runtime (Gemma 3B locally, or any OpenAI-compatible endpoint) is responsible
for wrapping these in the model's chat template before generation.

This file is pure logic. No I/O, no network, no model loading, no DB.
"""
from __future__ import annotations

import json
import textwrap
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any


# =============================================================================
# Input dataclasses
# =============================================================================

@dataclass(frozen=True)
class EndpointRow:
    endpoint_id: str
    service: str
    method: str
    path: str
    in_registry: bool
    owner_present: bool
    owner_team: str | None
    deprecated_flag: bool
    auth_scheme: str
    runtime: str | None
    runtime_version: str | None
    last_commit_date: datetime | None
    last_deploy_days: int | None
    last_seen_days: int | None
    schema_count: int
    max_cvss: float
    cve_ids: list[str]


@dataclass(frozen=True)
class ClassificationResult:
    rule_state: str
    rule_reason: str
    ml_state: str
    ml_confidence: float
    agreement: bool
    is_zombie: bool
    is_shadow: bool


@dataclass(frozen=True)
class RiskResult:
    score: float
    band: str
    factors: dict[str, float]


@dataclass(frozen=True)
class GraphFeatures:
    in_routes_to: int
    out_owned_by: int
    out_deployed_on: int
    blast_radius_total: int
    sensitive_db_count: int
    internet_reachable: bool


@dataclass(frozen=True)
class TrafficSummary:
    calls_7d: int
    calls_30d: int
    auth_fail_rate_7d: float
    p95_latency_ms: float
    trend_pct_30d: float


@dataclass(frozen=True)
class AnomalyResult:
    flag: bool
    score: float


class ComplianceFramework(str, Enum):
    RBI_2024 = "rbi_2024"
    PCI_DSS = "pci_dss"


# =============================================================================
# Constants
# =============================================================================

_SYSTEM_PROMPT_HEADER = textwrap.dedent("""\
    You are a banking API security analyst writing for the Union Bank CISO and senior security engineers.

    GROUNDING RULES (strict):
    1. Use ONLY the facts provided in the user context below. Do not invent endpoints, services, teams, CVEs, dates, or numbers.
    2. If a fact is not in the context, do not mention it. Do not speculate.
    3. Cite specific factual values inline (e.g., "last commit 547 days ago", "CVSS 9.1").
    4. No marketing language. No hyperbole. Precise technical prose appropriate for a regulated banking environment.
    5. The context is JSON. Treat field names as authoritative.
""")


# =============================================================================
# Helpers
# =============================================================================

def _days_ago(dt: datetime | None) -> int | None:
    """Days between dt and now (UTC). Naive datetimes are treated as UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    return (now - dt).days


def _weak_auth_set() -> frozenset[str]:
    """Canonical set of auth schemes considered weak by the rule engine."""
    return frozenset({"none", "basic", "api_key", "apiKey", "apiKey|basic"})


def _format_classification_reason(
    endpoint: EndpointRow,
    classification: ClassificationResult,
    traffic: TrafficSummary,
) -> str:
    """Build a one-line, fact-grounded explanation of why this endpoint
    looks the way the classifier says it does. The reason is comma-joined
    from a small set of observed signals — no signals means "active"."""
    parts: list[str] = []
    if not endpoint.owner_present:
        parts.append("no owner present")
    last_commit = _days_ago(endpoint.last_commit_date)
    if last_commit is not None:
        parts.append(f"{last_commit} days since last commit")
    if traffic.trend_pct_30d < -50:
        parts.append(f"traffic {traffic.trend_pct_30d:.0f}% vs prior window")
    if endpoint.deprecated_flag:
        parts.append("deprecated flag set")
    if not endpoint.in_registry:
        parts.append("not in API registry")
    if not parts:
        return "active endpoint with no decay signals"
    return ", ".join(parts)


def _rbi_controls(
    endpoint: EndpointRow,
    classification: ClassificationResult,
    graph: GraphFeatures | None,
    owasp_findings: list[str],
) -> list[str]:
    """Heuristic mapping of observed signals to RBI Cybersecurity Framework
    2024 control numbers. Pure if-chain so an auditor can read it top-down."""
    controls: list[str] = []
    if not endpoint.owner_present:
        controls.append("RBI-CSF-4.6")
    weak_auth = endpoint.auth_scheme in _weak_auth_set()
    if weak_auth:
        controls.append("RBI-CSF-7.2")
    pii_exposed = graph is not None and graph.sensitive_db_count > 0
    if pii_exposed and weak_auth:
        controls.append("RBI-CSF-9.1")
    if endpoint.deprecated_flag and (
        endpoint.last_seen_days is None or endpoint.last_seen_days < 30
    ):
        controls.append("RBI-CSF-11.3")
    return controls


def _pci_controls(
    endpoint: EndpointRow,
    classification: ClassificationResult,
    graph: GraphFeatures | None,
    owasp_findings: list[str],
) -> list[str]:
    """Heuristic mapping of observed signals to PCI-DSS v4.0 Section 6
    control numbers."""
    controls: list[str] = []
    if endpoint.auth_scheme in _weak_auth_set():
        controls.append("PCI-6.5.10")
    if graph is not None and graph.sensitive_db_count > 0:
        controls.append("PCI-6.5.4")
    if not endpoint.in_registry:
        controls.append("PCI-2.2")
    stale = endpoint.last_deploy_days is None or endpoint.last_deploy_days > 90
    if endpoint.max_cvss >= 7.0 and stale:
        controls.append("PCI-6.3.2")
    return controls


def _task_clauses_threat() -> str:
    return textwrap.dedent("""\

        TASK: Produce a threat narrative of 3 to 5 sentences.
        - Lead with the single most dangerous fact about this endpoint.
        - End with the most likely attacker action against this endpoint.
        - Cite specific values from the context (numbers, dates, CVE IDs, OWASP categories).
        - Do not use headings, bullet points, or JSON.

        OUTPUT FORMAT: Return prose only. No bullet points, no JSON, no headings.
    """)


def _task_clauses_remediation() -> str:
    return textwrap.dedent("""\

        TASK: Produce a structured remediation plan with three tiers:
          (1) Immediate actions (today)
          (2) Short-term remediation (this sprint)
          (3) Long-term fix (this quarter)

        Each step MUST include a verifiable check phrased as "verify by ..." that a human
        operator or automated probe can execute. Steps must be specific to THIS endpoint
        and reference its OWASP findings, CVE IDs, auth scheme, or graph signals
        directly — no generic security advice. Do not propose actions whose preconditions
        are not present in the context.

        OUTPUT FORMAT: Return a JSON object with keys `immediate`, `short_term`, `long_term`, each a list of strings. No prose outside the JSON.
    """)


def _task_clauses_compliance(framework: ComplianceFramework) -> str:
    framework_name = {
        ComplianceFramework.RBI_2024: "RBI Cybersecurity Framework 2024",
        ComplianceFramework.PCI_DSS: "PCI-DSS v4.0 Section 6",
    }[framework]
    return textwrap.dedent(f"""\

        TASK: Map findings to {framework_name}.
        - Cite specific control numbers from the `applicable_controls` list in the context.
        - For each control, tie it to the precise fact in the context that triggered it.
        - If an OWASP finding does not map to any control in {framework_name}, state that explicitly.

        OUTPUT FORMAT: Return a JSON object with keys `summary` (string, 2 to 3 sentences) and `control_mappings` (list of objects with `control_id`, `finding`, `severity`). No prose outside the JSON.
    """)


# =============================================================================
# Public builders
# =============================================================================

def build_threat_narrative(
    endpoint: EndpointRow,
    classification: ClassificationResult,
    risk: RiskResult,
    graph: GraphFeatures,
    traffic: TrafficSummary,
    owasp_findings: list[str],
    anomaly: AnomalyResult | None = None,
) -> tuple[str, dict[str, Any]]:
    """Build the prompt for a one-paragraph threat narrative.

    The resulting prose is intended for the CISO-facing console alongside the
    structured signals. It should read like an analyst's one-paragraph
    assessment, not a marketing blurb — the system prompt enforces that.

    Args:
        endpoint: the endpoint's identity + posture-relevant features.
        classification: lifecycle classifier output (rule + ML + agreement).
        risk: regressor score, band, and per-factor breakdown.
        graph: structural signals derived from the dependency graph.
        traffic: traffic summary over recent windows.
        owasp_findings: OWASP API Top 10 categories the rule engine flagged.
        anomaly: optional IsolationForest output; omitted from context if None.

    Returns:
        (system_prompt, user_context) — pass both to the SLM runtime.
    """
    system_prompt = _SYSTEM_PROMPT_HEADER + _task_clauses_threat()

    classification_reason = _format_classification_reason(
        endpoint, classification, traffic
    )

    context: dict[str, Any] = {
        "endpoint": {
            "method": endpoint.method,
            "path": endpoint.path,
            "service": endpoint.service,
            "in_registry": endpoint.in_registry,
            "owner_team": endpoint.owner_team,
            "auth_scheme": endpoint.auth_scheme,
            "runtime": endpoint.runtime,
            "deprecated": endpoint.deprecated_flag,
        },
        "lifecycle": {
            "rule_classification": classification.rule_state,
            "ml_classification": classification.ml_state,
            "ml_confidence": classification.ml_confidence,
            "is_zombie": classification.is_zombie,
            "is_shadow": classification.is_shadow,
            "classification_reason": classification_reason,
        },
        "risk": {
            "score": risk.score,
            "band": risk.band,
            "factor_breakdown": dict(risk.factors),
        },
        "graph_signals": {
            "bypasses_gateway": graph.in_routes_to == 0,
            "blast_radius_total": graph.blast_radius_total,
            "sensitive_db_count": graph.sensitive_db_count,
            "internet_reachable": graph.internet_reachable,
        },
        "traffic": {
            "calls_7d": traffic.calls_7d,
            "calls_30d": traffic.calls_30d,
            "auth_fail_rate_7d": traffic.auth_fail_rate_7d,
            "trend_pct_30d": traffic.trend_pct_30d,
            "p95_latency_ms": traffic.p95_latency_ms,
        },
        "vulnerabilities": {
            "max_cvss": endpoint.max_cvss,
            "cve_ids": list(endpoint.cve_ids),
            "owasp_findings": list(owasp_findings),
        },
    }
    if anomaly is not None:
        context["anomaly"] = {
            "flagged": anomaly.flag,
            "score": anomaly.score,
        }
    return system_prompt, context


def build_remediation_playbook(
    endpoint: EndpointRow,
    classification: ClassificationResult,
    risk: RiskResult,
    graph: GraphFeatures,
    owasp_findings: list[str],
) -> tuple[str, dict[str, Any]]:
    """Build the prompt for a structured remediation playbook.

    Returned plan has three time-horizoned tiers (immediate / short_term /
    long_term). Each step must be specific to THIS endpoint and carry a
    verifiable check, so the system prompt and pre-computed boolean flags
    (`weak_auth`, `is_critical_cve`, `is_orphaned`, `is_shadow`, `is_pii_exposed`)
    nudge the SLM toward concrete actions instead of generic advice.

    Args:
        endpoint: endpoint identity + auth + runtime detail.
        classification: lifecycle classifier output.
        risk: risk score and band.
        graph: structural signals (used to set `is_pii_exposed`).
        owasp_findings: OWASP API Top 10 categories the rule engine flagged.

    Returns:
        (system_prompt, user_context).
    """
    system_prompt = _SYSTEM_PROMPT_HEADER + _task_clauses_remediation()

    weak_auth = endpoint.auth_scheme in _weak_auth_set()

    context: dict[str, Any] = {
        "endpoint": {
            "endpoint_id": endpoint.endpoint_id,
            "method": endpoint.method,
            "path": endpoint.path,
            "service": endpoint.service,
            "owner_team": endpoint.owner_team,
            "auth_scheme": endpoint.auth_scheme,
            "runtime": endpoint.runtime,
            "runtime_version": endpoint.runtime_version,
            "in_registry": endpoint.in_registry,
            "deprecated": endpoint.deprecated_flag,
        },
        "classification": {
            "rule_state": classification.rule_state,
            "ml_state": classification.ml_state,
            "is_zombie": classification.is_zombie,
            "is_shadow": classification.is_shadow,
        },
        "risk": {
            "score": risk.score,
            "band": risk.band,
        },
        "owasp_findings": list(owasp_findings),
        "vulnerabilities": {
            "max_cvss": endpoint.max_cvss,
            "cve_ids": list(endpoint.cve_ids),
        },
        "computed": {
            "weak_auth": weak_auth,
            "is_critical_cve": endpoint.max_cvss >= 7.0,
            "is_orphaned": classification.rule_state == "orphaned",
            "is_shadow": classification.is_shadow,
            "is_pii_exposed": graph.sensitive_db_count > 0,
        },
    }
    return system_prompt, context


def build_compliance_summary(
    endpoint: EndpointRow,
    classification: ClassificationResult,
    risk: RiskResult,
    owasp_findings: list[str],
    framework: ComplianceFramework,
    graph: GraphFeatures | None = None,
) -> tuple[str, dict[str, Any]]:
    """Build the prompt for a compliance-framework-mapped summary.

    Pre-computes the `applicable_controls` list using the heuristic if-chains
    in `_rbi_controls` / `_pci_controls`, so the SLM cannot invent control
    numbers and the mapping stays auditable.

    Note: the `graph` parameter is optional to match the original public
    signature; if omitted, PII-exposure-driven controls (RBI-CSF-9.1,
    PCI-6.5.4) are skipped because the trigger condition can't be checked.

    Args:
        endpoint: endpoint identity + posture.
        classification: lifecycle classifier output.
        risk: risk score and band.
        owasp_findings: OWASP API Top 10 categories the rule engine flagged.
        framework: which framework to map to.
        graph: optional graph features for PII-exposure controls.

    Returns:
        (system_prompt, user_context).
    """
    system_prompt = _SYSTEM_PROMPT_HEADER + _task_clauses_compliance(framework)

    if framework == ComplianceFramework.RBI_2024:
        applicable = _rbi_controls(endpoint, classification, graph, owasp_findings)
    elif framework == ComplianceFramework.PCI_DSS:
        applicable = _pci_controls(endpoint, classification, graph, owasp_findings)
    else:
        applicable = []

    context: dict[str, Any] = {
        "endpoint": {
            "endpoint_id": endpoint.endpoint_id,
            "method": endpoint.method,
            "path": endpoint.path,
            "service": endpoint.service,
            "in_registry": endpoint.in_registry,
            "owner_team": endpoint.owner_team,
            "auth_scheme": endpoint.auth_scheme,
            "deprecated": endpoint.deprecated_flag,
            "last_deploy_days": endpoint.last_deploy_days,
        },
        "classification": {
            "rule_state": classification.rule_state,
            "ml_state": classification.ml_state,
            "is_zombie": classification.is_zombie,
            "is_shadow": classification.is_shadow,
        },
        "risk": {
            "score": risk.score,
            "band": risk.band,
        },
        "owasp_findings": list(owasp_findings),
        "vulnerabilities": {
            "max_cvss": endpoint.max_cvss,
            "cve_ids": list(endpoint.cve_ids),
        },
        "framework": framework.value,
        "applicable_controls": applicable,
    }
    return system_prompt, context


# =============================================================================
# Smoke test — runs the three builders against one realistic zombie endpoint
# and pretty-prints the prompts. Does not assert anything.
# =============================================================================

if __name__ == "__main__":
    sample_endpoint = EndpointRow(
        endpoint_id="abc1234567890def1234567890abcdef",
        service="customer-service",
        method="POST",
        path="/internal/legacy/customer-search",
        in_registry=False,
        owner_present=False,
        owner_team=None,
        deprecated_flag=False,
        auth_scheme="none",
        runtime="java",
        runtime_version="8",
        last_commit_date=datetime(2023, 11, 1, tzinfo=timezone.utc),
        last_deploy_days=547,
        last_seen_days=2,
        schema_count=0,
        max_cvss=9.1,
        cve_ids=["CVE-2023-26115"],
    )
    sample_classification = ClassificationResult(
        rule_state="orphaned",
        rule_reason="no owner present, undocumented, live traffic on legacy-vm",
        ml_state="orphaned",
        ml_confidence=0.94,
        agreement=True,
        is_zombie=True,
        is_shadow=True,
    )
    sample_risk = RiskResult(
        score=91.0,
        band="critical",
        factors={
            "data_sensitivity": 9.2,
            "auth_strength": 1.0,
            "staleness": 9.5,
            "blast_radius": 7.0,
            "cve_owasp_match": 8.5,
        },
    )
    sample_graph = GraphFeatures(
        in_routes_to=0,
        out_owned_by=0,
        out_deployed_on=1,
        blast_radius_total=7,
        sensitive_db_count=1,
        internet_reachable=True,
    )
    sample_traffic = TrafficSummary(
        calls_7d=12,
        calls_30d=47,
        auth_fail_rate_7d=0.0,
        p95_latency_ms=412.0,
        trend_pct_30d=-94.2,
    )
    sample_owasp = [
        "API1:BOLA",
        "API2:Broken-Authentication",
        "API9:Improper-Inventory-Management",
    ]
    sample_anomaly = AnomalyResult(flag=True, score=0.78)

    sep = "=" * 80
    sub = "-" * 80

    print(sep)
    print("THREAT NARRATIVE")
    print(sep)
    sys_prompt, user_ctx = build_threat_narrative(
        sample_endpoint,
        sample_classification,
        sample_risk,
        sample_graph,
        sample_traffic,
        sample_owasp,
        sample_anomaly,
    )
    print(sys_prompt)
    print(sub)
    print(json.dumps(user_ctx, indent=2, default=str))

    print()
    print(sep)
    print("REMEDIATION PLAYBOOK")
    print(sep)
    sys_prompt, user_ctx = build_remediation_playbook(
        sample_endpoint,
        sample_classification,
        sample_risk,
        sample_graph,
        sample_owasp,
    )
    print(sys_prompt)
    print(sub)
    print(json.dumps(user_ctx, indent=2, default=str))

    print()
    print(sep)
    print("COMPLIANCE SUMMARY (RBI_2024)")
    print(sep)
    sys_prompt, user_ctx = build_compliance_summary(
        sample_endpoint,
        sample_classification,
        sample_risk,
        sample_owasp,
        ComplianceFramework.RBI_2024,
        graph=sample_graph,
    )
    print(sys_prompt)
    print(sub)
    print(json.dumps(user_ctx, indent=2, default=str))
