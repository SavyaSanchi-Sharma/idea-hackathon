# D3 — Technical Architecture Document

**PS: Zombie & Shadow API Discovery for Public Sector Banks**  |  **Team: ZombieHunter**

---

## 1. System Overview — What the System Does

ZombieHunter is a continuous-discovery and risk-triage system for bank API estates. It ingests API telemetry from passive sources (gateway logs, service-mesh traces, registry snapshots, repo scans), reconciles the observed surface against the bank's declared inventory, classifies each endpoint as `active` / `deprecated` / `orphaned` with `zombie` and `shadow` flags layered on top, scores its risk on a 0–100 scale, and surfaces the result in an investigator console designed as a forensic instrument. The system runs continuously — not as a scheduled audit — and produces audit-defensible artifacts aligned to RBI's IT Governance Master Directions and PCI-DSS Section 6.

## 2. High-Level Architecture Diagram

The system has **5 layers**. Data flows top-to-bottom: Ingestion → Reconciliation → Inference → Console → Compliance.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — DISCOVERY / INGESTION  (planned: Rust;  POC: CSV replay)     │
├─────────────────────────────────────────────────────────────────────────┤
│  Passive traffic     │  Registry sources    │  Static code              │
│  • API gateway logs  │  • OpenAPI specs     │  • Repo scan (AST)        │
│  • Service mesh      │  • CMDB entries      │  • K8s ingress rules      │
│  • LB / reverse-proxy│  • Postman / Insomnia│  • Deployed-but-unused    │
│                      │    libraries          │    route detection       │
│                                                                          │
│  Normalized event:  { endpoint, method, source, observed_at, signals }  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │  JSON
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — RECONCILIATION + FEATURE ASSEMBLY  (Python / Pandas)         │
├─────────────────────────────────────────────────────────────────────────┤
│  Cross-reference observed-vs-registered:                                │
│    in_registry = 1  →  active / deprecated / orphaned                   │
│    in_registry = 0  →  shadow (undocumented, actively used)              │
│  Build the per-endpoint feature vector:                                  │
│    schema_count, last_seen_days, call_count_7d, auth_fail_rate_7d,     │
│    p95_latency_ms, last_deploy_days, max_cvss, auth_scheme, runtime,    │
│    owner_present, version_path, deprecated_flag                          │
│  Build the 30-day sequence per endpoint:                                 │
│    call_count[t], auth_fail_rate[t], p95_latency_ms[t]                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — INFERENCE  (scikit-learn, joblib-loaded)                     │
├─────────────────────────────────────────────────────────────────────────┤
│  Model 1: Lifecycle classifier (Random Forest)                          │
│    out: { active | deprecated | orphaned }, confidence ∈ [0,1]          │
│                                                                          │
│  Rule classifier (deterministic, audit ground-truth)                    │
│    out: { rule_state, rule_is_zombie, rule_is_shadow, rule_reason }    │
│    disagreement with Model 1 → needs_review = 1                         │
│                                                                          │
│  Model 2: Risk regressor (Random Forest, 0–100)                         │
│    band: low (<40) | medium (40-74) | high (75-89) | critical (≥90)    │
│                                                                          │
│  Model 3: Anomaly detector (Isolation Forest on 14 sequence features)   │
│    out: { anomaly_flag, anomaly_score } — behavior-shift detection      │
│                                                                          │
│  OWASP rule engine (deterministic)                                      │
│    out: { findings: [API1, API2, API4, API8, API9, API10], count }     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │  enriched Endpoint payload (JSON)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 4 — CONSOLE  (React 18 + Vite, "STRATA" design system)            │
├─────────────────────────────────────────────────────────────────────────┤
│  • Command Center — summary tiles + live scan feed (WebSocket replay)   │
│  • Inventory — specimen catalog with class/risk/source/anomaly filters  │
│  • Endpoint Detail — posture arc, five-factor breakdown, threat        │
│    narrative, OWASP findings, 30-day sequence chart                     │
│  • Landscape Graph — stratigraphic cross-section (D3, custom layout)   │
│    Y-axis = age (recent → ancient), X-axis = service lane               │
│  • Blast Radius — fault-line propagation overlay on the landscape       │
│  • Review Queue — disagreements between ML and rule classifier          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │  recommended actions
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 5 — RESPONSE + COMPLIANCE                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Graduated response (designed; not yet wired to a control plane):       │
│    • low      → monitor + tighter logging                                │
│    • medium   → quarantine + lowered rate limit                          │
│    • critical → block at the gateway (reversible; human gate)           │
│                                                                          │
│  Audit artifacts:                                                        │
│    • Per-finding ledger with model output, rule output, signals,        │
│      operator decision, timestamps                                       │
│    • Report templates aligned to RBI Master Directions on IT            │
│      Governance + PCI-DSS Section 6                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Tech Stack Summary

