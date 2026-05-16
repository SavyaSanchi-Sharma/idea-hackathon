import type {
  ApiGraph,
  BlastRadius,
  Endpoint,
  GraphEdge,
  GraphNode,
  ScanEvent,
  ScanJob,
  ScanStats,
  ServiceLane,
  SummaryStats,
} from "@/types/models";

const now = new Date();
const CURRENT_YEAR = now.getFullYear();

function daysAgo(d: number): string {
  return new Date(now.getTime() - d * 86_400_000).toISOString();
}

function declining(base: number, len = 30): number[] {
  return Array.from({ length: len }, (_, i) =>
    Math.max(0, Math.round(base * Math.pow(0.94, i) + (Math.random() * base * 0.04 - base * 0.02))),
  ).reverse();
}

function healthy(base: number, len = 30): number[] {
  return Array.from({ length: len }, () =>
    Math.max(0, Math.round(base + (Math.random() * base * 0.18 - base * 0.09))),
  );
}

function specimenIdFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return `zh-${(h % 9000 + 1000).toString().padStart(4, "0")}`;
}

function birthIsoFromYear(year: number, salt: number): string {
  const month = ((salt * 7) % 12) + 1;
  const day = ((salt * 11) % 27) + 1;
  return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}T00:00:00Z`;
}

// Banking-authentic Indian fixtures. The six hero specimens at the top match
// the migration brief's required fixture content exactly.
type SeedEndpoint = Omit<
  Endpoint,
  "specimen_id" | "birth_year" | "t0" | "service_lane"
> & {
  birth_year: number;
  service_lane: ServiceLane;
};

const SEED: SeedEndpoint[] = [
  // ───────────────── HERO CRITICAL — these six are pinned for the top-risk strip
  {
    id: "ep_legacy_upi_collect_v1",
    method: "GET",
    path: "/legacy/upi/collect-v1",
    service: "upi-gateway",
    classification: "orphaned",
    classification_reasons: [
      "no owner of record",
      "0 commits in 28 months",
      "traffic −94.0% vs prior 90-day window",
      "not present in registry (shadow)",
      "matches CVE-2019-12384 UPI handler pattern",
    ],
    posture_score: 92,
    score_factors: {
      data_sensitivity: {
        score: 9,
        weight: 0.25,
        detail: "VPA, payer/payee PAN, account, transaction context",
      },
      auth_strength: {
        score: 9,
        weight: 0.25,
        detail: "basic auth · no rate limit · no MFA",
      },
      staleness: {
        score: 10,
        weight: 0.2,
        detail: "no commits 28mo · last author left org",
      },
      blast_radius: {
        score: 9,
        weight: 0.15,
        detail: "reaches core-banking ledger and NPCI rails",
      },
      cve_owasp_match: {
        score: 8,
        weight: 0.15,
        detail: "CVE-2019-12384 · OWASP API1:2023",
      },
    },
    risk_tier: "critical",
    discovery_sources: ["traffic_logs", "code_scan"],
    in_registry: false,
    owner: { team: "payments-legacy", last_author: null },
    traffic: { calls_30d: 2, last_seen: daysAgo(0), trend_pct: -94.0, sparkline: declining(60) },
    auth: { type: "basic", rate_limited: false, mfa: false },
    data_classes: ["PAN", "Aadhaar", "account", "transaction"],
    last_commit: daysAgo(720),
    last_deploy: daysAgo(620),
    cve_matches: [
      { id: "CVE-2019-12384", score: 9.1, summary: "Improper auth in legacy UPI collect handler" },
    ],
    owasp_tags: ["API1:2023", "API2:2023"],
    threat_narrative:
      "This endpoint accepts a UPI collect request without authentication and returns counterparty PAN, Aadhaar hash, and account balance in the response payload. Last received traffic in March 2018, three months before its original author's last commit. The endpoint has not been deployed since v3.2.1 (Oct 2018) and is not present in the bank's official OpenAPI registry. Pattern matches CVE-2019-12384 and OWASP API1:2023. A scan from an attacker IP could enumerate ~3.4M records before any rate-limit applies. Recommended: full block, generate playbook, file RBI IT-Gov incident IR-2025-XXXX.",
    recommended_action: "block",
    blast_radius_nodes: ["svc_upi_core", "db_upi_ledger", "ext_npci_upi"],
    birth_year: 2014,
    service_lane: "upi",
  },
  {
    id: "ep_internal_core_account_balance",
    method: "GET",
    path: "/internal/core/account-balance",
    service: "core-banking-internal",
    classification: "orphaned",
    classification_reasons: [
      "no owner team in registry",
      "no commits 32 months",
      "service-mesh identity allows any callsite",
    ],
    posture_score: 87,
    score_factors: {
      data_sensitivity: {
        score: 9,
        weight: 0.25,
        detail: "raw account number + balance + customer name",
      },
      auth_strength: {
        score: 9,
        weight: 0.25,
        detail: "shared mTLS identity · no caller assertion",
      },
      staleness: { score: 9, weight: 0.2, detail: "no commits 32mo" },
      blast_radius: { score: 9, weight: 0.15, detail: "reads any account in the core" },
      cve_owasp_match: { score: 7, weight: 0.15, detail: "OWASP API3 excessive data exposure" },
    },
    risk_tier: "critical",
    discovery_sources: ["traffic_logs"],
    in_registry: false,
    owner: { team: null, last_author: null },
    traffic: { calls_30d: 0, last_seen: daysAgo(34), trend_pct: -100, sparkline: declining(8) },
    auth: { type: "mTLS", rate_limited: false, mfa: false },
    data_classes: ["account", "PII"],
    last_commit: daysAgo(960),
    last_deploy: daysAgo(820),
    cve_matches: [],
    owasp_tags: ["API3:2023", "API5:2023"],
    threat_narrative:
      "Internal core-banking account balance reader from a 2009 batch-job era. Authorization is via shared service-mesh mTLS without a caller assertion: any pod in the cluster can call it. The response includes the raw account number, customer full name, and current cleared balance. The original team disbanded in the 2021 core-banking modernization, leaving the endpoint live and indexed by the service registry. An attacker who lands any code in the cluster can enumerate the entire deposit book through this route.",
    recommended_action: "block",
    blast_radius_nodes: ["svc_core_banking", "db_core_accounts"],
    birth_year: 2009,
    service_lane: "core",
  },
  {
    id: "ep_legacy_kyc_aadhaar_verify_v2",
    method: "POST",
    path: "/legacy/kyc/aadhaar-verify-v2",
    service: "kyc-services",
    classification: "orphaned",
    classification_reasons: [
      "owner team onboarding-legacy disbanded",
      "no commits 18 months",
      "not in registry",
    ],
    posture_score: 78,
    score_factors: {
      data_sensitivity: {
        score: 10,
        weight: 0.25,
        detail: "Aadhaar number + OTP + demographics",
      },
      auth_strength: { score: 7, weight: 0.25, detail: "OAuth2 but stale scope mapping" },
      staleness: { score: 8, weight: 0.2, detail: "18mo idle · team disbanded" },
      blast_radius: { score: 8, weight: 0.15, detail: "writes verified-Aadhaar tokens to legacy DB" },
      cve_owasp_match: { score: 6, weight: 0.15, detail: "OWASP API1 · API3" },
    },
    risk_tier: "high",
    discovery_sources: ["traffic_logs", "code_scan"],
    in_registry: false,
    owner: { team: "onboarding-legacy", last_author: null },
    traffic: { calls_30d: 47, last_seen: daysAgo(1), trend_pct: -62.0, sparkline: declining(18) },
    auth: { type: "OAuth2", rate_limited: false, mfa: false },
    data_classes: ["Aadhaar", "PII", "KYC"],
    last_commit: daysAgo(540),
    last_deploy: daysAgo(430),
    cve_matches: [],
    owasp_tags: ["API1:2023", "API3:2023"],
    threat_narrative:
      "Zombie Aadhaar verification surface from a 2016 KYC pilot. The OAuth2 scope it accepts is still granted to a service account used by a discontinued onboarding partner. Successful calls write a verified-Aadhaar token into a legacy database that is still trusted by downstream KYC checks. A single credential leak here would expose Aadhaar verification at scale and trigger an RBI IT-Gov / UIDAI reporting obligation.",
    recommended_action: "block",
    blast_radius_nodes: ["svc_kyc_legacy", "db_kyc_docs_legacy", "ext_uidai"],
    birth_year: 2016,
    service_lane: "kyc",
  },
  {
    id: "ep_internal_aml_screen",
    method: "PUT",
    path: "/internal/aml/screen",
    service: "aml-services",
    classification: "deprecated",
    classification_reasons: [
      "marked deprecated · replaced by /v2/aml/screen",
      "traffic −12% vs prior window",
      "no commits 9 months",
    ],
    posture_score: 64,
    score_factors: {
      data_sensitivity: { score: 7, weight: 0.25, detail: "name, DOB, PAN, transaction graph" },
      auth_strength: { score: 5, weight: 0.25, detail: "internal mTLS, no per-caller scope" },
      staleness: { score: 6, weight: 0.2, detail: "9mo idle" },
      blast_radius: { score: 6, weight: 0.15, detail: "writes case state · downstream blocks transactions" },
      cve_owasp_match: { score: 4, weight: 0.15, detail: "OWASP API5 · function-level auth" },
    },
    risk_tier: "medium",
    discovery_sources: ["traffic_logs", "registry"],
    in_registry: true,
    owner: { team: "risk", last_author: "p.kulkarni@unionbank.in" },
    traffic: { calls_30d: 832, last_seen: daysAgo(0), trend_pct: -12.0, sparkline: declining(48) },
    auth: { type: "mTLS", rate_limited: true, mfa: false },
    data_classes: ["PII", "PAN", "transaction"],
    last_commit: daysAgo(270),
    last_deploy: daysAgo(200),
    cve_matches: [],
    owasp_tags: ["API5:2023"],
    threat_narrative:
      "AML screening write surface from the 2018 risk-engine generation. Internal mTLS without a per-caller scope means the surrounding service mesh can drive case state — including blocking customer transactions — without an attributable identity. Replacement endpoint exists in v2 but two batch jobs still write through here, blocking cutover.",
    recommended_action: "quarantine",
    blast_radius_nodes: ["svc_aml_core", "db_aml_cases"],
    birth_year: 2018,
    service_lane: "aml",
  },
  {
    id: "ep_legacy_imps_p2p_transfer",
    method: "POST",
    path: "/legacy/imps/p2p-transfer",
    service: "imps-rails",
    classification: "orphaned",
    classification_reasons: [
      "not in registry",
      "owner team payments-legacy disbanded",
      "no commits 17 months",
    ],
    posture_score: 72,
    score_factors: {
      data_sensitivity: { score: 8, weight: 0.25, detail: "MMID, mobile, amount" },
      auth_strength: { score: 7, weight: 0.25, detail: "static API key · no rate limit" },
      staleness: { score: 8, weight: 0.2, detail: "17mo idle" },
      blast_radius: { score: 8, weight: 0.15, detail: "writes through legacy IMPS adapter to NPCI" },
      cve_owasp_match: { score: 5, weight: 0.15, detail: "OWASP API1 · API2" },
    },
    risk_tier: "high",
    discovery_sources: ["traffic_logs"],
    in_registry: false,
    owner: { team: "payments-legacy", last_author: null },
    traffic: { calls_30d: 530, last_seen: daysAgo(1), trend_pct: -92.1, sparkline: declining(30) },
    auth: { type: "api_key", rate_limited: false, mfa: false },
    data_classes: ["PII", "transaction"],
    last_commit: daysAgo(510),
    last_deploy: daysAgo(440),
    cve_matches: [],
    owasp_tags: ["API1:2023", "API2:2023"],
    threat_narrative:
      "Legacy IMPS peer-to-peer surface that nobody has touched in over a year and a half. A static API key — committed to the legacy repo — is the only authentication, and the path still routes through the legacy IMPS adapter into NPCI. If discovered externally, an attacker could initiate transfers at scale against the bank's own MMID directory.",
    recommended_action: "block",
    blast_radius_nodes: ["svc_imps_legacy", "ext_npci_imps"],
    birth_year: 2015,
    service_lane: "imps",
  },
  {
    id: "ep_legacy_auth_session_token",
    method: "DELETE",
    path: "/legacy/auth/session-token",
    service: "auth-edge",
    classification: "orphaned",
    classification_reasons: [
      "not in registry",
      "no owner team",
      "no commits 26 months",
      "static signing key",
    ],
    posture_score: 70,
    score_factors: {
      data_sensitivity: {
        score: 8,
        weight: 0.25,
        detail: "deletes long-lived session tokens system-wide",
      },
      auth_strength: { score: 8, weight: 0.25, detail: "shared static HMAC · no rotation" },
      staleness: { score: 9, weight: 0.2, detail: "26mo · original author gone" },
      blast_radius: { score: 7, weight: 0.15, detail: "session middleware honors this surface" },
      cve_owasp_match: { score: 5, weight: 0.15, detail: "OWASP API2 broken auth" },
    },
    risk_tier: "high",
    discovery_sources: ["traffic_logs"],
    in_registry: false,
    owner: { team: "identity", last_author: null },
    traffic: { calls_30d: 880, last_seen: daysAgo(0), trend_pct: -96.0, sparkline: declining(48) },
    auth: { type: "none", rate_limited: false, mfa: false },
    data_classes: ["session", "credentials"],
    last_commit: daysAgo(790),
    last_deploy: daysAgo(640),
    cve_matches: [
      { id: "CVE-2022-22965", score: 9.8, summary: "Legacy Spring binder pattern vulnerable container detected" },
    ],
    owasp_tags: ["API2:2023"],
    threat_narrative:
      "A 2012 internal session-token revocation surface that should have been decommissioned. It accepts a static HMAC key checked into the legacy repo and accepted by the current core-banking session middleware. Anyone with the key can revoke a session for any customer, or — by replaying issuance — mint one. There is no owner, no rate limit, no MFA, and the original author left in 2023.",
    recommended_action: "block",
    blast_radius_nodes: ["svc_auth", "svc_core_banking", "db_core_accounts"],
    birth_year: 2012,
    service_lane: "auth",
  },
];

// ─── BREADTH: ~50 additional banking-authentic specimens across all strata ───

interface QuickSeed {
  id: string;
  method: Endpoint["method"];
  path: string;
  service: string;
  classification: Endpoint["classification"];
  risk_tier: Endpoint["risk_tier"];
  posture: number;
  birth_year: number;
  service_lane: ServiceLane;
  calls: number;
  trend: number;
  team: string | null;
  auth: Endpoint["auth"];
  data_classes: string[];
  narrative: string;
  cve?: { id: string; score: number; summary: string }[];
  owasp?: string[];
  recommended?: Endpoint["recommended_action"];
}

const QUICK: QuickSeed[] = [
  // Active modern (2022-2026)
  { id: "ep_v2_upi_collect", method: "POST", path: "/v2/upi/collect", service: "upi-gateway", classification: "active", risk_tier: "low", posture: 28, birth_year: 2024, service_lane: "upi", calls: 8_420_310, trend: 12.3, team: "payments-platform", auth: { type: "OAuth2", rate_limited: true, mfa: true }, data_classes: ["VPA", "transaction"], narrative: "Primary UPI collect surface. mTLS to NPCI, OAuth2 with per-VPA scope, 60 req/min/VPA throttle. PCI-DSS in-scope; clean OWASP review." },
  { id: "ep_v1_upi_pay", method: "POST", path: "/v1/upi/pay", service: "upi-gateway", classification: "active", risk_tier: "low", posture: 32, birth_year: 2023, service_lane: "upi", calls: 12_044_900, trend: 18.1, team: "payments-platform", auth: { type: "OAuth2", rate_limited: true, mfa: true }, data_classes: ["VPA", "transaction"], narrative: "Push payment surface. Enforces step-up MFA above ₹25,000. Real-time NPCI message exchange." },
  { id: "ep_v1_imps_transfer", method: "POST", path: "/v1/imps/transfer", service: "imps-rails", classification: "active", risk_tier: "low", posture: 35, birth_year: 2022, service_lane: "imps", calls: 1_182_044, trend: 4.3, team: "payments-platform", auth: { type: "OAuth2", rate_limited: true, mfa: true }, data_classes: ["PII", "transaction"], narrative: "IMPS p2p transfer. NPCI-side velocity controls layered with bank-side per-MMID caps." },
  { id: "ep_v1_neft_initiate", method: "POST", path: "/v1/neft/initiate", service: "neft-orchestrator", classification: "active", risk_tier: "low", posture: 34, birth_year: 2022, service_lane: "neft", calls: 412_004, trend: 1.2, team: "payments-platform", auth: { type: "OAuth2", rate_limited: true, mfa: true }, data_classes: ["account", "PII"], narrative: "NEFT batch initiation. Step-up MFA above ₹2L; in PCI-DSS scope review for FY26." },
  { id: "ep_v1_rtgs_transfer", method: "POST", path: "/v1/rtgs/transfer", service: "rtgs-gateway", classification: "active", risk_tier: "medium", posture: 41, birth_year: 2021, service_lane: "rtgs", calls: 47_220, trend: -2.1, team: "payments-platform", auth: { type: "OAuth2", rate_limited: true, mfa: true }, data_classes: ["account", "PII"], narrative: "High-value rails. Settlement finality on RBI side means abuse is irreversible. Per-customer daily caps enforced.", owasp: ["API1:2023"] },
  { id: "ep_v1_kyc_aadhaar_verify", method: "POST", path: "/v1/kyc/aadhaar/verify", service: "kyc-services", classification: "active", risk_tier: "low", posture: 33, birth_year: 2024, service_lane: "kyc", calls: 412_900, trend: 3.1, team: "kyc-platform", auth: { type: "OAuth2", rate_limited: true, mfa: false }, data_classes: ["Aadhaar", "PII"], narrative: "Aadhaar OTP verification. UIDAI VID-first flow; no raw Aadhaar persisted." },
  { id: "ep_v1_aml_screen", method: "POST", path: "/v1/aml/screen", service: "aml-services", classification: "active", risk_tier: "medium", posture: 39, birth_year: 2023, service_lane: "aml", calls: 318_000, trend: -1.4, team: "compliance-eng", auth: { type: "mTLS", rate_limited: true, mfa: false }, data_classes: ["PII", "PAN", "transaction"], narrative: "AML screening fan-out across sanction lists. Internal mTLS only; per-caller scope.", owasp: ["API3:2023"] },
  { id: "ep_v1_cards_balance", method: "GET", path: "/v1/cards/balance", service: "card-platform", classification: "active", risk_tier: "low", posture: 29, birth_year: 2024, service_lane: "cards", calls: 4_201_220, trend: 6.4, team: "card-platform", auth: { type: "OAuth2", rate_limited: true, mfa: false }, data_classes: ["PAN"], narrative: "Card balance read. Network token only; raw PAN never returned." },
  { id: "ep_v1_cards_payment", method: "POST", path: "/v1/cards/payment", service: "card-platform", classification: "active", risk_tier: "low", posture: 31, birth_year: 2023, service_lane: "cards", calls: 2_204_188, trend: 7.8, team: "card-platform", auth: { type: "mTLS", rate_limited: true, mfa: true }, data_classes: ["PAN", "PII"], narrative: "Card-not-present payment with HSM-backed cryptogram verification." },
  { id: "ep_v1_accounts_get", method: "GET", path: "/v1/accounts/{id}", service: "core-banking", classification: "active", risk_tier: "medium", posture: 44, birth_year: 2022, service_lane: "core", calls: 19_482_100, trend: 0.4, team: "core-banking", auth: { type: "mTLS", rate_limited: true, mfa: false }, data_classes: ["account", "PII"], narrative: "Account lookup. Per-customer scope enforced at the gateway." , owasp: ["API4:2023"]},
  { id: "ep_v1_auth_oauth2_token", method: "POST", path: "/v1/auth/oauth2/token", service: "auth-edge", classification: "active", risk_tier: "low", posture: 30, birth_year: 2023, service_lane: "auth", calls: 24_018_220, trend: 1.1, team: "identity", auth: { type: "OAuth2", rate_limited: true, mfa: false }, data_classes: ["credentials"], narrative: "OAuth2 token issuance. Rotating refresh, device binding, replay protection." },
  { id: "ep_v2_ib_login", method: "POST", path: "/v2/ib/login", service: "internet-banking", classification: "active", risk_tier: "low", posture: 33, birth_year: 2024, service_lane: "auth", calls: 6_004_990, trend: 2.9, team: "digital-channels", auth: { type: "OAuth2", rate_limited: true, mfa: true }, data_classes: ["PII", "credentials"], narrative: "Internet banking login. Risk-based MFA stepup; device-binding enforced." },
  { id: "ep_v1_neft_status", method: "GET", path: "/v1/neft/status", service: "neft-orchestrator", classification: "active", risk_tier: "low", posture: 27, birth_year: 2024, service_lane: "neft", calls: 1_104_200, trend: 4.4, team: "payments-platform", auth: { type: "OAuth2", rate_limited: true, mfa: false }, data_classes: ["transaction"], narrative: "NEFT transaction status. Read-only; per-customer scope." },
  { id: "ep_v1_rtgs_status", method: "GET", path: "/v1/rtgs/status", service: "rtgs-gateway", classification: "active", risk_tier: "low", posture: 29, birth_year: 2023, service_lane: "rtgs", calls: 220_400, trend: 1.8, team: "payments-platform", auth: { type: "OAuth2", rate_limited: true, mfa: false }, data_classes: ["transaction"], narrative: "RTGS status lookup. Honored by netbanking dashboard." },
  { id: "ep_v1_aml_case_get", method: "GET", path: "/v1/aml/cases/{id}", service: "aml-services", classification: "active", risk_tier: "medium", posture: 41, birth_year: 2023, service_lane: "aml", calls: 18_220, trend: 0.2, team: "compliance-eng", auth: { type: "mTLS", rate_limited: true, mfa: false }, data_classes: ["PII", "AML"], narrative: "AML case read. Per-analyst RBAC enforced at the gateway." },
  { id: "ep_v1_loans_apply", method: "POST", path: "/v1/loans/apply", service: "loans-origination", classification: "active", risk_tier: "low", posture: 36, birth_year: 2024, service_lane: "internal", calls: 78_440, trend: 6.2, team: "lending", auth: { type: "OAuth2", rate_limited: true, mfa: true }, data_classes: ["PII", "PAN", "income"], narrative: "Loan origination submit. Credit bureau pull pipeline. Last review closed clean." },
  { id: "ep_v1_statements", method: "GET", path: "/v1/accounts/{id}/statements", service: "statements-api", classification: "active", risk_tier: "medium", posture: 38, birth_year: 2022, service_lane: "internal", calls: 5_004_220, trend: 2.6, team: "retail-banking", auth: { type: "OAuth2", rate_limited: true, mfa: false }, data_classes: ["account", "transaction"], narrative: "Statements read. Pagination enforced server-side; unbounded ranges under review.", owasp: ["API4:2023"] },
  { id: "ep_v1_directory_ifsc", method: "GET", path: "/v1/directory/ifsc", service: "directory-service", classification: "active", risk_tier: "low", posture: 24, birth_year: 2023, service_lane: "internal", calls: 102_400, trend: 0.6, team: "platform", auth: { type: "OAuth2", rate_limited: true, mfa: false }, data_classes: [], narrative: "Public IFSC directory v2. Cached at the edge; rate-limited." },
  { id: "ep_v1_cards_tokenize", method: "POST", path: "/v1/cards/tokenize", service: "card-vault", classification: "active", risk_tier: "low", posture: 31, birth_year: 2023, service_lane: "cards", calls: 2_204_188, trend: 7.8, team: "card-platform", auth: { type: "mTLS", rate_limited: true, mfa: false }, data_classes: ["PAN", "PII"], narrative: "Card tokenization in PCI scope. HSM-backed key wrapping; quarterly audit." },
  { id: "ep_v1_session_refresh", method: "POST", path: "/v1/auth/session/refresh", service: "auth-edge", classification: "active", risk_tier: "low", posture: 30, birth_year: 2024, service_lane: "auth", calls: 24_018_220, trend: 1.1, team: "identity", auth: { type: "OAuth2", rate_limited: true, mfa: false }, data_classes: ["session"], narrative: "Session refresh. Rotating tokens; device binding; replay protection." },
  // Active transitional (2018-2021)
  { id: "ep_v1_kyc_status", method: "GET", path: "/v2/kyc/status", service: "kyc-services", classification: "active", risk_tier: "low", posture: 33, birth_year: 2020, service_lane: "kyc", calls: 412_900, trend: 3.1, team: "kyc-platform", auth: { type: "OAuth2", rate_limited: true, mfa: false }, data_classes: ["PII", "KYC"], narrative: "KYC status read for self-service journeys. Field-level masking applied." },
  { id: "ep_v2_neft_reconcile", method: "POST", path: "/v2/neft/reconcile", service: "neft-orchestrator", classification: "active", risk_tier: "medium", posture: 42, birth_year: 2021, service_lane: "neft", calls: 64_100, trend: -0.6, team: "payments-platform", auth: { type: "OAuth2", rate_limited: true, mfa: false }, data_classes: ["account"], narrative: "NEFT reconciliation. Replaces /internal/neft/reconcile but legacy callers persist." },
  { id: "ep_v1_npci_callback", method: "POST", path: "/v1/npci/callback", service: "upi-gateway", classification: "active", risk_tier: "medium", posture: 44, birth_year: 2020, service_lane: "upi", calls: 18_044_410, trend: 8.2, team: "payments-platform", auth: { type: "mTLS", rate_limited: true, mfa: false }, data_classes: ["transaction"], narrative: "NPCI callback ingest. mTLS-pinned to NPCI; signature verified per-message." },
  // Deprecated transitional (2017-2020)
  { id: "ep_v1_kyc_doc_upload_deprecated", method: "POST", path: "/v1/kyc/document/upload", service: "kyc-services", classification: "deprecated", risk_tier: "high", posture: 54, birth_year: 2017, service_lane: "kyc", calls: 4_220, trend: -47.0, team: "kyc-platform", auth: { type: "OAuth2", rate_limited: true, mfa: false }, data_classes: ["Aadhaar", "PAN", "KYC"], narrative: "Legacy KYC doc upload. Writes to deprecated S3 bucket without server-side encryption key rotation.", owasp: ["API3:2023"] },
  { id: "ep_v1_aml_screen_batch_v1", method: "POST", path: "/v1/aml/screen-batch-v1", service: "aml-services", classification: "deprecated", risk_tier: "medium", posture: 49, birth_year: 2018, service_lane: "aml", calls: 1_120, trend: -22.4, team: "compliance-eng", auth: { type: "mTLS", rate_limited: true, mfa: false }, data_classes: ["PII", "transaction"], narrative: "Batch AML screening v1. Replaced by stream-based v2; one legacy nightly still calls it." },
  { id: "ep_v1_imps_mmid_lookup", method: "GET", path: "/v1/imps/mmid-lookup", service: "imps-rails", classification: "deprecated", risk_tier: "medium", posture: 49, birth_year: 2018, service_lane: "imps", calls: 7_120, trend: -54.0, team: "payments-platform", auth: { type: "OAuth2", rate_limited: false, mfa: false }, data_classes: ["PII"], narrative: "MMID lookup directory. Unbounded pagination; replacement endpoint exists in v2.", owasp: ["API4:2023"] },
  { id: "ep_v2_kyc_aadhaar_old", method: "POST", path: "/v2/kyc/aadhaar-old", service: "kyc-services", classification: "deprecated", risk_tier: "high", posture: 58, birth_year: 2019, service_lane: "kyc", calls: 320, trend: -78.0, team: "kyc-platform", auth: { type: "OAuth2", rate_limited: false, mfa: false }, data_classes: ["Aadhaar", "PII"], narrative: "Older Aadhaar verification path. Slated for removal in FY26 Q3." },
  { id: "ep_v1_cards_pin_reset", method: "POST", path: "/v1/cards/atm-pin/reset", service: "card-platform", classification: "deprecated", risk_tier: "high", posture: 58, birth_year: 2018, service_lane: "cards", calls: 1_640, trend: -39.0, team: "card-platform", auth: { type: "OAuth2", rate_limited: true, mfa: false }, data_classes: ["PAN", "credentials"], narrative: "Legacy ATM PIN reset that still emits a PIN block to the HSM. Authorization relies on OTP only.", owasp: ["API1:2023"] },
  { id: "ep_v1_cards_block_old", method: "POST", path: "/v1/cards/block", service: "card-platform", classification: "deprecated", risk_tier: "medium", posture: 47, birth_year: 2017, service_lane: "cards", calls: 9_040, trend: -22.4, team: "card-platform", auth: { type: "OAuth2", rate_limited: true, mfa: false }, data_classes: ["PAN"], narrative: "Card block v1 replaced by v2 with richer reason codes; one IVR adaptor still uses it." },
  { id: "ep_v1_neft_reconcile_internal", method: "POST", path: "/internal/neft/reconcile", service: "neft-orchestrator", classification: "deprecated", risk_tier: "medium", posture: 52, birth_year: 2018, service_lane: "neft", calls: 14_220, trend: -68.4, team: "payments-platform", auth: { type: "api_key", rate_limited: false, mfa: false }, data_classes: ["account", "transaction"], narrative: "Internal NEFT reconciliation. Static API key persists for two batch jobs.", owasp: ["API2:2023"] },
  { id: "ep_v1_rtgs_admin", method: "POST", path: "/v1/rtgs/admin/replay", service: "rtgs-gateway", classification: "deprecated", risk_tier: "high", posture: 60, birth_year: 2019, service_lane: "rtgs", calls: 22, trend: -82.0, team: "payments-platform", auth: { type: "api_key", rate_limited: false, mfa: false }, data_classes: ["transaction"], narrative: "Admin replay for legacy RTGS outbox. Cutover scheduled.", owasp: ["API5:2023"] },
  { id: "ep_v1_aml_export_old", method: "GET", path: "/v1/aml/export", service: "aml-services", classification: "deprecated", risk_tier: "medium", posture: 51, birth_year: 2017, service_lane: "aml", calls: 88, trend: -71.0, team: "compliance-eng", auth: { type: "OAuth2", rate_limited: false, mfa: false }, data_classes: ["PII", "AML"], narrative: "Bulk AML export. Sufficient throttling but unbounded date windows; under review.", owasp: ["API4:2023"] },
  // Orphaned legacy mid-stratum (2014-2017)
  { id: "ep_legacy_kyc_doc_v1", method: "POST", path: "/legacy/kyc/document/upload-v1", service: "kyc-legacy", classification: "orphaned", risk_tier: "high", posture: 80, birth_year: 2016, service_lane: "kyc", calls: 12, trend: -88.0, team: null, auth: { type: "basic", rate_limited: false, mfa: false }, data_classes: ["Aadhaar", "PAN"], narrative: "Legacy KYC document upload. No owner. Writes to legacy bucket with stale lifecycle.", owasp: ["API3:2023"] },
  { id: "ep_legacy_neft_admin_replay", method: "POST", path: "/legacy/neft/admin/replay", service: "neft-legacy", classification: "orphaned", risk_tier: "critical", posture: 86, birth_year: 2014, service_lane: "neft", calls: 18, trend: -97.0, team: null, auth: { type: "basic", rate_limited: false, mfa: false }, data_classes: ["transaction"], narrative: "Legacy NEFT admin replay. Basic auth with legacy directory credentials; replay-attack risk.", owasp: ["API2:2023", "API5:2023"] },
  { id: "ep_legacy_rtgs_callback", method: "POST", path: "/legacy/rtgs/callback", service: "rtgs-legacy", classification: "orphaned", risk_tier: "critical", posture: 81, birth_year: 2015, service_lane: "rtgs", calls: 42, trend: -88.4, team: null, auth: { type: "none", rate_limited: false, mfa: false }, data_classes: ["transaction"], narrative: "Legacy RTGS status callback authorized solely on source IP; upstream NAT range has been re-used.", owasp: ["API2:2023"] },
  { id: "ep_legacy_cards_pin_view", method: "GET", path: "/legacy/cards/pin/view", service: "card-legacy", classification: "orphaned", risk_tier: "critical", posture: 90, birth_year: 2014, service_lane: "cards", calls: 0, trend: -100, team: null, auth: { type: "api_key", rate_limited: false, mfa: false }, data_classes: ["PIN", "PAN"], narrative: "Forgotten endpoint returning encrypted PIN block. Static API key. No traffic for 60 days but reachable.", owasp: ["API2:2023", "API3:2023"] },
  { id: "ep_legacy_aml_export", method: "GET", path: "/legacy/aml/cases/export", service: "aml-legacy", classification: "orphaned", risk_tier: "high", posture: 78, birth_year: 2017, service_lane: "aml", calls: 22, trend: -84.0, team: null, auth: { type: "OAuth2", rate_limited: false, mfa: false }, data_classes: ["PII", "PAN", "AML"], narrative: "Bulk AML case exporter pre-dating the current case-management system.", owasp: ["API3:2023", "API5:2023"] },
  { id: "ep_legacy_loans_export", method: "GET", path: "/legacy/loans/export", service: "loans-legacy", classification: "orphaned", risk_tier: "high", posture: 75, birth_year: 2015, service_lane: "internal", calls: 8, trend: -92.0, team: null, auth: { type: "basic", rate_limited: false, mfa: false }, data_classes: ["PII", "loan"], narrative: "Legacy loan book exporter. Unbounded pagination returning every PII field.", owasp: ["API3:2023"] },
  { id: "ep_legacy_kyc_aadhaar_otp", method: "POST", path: "/legacy/kyc/aadhaar/otp-verify", service: "kyc-legacy", classification: "orphaned", risk_tier: "high", posture: 76, birth_year: 2016, service_lane: "kyc", calls: 64, trend: -84.0, team: null, auth: { type: "basic", rate_limited: false, mfa: false }, data_classes: ["Aadhaar", "PII"], narrative: "Forgotten Aadhaar OTP verify. Basic auth. Reaches UIDAI rails through legacy adapter." , owasp: ["API1:2023"] },
  // Orphaned deep-stratum (pre-2014)
  { id: "ep_legacy_core_dump", method: "GET", path: "/legacy/core/raw-dump", service: "core-banking-internal", classification: "orphaned", risk_tier: "critical", posture: 88, birth_year: 2010, service_lane: "core", calls: 0, trend: -100, team: null, auth: { type: "none", rate_limited: false, mfa: false }, data_classes: ["account", "PII"], narrative: "2010-era raw dump endpoint that returns serialized account snapshots. Reachable internally; no caller assertion." },
  { id: "ep_legacy_auth_signin_v0", method: "POST", path: "/legacy/auth/signin-v0", service: "auth-legacy", classification: "orphaned", risk_tier: "critical", posture: 84, birth_year: 2011, service_lane: "auth", calls: 6, trend: -98.0, team: null, auth: { type: "basic", rate_limited: false, mfa: false }, data_classes: ["credentials", "PII"], narrative: "2011 signin path. Basic auth, returns long-lived session cookies accepted by current middleware.", owasp: ["API2:2023"] },
  { id: "ep_legacy_internal_log_dump", method: "GET", path: "/internal/debug/log-dump", service: "platform-legacy", classification: "orphaned", risk_tier: "high", posture: 74, birth_year: 2013, service_lane: "internal", calls: 4, trend: -95.0, team: null, auth: { type: "none", rate_limited: false, mfa: false }, data_classes: ["PII"], narrative: "Internal debug log dumper. No auth. Indexed by service-mesh registry but absent from CMDB." },
  { id: "ep_legacy_cron_eod_batch", method: "POST", path: "/v1/cron/eod-batch", service: "platform-legacy", classification: "orphaned", risk_tier: "high", posture: 72, birth_year: 2013, service_lane: "internal", calls: 1, trend: -98.0, team: null, auth: { type: "basic", rate_limited: false, mfa: false }, data_classes: ["transaction"], narrative: "Cron-triggered end-of-day batch trigger. Basic auth using a service password unchanged since 2014." },
  { id: "ep_legacy_admin_raw_query", method: "POST", path: "/v1/admin/raw-query", service: "platform-legacy", classification: "orphaned", risk_tier: "critical", posture: 91, birth_year: 2010, service_lane: "internal", calls: 0, trend: -100, team: null, auth: { type: "basic", rate_limited: false, mfa: false }, data_classes: ["account", "PII"], narrative: "Pre-2010 admin SQL passthrough. Static admin credentials. Reachable from any pod in the cluster." },
  { id: "ep_legacy_cards_export", method: "GET", path: "/legacy/cards/export", service: "card-legacy", classification: "orphaned", risk_tier: "high", posture: 79, birth_year: 2013, service_lane: "cards", calls: 0, trend: -100, team: null, auth: { type: "api_key", rate_limited: false, mfa: false }, data_classes: ["PAN"], narrative: "Bulk PAN exporter from the 2013 card platform. Static API key; PCI implications if reachable externally." },
  { id: "ep_legacy_upi_admin_close", method: "POST", path: "/legacy/upi/admin/close-session", service: "upi-legacy", classification: "orphaned", risk_tier: "high", posture: 73, birth_year: 2014, service_lane: "upi", calls: 11, trend: -96.0, team: null, auth: { type: "basic", rate_limited: false, mfa: false }, data_classes: ["session"], narrative: "Force-close UPI session admin endpoint. Basic auth; reachable through legacy gateway." },
  { id: "ep_legacy_imps_directory", method: "GET", path: "/legacy/imps/directory", service: "imps-legacy", classification: "orphaned", risk_tier: "medium", posture: 68, birth_year: 2013, service_lane: "imps", calls: 36, trend: -91.0, team: null, auth: { type: "api_key", rate_limited: false, mfa: false }, data_classes: ["PII"], narrative: "IMPS member-bank directory. Static API key. Replaced by NPCI's published JSON but still indexed." },
];

const FROM_QUICK: SeedEndpoint[] = QUICK.map((q) => {
  const factors = synthesizeFactors(q.posture, q.classification, q.risk_tier);
  return {
    id: q.id,
    method: q.method,
    path: q.path,
    service: q.service,
    classification: q.classification,
    classification_reasons: classificationReasonsFor(q),
    posture_score: q.posture,
    score_factors: factors,
    risk_tier: q.risk_tier,
    discovery_sources: q.classification === "orphaned" ? ["traffic_logs", "code_scan"] : ["traffic_logs", "registry"],
    in_registry: q.classification !== "orphaned",
    owner: { team: q.team, last_author: q.team ? "team.lead@unionbank.in" : null },
    traffic: {
      calls_30d: q.calls,
      last_seen: daysAgo(q.classification === "active" ? 0 : q.calls > 0 ? 2 : 60),
      trend_pct: q.trend,
      sparkline:
        q.classification === "orphaned"
          ? declining(Math.max(2, Math.round(q.calls / 4)))
          : q.classification === "deprecated"
            ? declining(Math.max(20, Math.round(q.calls / 12)))
            : healthy(Math.max(800, Math.round(q.calls / 30))),
    },
    auth: q.auth,
    data_classes: q.data_classes,
    last_commit:
      q.classification === "orphaned"
        ? daysAgo(540)
        : q.classification === "deprecated"
          ? daysAgo(220)
          : daysAgo(15),
    last_deploy:
      q.classification === "orphaned"
        ? daysAgo(460)
        : q.classification === "deprecated"
          ? daysAgo(160)
          : daysAgo(8),
    cve_matches: q.cve ?? [],
    owasp_tags: q.owasp ?? [],
    threat_narrative: q.narrative,
    recommended_action: q.recommended ?? (q.classification === "orphaned" ? "block" : q.classification === "deprecated" ? "quarantine" : "monitor"),
    blast_radius_nodes: [],
    birth_year: q.birth_year,
    service_lane: q.service_lane,
  };
});

function classificationReasonsFor(q: QuickSeed): string[] {
  if (q.classification === "orphaned") {
    return [
      "no owner of record",
      "0 commits in 18+ months",
      "not present in registry (shadow)",
      `traffic ${q.trend.toFixed(1)}% vs prior 90-day window`,
    ];
  }
  if (q.classification === "deprecated") {
    return [
      "marked deprecated in registry",
      `traffic ${q.trend.toFixed(1)}% vs prior window`,
      "replacement endpoint exists",
    ];
  }
  return [
    "registry-known",
    `traffic ${q.trend > 0 ? "+" : ""}${q.trend.toFixed(1)}% vs prior window`,
    "active maintenance",
  ];
}

function synthesizeFactors(posture: number, c: Endpoint["classification"], t: Endpoint["risk_tier"]) {
  // Distribute posture across five factors deterministically.
  const total = posture / 10; // 0..10 nominal
  const skew = c === "orphaned" ? 1.2 : c === "deprecated" ? 1.0 : 0.7;
  const base = Math.max(1, Math.round(total * skew * 10) / 10);
  const ds = clamp(base + (t === "critical" ? 1.5 : 0), 1, 10);
  const au = clamp(base + (c === "orphaned" ? 1.0 : c === "deprecated" ? 0.4 : -1.2), 1, 10);
  const st = clamp(base + (c === "orphaned" ? 1.4 : c === "deprecated" ? 0.6 : -1.0), 1, 10);
  const br = clamp(base + (t === "critical" ? 1.2 : 0), 1, 10);
  const cv = clamp(base + (c === "orphaned" ? 0.6 : -0.8), 1, 10);
  return {
    data_sensitivity: { score: round1(ds), weight: 0.25, detail: "" },
    auth_strength: { score: round1(au), weight: 0.25, detail: "" },
    staleness: { score: round1(st), weight: 0.2, detail: "" },
    blast_radius: { score: round1(br), weight: 0.15, detail: "" },
    cve_owasp_match: { score: round1(cv), weight: 0.15, detail: "" },
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

const ALL_SEED: SeedEndpoint[] = [...SEED, ...FROM_QUICK];

export const FIXTURE_ENDPOINTS: Endpoint[] = ALL_SEED.map((s, idx) => ({
  ...s,
  specimen_id: specimenIdFor(s.id),
  t0: birthIsoFromYear(s.birth_year, idx + 1),
  service_lane: s.service_lane,
  birth_year: s.birth_year,
}));

// Pin the hero specimen ids exactly to what the brief calls for so the
// top-risk list reads as designed.
const HERO_ID_OVERRIDES: Record<string, string> = {
  ep_legacy_upi_collect_v1: "zh-0142",
  ep_internal_core_account_balance: "zh-0817",
  ep_legacy_kyc_aadhaar_verify_v2: "zh-2049",
  ep_internal_aml_screen: "zh-1188",
  ep_legacy_imps_p2p_transfer: "zh-0509",
  ep_legacy_auth_session_token: "zh-3471",
};
for (const e of FIXTURE_ENDPOINTS) {
  if (HERO_ID_OVERRIDES[e.id]) e.specimen_id = HERO_ID_OVERRIDES[e.id];
}

const aggregateOrphans = FIXTURE_ENDPOINTS.filter((e) => e.classification === "orphaned").length;
const aggregateDeprecated = FIXTURE_ENDPOINTS.filter((e) => e.classification === "deprecated").length;
const aggregateActive = FIXTURE_ENDPOINTS.filter((e) => e.classification === "active").length;
const aggregateCritical = FIXTURE_ENDPOINTS.filter((e) => e.risk_tier === "critical").length;

const REGISTRY_BASELINE = 247;
const TOTAL = REGISTRY_BASELINE + aggregateOrphans;

export const FIXTURE_SUMMARY: SummaryStats = {
  registry_baseline: REGISTRY_BASELINE,
  total_discovered: TOTAL,
  active: aggregateActive,
  deprecated: aggregateDeprecated,
  orphaned: aggregateOrphans,
  critical: aggregateCritical,
  last_scan_at: daysAgo(2),
};

export const FIXTURE_PRE_SCAN_SUMMARY: SummaryStats = {
  registry_baseline: REGISTRY_BASELINE,
  total_discovered: REGISTRY_BASELINE,
  active: aggregateActive + aggregateDeprecated,
  deprecated: 0,
  orphaned: 0,
  critical: 0,
  last_scan_at: null,
};

// ─── GRAPH ─────────────────────────────────────────────────────────────────

function buildGraph(): ApiGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenServices = new Set<string>();
  for (const e of FIXTURE_ENDPOINTS) {
    nodes.push({
      id: e.id,
      type: "endpoint",
      label: `${e.method} ${e.path}`,
      classification: e.classification,
      risk_tier: e.risk_tier,
      metadata: {
        specimen_id: e.specimen_id,
        service_lane: e.service_lane,
        birth_year: e.birth_year,
        calls_30d: e.traffic.calls_30d,
        method: e.method,
        path: e.path,
      },
    });
    if (!seenServices.has(e.service)) {
      seenServices.add(e.service);
      nodes.push({
        id: `svc__${e.service}`,
        type: "service",
        label: e.service,
        classification: e.classification === "active" ? "active" : "deprecated",
        metadata: { service_lane: e.service_lane },
      });
    }
    edges.push({ source: `svc__${e.service}`, target: e.id, type: "owned_by" });
  }
  // Add some cross-stratum dependency edges to demonstrate decade-spanning paths.
  const orphans = FIXTURE_ENDPOINTS.filter((e) => e.classification === "orphaned").slice(0, 8);
  const moderns = FIXTURE_ENDPOINTS.filter((e) => e.classification === "active" && e.birth_year >= 2022);
  for (const o of orphans) {
    const target = moderns.find((m) => m.service_lane === o.service_lane);
    if (target) edges.push({ source: target.id, target: o.id, type: "depends_on" });
  }
  return { nodes, edges };
}

export const FIXTURE_GRAPH: ApiGraph = buildGraph();

export const FIXTURE_BLAST_RADIUS = (originId: string): BlastRadius => {
  const origin = FIXTURE_ENDPOINTS.find((e) => e.id === originId);
  return {
    origin_id: originId,
    nodes: [],
    edges: [],
    affected_records: origin ? Math.round(3_400_000 * (origin.posture_score / 100)) : 0,
    affected_systems: ["core-banking", "kyc-legacy", "ext-npci"],
    has_write_access: origin?.method !== "GET",
  };
};

// ─── SCAN SIMULATION ───────────────────────────────────────────────────────

export type SimulatedWsMessage =
  | { type: "scan_progress"; payload: { scan_id: string; progress: number; stats: ScanStats } }
  | { type: "scan_event"; payload: ScanEvent }
  | { type: "scan_complete"; payload: ScanJob };

function isoNow(): string {
  return new Date().toISOString();
}

interface PlanStep {
  progressTo: number;
  events: Array<Omit<ScanEvent, "scan_id" | "ts">>;
  statsDelta?: Partial<ScanStats>;
}

export function buildScanSimulation(scanId: string): SimulatedWsMessage[] {
  const sequence: SimulatedWsMessage[] = [];
  const baseStats: ScanStats = {
    total_discovered: REGISTRY_BASELINE,
    active: aggregateActive + aggregateDeprecated,
    deprecated: 0,
    orphaned: 0,
    critical: 0,
    unknown_vs_registry: 0,
  };

  const plan: PlanStep[] = [
    {
      progressTo: 8,
      events: [
        { phase: "ingest", message: "depth = 2026 — opening 30d access log window", severity: "info" },
        { phase: "ingest", message: "depth = 2025 — service-mesh telemetry attached", severity: "info" },
      ],
    },
    {
      progressTo: 22,
      events: [
        { phase: "parse", message: "depth = 2024 — recovered 142 specimens · stratum 1 complete", severity: "info" },
        { phase: "parse", message: "depth = 2023 — recovered 27 unregistered endpoints", severity: "info" },
      ],
      statsDelta: { total_discovered: 274, unknown_vs_registry: 27 },
    },
    {
      progressTo: 38,
      events: [
        { phase: "graph", message: "depth = 2020 — 27 endpoints not in CMDB", severity: "warning" },
        {
          phase: "graph",
          message: "depth = 2018 — recovered /internal/aml/screen · deprecated",
          endpoint_id: "ep_internal_aml_screen",
          severity: "warning",
        },
      ],
      statsDelta: { total_discovered: 278, unknown_vs_registry: 31, deprecated: 2, orphaned: 1 },
    },
    {
      progressTo: 54,
      events: [
        {
          phase: "classify",
          message: "depth = 2016 — /legacy/kyc/aadhaar-verify-v2 classified orphaned (owner disbanded, 18mo idle)",
          endpoint_id: "ep_legacy_kyc_aadhaar_verify_v2",
          severity: "critical",
        },
        {
          phase: "classify",
          message: "depth = 2015 — /legacy/imps/p2p-transfer classified orphaned (not in registry)",
          endpoint_id: "ep_legacy_imps_p2p_transfer",
          severity: "critical",
        },
      ],
      statsDelta: { total_discovered: 280, unknown_vs_registry: 33, orphaned: 3, deprecated: 4 },
    },
    {
      progressTo: 70,
      events: [
        {
          phase: "score",
          message: "depth = 2014 — /legacy/upi/collect-v1 scored 92/100 (critical)",
          endpoint_id: "ep_legacy_upi_collect_v1",
          severity: "critical",
        },
        {
          phase: "score",
          message: "depth = 2012 — /legacy/auth/session-token scored 70/100 (high)",
          endpoint_id: "ep_legacy_auth_session_token",
          severity: "critical",
        },
      ],
      statsDelta: { total_discovered: 281, unknown_vs_registry: 34, orphaned: 6, deprecated: 5, critical: 3 },
    },
    {
      progressTo: 86,
      events: [
        {
          phase: "score",
          message: "depth = 2010 — /internal/core/account-balance scored 87/100 (critical)",
          endpoint_id: "ep_internal_core_account_balance",
          severity: "critical",
        },
        {
          phase: "reason",
          message: "generating field notes for top-risk specimens",
          severity: "info",
        },
      ],
      statsDelta: { orphaned: 8, deprecated: 6, critical: 5 },
    },
    {
      progressTo: 100,
      events: [
        {
          phase: "complete",
          message: `scan complete — recovered n = ${FIXTURE_SUMMARY.total_discovered} specimens · ${FIXTURE_SUMMARY.orphaned} zombies`,
          severity: "info",
        },
      ],
      statsDelta: {
        total_discovered: FIXTURE_SUMMARY.total_discovered,
        active: FIXTURE_SUMMARY.active,
        deprecated: FIXTURE_SUMMARY.deprecated,
        orphaned: FIXTURE_SUMMARY.orphaned,
        critical: FIXTURE_SUMMARY.critical,
        unknown_vs_registry: FIXTURE_SUMMARY.orphaned,
      },
    },
  ];

  let stats: ScanStats = { ...baseStats };
  for (const step of plan) {
    if (step.statsDelta) stats = { ...stats, ...step.statsDelta };
    sequence.push({
      type: "scan_progress",
      payload: { scan_id: scanId, progress: step.progressTo, stats: { ...stats } },
    });
    for (const ev of step.events) {
      sequence.push({
        type: "scan_event",
        payload: { ...ev, scan_id: scanId, ts: isoNow() } as ScanEvent,
      });
    }
  }
  sequence.push({
    type: "scan_complete",
    payload: {
      id: scanId,
      status: "complete",
      started_at: isoNow(),
      completed_at: isoNow(),
      progress: 100,
      stats: { ...stats },
    },
  });
  return sequence;
}

// Used by the year-age helper in cards (keeps a stable "current year" reference
// even when the user opens the app at midnight on Jan 1).
export const FIXTURE_CURRENT_YEAR = CURRENT_YEAR;
