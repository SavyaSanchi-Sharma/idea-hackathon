# D1 — Problem Statement + Solution Brief

**PS: Zombie & Shadow API Discovery for Public Sector Banks**

| | |
|---|---|
| **Team Name** | ZombieHunter |
| **Problem Statement** | Continuous discovery, classification, and risk triage of zombie and shadow APIs across a PSB's full API estate |
| **Domain** | API Security / ML / Banking Cybersecurity |
| **Team Members** | [Name 1] — AI Engine  \|  [Name 2] — Backend  \|  [Name 3] — Frontend  \|  [Name 4] — Domain Research |

---

## PART A: THE PROBLEM (1 PAGE MAX)

### 1. The Problem in One Sentence

**Core problem:** A mid-size public sector bank runs 5,000–15,000 APIs across mobile banking, internet banking, UPI, NEFT, RTGS, KYC, treasury, lending, and internal team-to-team channels. These APIs were built over fifteen-plus years by engineers who have since left. Some are documented; many are not. Some are deprecated but still answering live traffic; their docs and Wikis are gone; their owners are gone; their authentication standards are frozen at the year they were built — but they still hold full access to production data. These are **zombie APIs**. A parallel population of **shadow APIs** — endpoints actively serving traffic but absent from the bank's official registry — sits alongside them. Both are invisible to the bank's defenders and trivially findable by attackers running automated endpoint scans. They are the single largest unmanaged risk surface in Indian banking.

### 2. Who Is Affected and How Severely?

- **Direct: PSB security and CISO teams** currently rely on manual API audits performed once or twice a year. By the time the auditor finds a zombie, an attacker has had months to find it first.
- **Financial:** A single zombie endpoint with weak auth and full DB access is worse than a hundred external probes — it bypasses every modern control because it predates them. RBI's 2024 cyber-incident notes flag insider- and inventory-driven incidents as a growing share of total banking fraud value.
- **Operational:** When a zombie is finally found, the bank cannot just delete it — somebody, somewhere may still depend on it. The remediation cycle (find owner / find callers / migrate / decommission) takes months per endpoint, and there are hundreds of them.
- **Regulatory:** RBI's Master Directions on IT Governance (2023) and PCI-DSS Section 6 require banks to maintain a current, accurate inventory of their software assets and to demonstrate controls over each. A bank that cannot enumerate its own APIs cannot pass either control.

### 3. Why Current Approaches Fail

- **Active scanning tools (Burp, Postman, OWASP ZAP)** probe IP ranges looking for endpoints that respond. They miss internal-only APIs, can't distinguish a zombie from a legitimate-but-old endpoint, and risk generating production alerts that page the on-call team during the scan itself.
- **Compliance audits** are point-in-time and backward-looking. The auditor lists the zombies they happened to find this quarter; new ones appear between audits.
- **SIEM / SOC tools** monitor for attacks against *known* assets. They are defenders of the inventory, not auditors of the inventory — they will not tell you that an endpoint exists if you have not told them about it.
- **Rule-based detection** ("flag if more than 50 requests per second to an unknown endpoint") is easily bypassed by an attacker who knows the thresholds. Insiders know the thresholds.
- **There is no deployed system at most mid-size PSBs** that combines passive discovery, registry reconciliation, ML-driven classification, and continuous risk scoring into a single continuous loop.

---

## PART B: OUR SOLUTION

### 4. What We Are Building: ZombieHunter

**ZombieHunter** is a continuous-discovery and risk-triage system for bank API estates. It ingests passive telemetry from API gateways, service meshes, and code repositories; cross-references the observed surface against the bank's declared API inventory; classifies every endpoint as `active` / `deprecated` / `orphaned` with `zombie` and `shadow` flags layered on top; scores each endpoint's risk on a 0–100 scale; and surfaces the result in an investigator console designed as a forensic instrument rather than a generic security dashboard. The system runs continuously — not as a scheduled audit — and produces audit-defensible artifacts aligned to RBI's Master Directions on IT Governance and PCI-DSS Section 6.