| LAYER | TECHNOLOGY | WHY THIS CHOICE |
|---|---|---|
| Ingestion (planned) | Rust + tokio | Bank gateway throughput is millions of calls/min — pure-Python ingestion won't survive the smell test. Rust gives zero-copy parsing, predictable tail latency, and a small static binary that's deployable on-prem next to the gateway. |
| Ingestion (POC) | CSV replay from `ai_engine/train/data/generated/*` | Lets the demo run fully offline. Same JSON contract the Rust plane will produce. |
| Reconciliation + feature assembly | Python 3.11 + Pandas 2 | Trivial join + groupby logic; matches the data scientists' tooling; easy to swap to PyArrow when the volume justifies it. |
| Lifecycle classifier | scikit-learn Random Forest | Interpretable feature importances (defensible to auditors); fast inference on tabular features; works without GPU. |
| Risk regressor | scikit-learn Random Forest | Same justification as classifier. Continuous output decomposes into per-feature contributions for the "why this score" UI. |
| Anomaly detector | scikit-learn Isolation Forest | Unsupervised over the 14-dim sequence feature vector; handles the "no labels for novel attacks" case; tunable contamination ratio. |
| Rule classifier + OWASP engine | Plain Python | Deterministic, audit-defensible, easy to point at a specific predicate when a regulator asks "why did you flag this." |
| Inference cache | In-process at FastAPI startup | The dataset is 1,920 endpoints — fits in RAM trivially. Production swap: Redis with a daily-rebuild cron. |
| API service | FastAPI + Uvicorn | Async by default for the WebSocket scan feed; automatic OpenAPI spec generation; matches the team's Python stack. |
| Frontend | React 18 + TypeScript + Vite | Vite for dev-server latency; TS for the rich Endpoint payload shape; React because the team can ship it. |
| Visualization | D3 (zoom/selection) + Recharts | D3 for the custom stratigraphic graph (no off-the-shelf component matches the layout); Recharts for stock sparklines and sequence charts. |
| Threat narrative (Phase 2) | Locally-hosted SLM | Bank traffic patterns must not leave the perimeter — rules out hosted Gemini/Claude. Targeting a 1–3B parameter model that fits on a single GPU or CPU-only with quantization. |

## 4. Key Technical Decisions & Justification

### Why a Rust ingest plane and not pure Python?

A mid-size PSB processes 5–15 million API calls per minute across its estate. The ingest plane must accept that throughput, normalize it, and emit feature vectors without backpressuring the gateway it taps. We considered three options:

1. **Pure Python (FastAPI + asyncio)** — fastest to write, fails the smell test on throughput and tail latency.
2. **Go** — credible, but the team has more Rust experience and the zero-copy parsing story for protobuf/JSON is stronger.
3. **Rust + tokio (chosen)** — predictable tail latency, small static binary that ships into a bank's on-prem environment without dependency hell, and the type system catches the kind of subtle data-shape bugs that would otherwise corrupt the training set.

The Python plane stays — it's where the ML lives. Rust handles ingestion; Python handles inference. They talk over JSON (file-based for the POC, message bus in production). This split is the same shape `docs/whatIamThinking.md` argued for from day one.

### Why scikit-learn Random Forest and not a neural model?

Three reasons.

1. **Interpretability**. When a bank's CISO asks why endpoint `/v2/loans/applications/{id}/disburse` was flagged critical, the answer must decompose into the contributing features — `in_registry=0`, `auth_scheme=none`, `max_cvss=8.2`, `is_zombie=1` — not into a hidden activation. Random Forest gives feature importance natively.
2. **Compute envelope**. The system runs continuously and must be business-viable. A 50 MB joblib artifact serving 1,920 endpoints in <100 ms on a single CPU core is the right operating point. A transformer would be wasteful here — the input is 12 tabular features, not a token stream.
3. **Honest about leakage**. The synthetic `risk_score` is a deterministic function of the features the regressor sees (see `DATA.md` §4.7). A linear regression would already fit it; a Random Forest gives us non-linearity without overpromising on generalization.

Phase 2 will add a Graph Neural Network over the cross-service call graph for cross-system correlation (anomalies in one service that propagate through another), but that's a separate model — not a replacement for the per-endpoint triage.

### Why a deterministic rule classifier alongside the ML one?

Banks don't accept "the model said so" as an audit response. The rule classifier (`ai_engine/train/models/classifier/rule.py`) implements the lifecycle definition as plain predicates over the feature vector — `orphaned ∧ owner_present=0 ∧ call_count_7d ≥ 3000 → zombie`, `in_registry=0 → shadow`, etc. Every classification carries a `rule_reason` string. When the ML classifier and the rule classifier agree, confidence is high and the endpoint flows straight to triage. When they disagree, `needs_review=1` and the endpoint goes to the Review Queue — surfacing the disagreement is more valuable than picking a winner silently.

### Why a forensic-dig-site visual language and not a SaaS dashboard?

This is a category-defining product, not a feature in an existing category. The "stratigraphic cross-section" (Y-axis = age, X-axis = service lane) makes the core insight — that zombies are buried in the deeper, older layers of the estate — a *visual property* of the screen, not a number in a table. The full design language is documented in `design/identity.md`; the short version is: it is an instrument, not a dashboard; age is a visible structural property; every screen confesses its method.

### Why synthetic data?

PSBs cannot share real API telemetry with student teams under RBI data-handling rules. We generated 1,920 synthetic endpoints and 57,600 sequence rows using statistical properties observed in published research — banking endpoint conventions from real OpenAPI specs (Stripe, Plaid, Adyen, PayPal, plus ~45 from APIs.guru), per-scenario feature distributions calibrated against the structural separability we need, and a CVE join from public NVD-style entries. The full mathematical formulation is in `ai_engine/train/DATA.md`. Generation is deterministic on `SEED=42` and reproducible byte-for-byte.

### Why a locally-hosted SLM (Phase 2) and not hosted LLM APIs?

A bank's API surface includes endpoint names, schemas, error patterns, and traffic shapes that constitute privileged operational intelligence. Sending that to a hosted LLM is, in effect, exfiltrating it. The threat-narrative generator therefore has to run inside the bank's perimeter, on hardware the bank already owns. That rules out the major hosted APIs and points at a 1–3B parameter SLM with quantization. The current build template-fills the narrative from the structured signals; the I/O contract is already JSON-in / JSON-out so the SLM swap is mechanical.

## 5. Known Limitations

- **Layer 1 ingestion is a CSV replay in the POC.** The Rust plane is designed but not yet built. Switching it on changes the data source, not the rest of the pipeline — that boundary is the explicit point of the JSON-in / JSON-out contract.
- **No real bank traffic.** All telemetry is synthetic. Production deployment would require re-feature-engineering against the actual gateway's log format and re-training the classifier against labels gathered from the bank's own incident history.
- **OWASP coverage is 6 of 10 categories.** API1, API2, API4, API8, API9, API10 are wired; API3, API5, API6, API7 need response-payload-shape signals that the current ingestion layer doesn't capture.
- **Graduated response is recommendation-only.** The UI surfaces the right action per risk tier; an operator executes it manually. Auto-wiring to the gateway control plane is a Phase 2 deliverable and needs a kill-switch design before it ships.
- **Compliance artifacts are templates, not legally compliant filings.** The audit ledger captures everything an RBI inspection would ask for, but the report templates are positioned as inspection evidence — not as RBI/PCI submissions.
- **No multi-tenant isolation in the POC.** A real SaaS deployment across PSBs needs per-bank data and model isolation; the inference cache is currently single-tenant.