### 5. Core Features of Our POC

- **Three-source discovery (designed; CSV-replayed in the POC).** Passive traffic observation, registry cross-reference, and static code inspection feed a single normalized event stream. The reconciliation layer marks anything observed-but-not-registered as a `shadow` candidate.
- **Three-model inference pipeline (built).** A Random Forest classifies lifecycle state into `active` / `deprecated` / `orphaned`. A Random Forest regressor produces a 0–100 risk score that decomposes into per-feature contributions for the UI. An Isolation Forest runs over a 14-dimensional sequence feature vector to flag behavior shifts (call-volume spikes, auth-failure surges, latency drift).
- **Deterministic rule classifier alongside the ML pass (built).** Every endpoint also runs through a plain-Python rule classifier with stated predicates. When the ML and the rule disagree, the endpoint flows to a Review Queue — disagreement is surfaced, not hidden.
- **OWASP API Top-10 finding engine (built; 6 of 10 categories).** API1 (BOLA), API2 (Broken Auth), API4 (Resource Consumption), API8 (Misconfig), API9 (Inventory Mgmt), API10 (Unsafe Consumption) are wired with audit-defensible predicates per category.
- **STRATA console (built).** Command Center with live scan feed, Inventory catalog, Endpoint Detail with posture arc and threat narrative, Landscape Graph rendered as a stratigraphic cross-section (Y = age, X = service lane), Blast Radius overlay, Review Queue. Designed end-to-end as a forensic instrument — full design language in `design/identity.md`.
- **Graduated response (designed; recommendation-only in POC).** Risk tier maps to a recommended action: low → monitor, medium → quarantine + tighter rate limit, critical → reversible block at the gateway. The UI surfaces the recommendation; an operator executes it.

### 6. What Is Built vs. What Is Planned

**BUILT (DEMONSTRABLE IN POC)**

- Synthetic data generator producing 1,920 endpoints + 57,600 sequence rows, deterministic on `SEED=42`, with full mathematical formulation in `ai_engine/train/DATA.md`.
- Random Forest classifier (3-class lifecycle) + deterministic rule classifier, joined into a single `needs_review` flag on disagreement.
- Random Forest regressor producing the 0–100 risk score with banding (low / medium / high / critical).
- Isolation Forest anomaly detector over 14 sequence features.
- OWASP rule engine covering 6 of 10 API Top-10 categories.
- FastAPI service exposing `/api/stats/summary`, `/api/endpoints`, `/api/endpoints/{id}`, `/api/scan/start`, plus a WebSocket scan feed.
- React 18 + TypeScript console with the STRATA design system fully implemented across Command Center, Inventory, Endpoint Detail, Landscape Graph, and Review Queue.
- Reproducible end-to-end demo (`pip install -r ai_engine/server/requirements.txt && python -m ai_engine.server.run` + `npm run dev` in `frontend/`).

**PLANNED (NOT YET BUILT)**

- Rust ingestion plane against real API-gateway / service-mesh telemetry (the POC replays from CSV; the JSON contract is identical so the swap is mechanical).
- Locally-hosted SLM for the threat-narrative paragraph (currently template-filled). Hosted LLM APIs are not an option because the input is privileged bank traffic intelligence.
- Auto-wired graduated response against the gateway control plane (currently recommendation-only; needs a reversible-block design with a kill switch before it ships).
- The remaining OWASP API Top-10 categories (API3, API5, API6, API7) — these need response-payload-shape signals the current ingest layer doesn't capture.
- Graph Neural Network over the cross-service call graph for cross-system anomaly correlation.
- Multi-tenant deployment for SaaS rollout across the 12 PSBs and the larger private-bank / NBFC / fintech market.
- Compliance artifact generator that emits formatted reports per RBI Master Directions on IT Governance and PCI-DSS Section 6 (the audit ledger captures the right data; the report templates are next).
