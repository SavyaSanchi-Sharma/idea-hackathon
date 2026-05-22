# What the Graph Actually Represents

A live dependency topology of a banking ecosystem — a single picture that fuses **traffic flow**, **ownership**, **deployment surface**, and **security posture** so you can see *where risk lives* and *who has to fix it*.

The Mermaid diagram is syntactically valid and renders cleanly. Below is what each node is, how the edges connect them, and what the picture is trying to tell you.

---

## Node Types (shape encodes role)

| Shape | Type | Purpose |
|---|---|---|
| Parallelogram `[/x/]` | **Consumer** | External clients that originate traffic |
| Stadium `([x])` | **Gateway** | The single ingress point in front of internal APIs |
| Rounded `(x)` | **API Endpoint** | A concrete HTTP route; color encodes lifecycle |
| Rectangle `[x]` | **Service** | Backend microservice that implements one or more endpoints |
| Cylinder `[(x)]` | **Database** | Persistent store; one is flagged as holding PII |
| Subroutine `[[x]]` | **Team** | Human owners of endpoints |
| Hexagon `{{x}}` | **Deployment** | Where the endpoint actually runs (prod vs. legacy) |
| Rhombus `{x}` | **Risk Finding** | A security/compliance issue attached to an endpoint |

### Lifecycle color on endpoints
- **Green (active)** — supported, in the current API contract
- **Amber (deprecated)** — still routed by the gateway, slated for removal
- **Red (zombie)** — *still running and reachable*, but not in the gateway's route table; usually nobody remembers they exist

---

## The Nodes

### Consumers
- `mobile` — Mobile app
- `netbank` — Net banking web client
- `partner` — Partner fintech (B2B)

### Gateway
- `gw` — API Gateway (single chokepoint for managed traffic)

### API Endpoints
**Active**
- `/v2/upi/collect`, `/v2/upi/status` — current UPI surface
- `/v2/customer-lookup` — current customer lookup
- `/v3/neft/initiate` — current NEFT initiation

**Deprecated** (still on gateway, has findings)
- `/v1/customer-lookup` — stale CVE
- `/v1/neft/legacy-initiate` — stale CVE

**Zombie** (not on gateway, still live)
- `/internal/legacy/customer-search` — no auth + PII exposure
- `/v1/partner/customer-info` — no auth

### Services
`upi-service`, `customer-service`, `neft-service`, `partner-service`

### Databases
- `customer-db` — **holds PII**
- `transactions-db`

### Teams
`Payments`, `Customer`, `NEFT`

### Deployments
- `prod-k8s` — modern, managed
- `legacy-vm` — old infra; where the deprecated *and* zombie endpoints live

### Risk Findings
- `rf_auth` — No authentication
- `rf_pii` — PII exposed
- `rf_cve` — Stale CVE-2023-x

---

## The Edges (and what each one means)

| Edge label | Style | Meaning |
|---|---|---|
| `calls` | solid | Consumer → Gateway (request origin) |
| `routes_to` | solid | Gateway → API (managed traffic path) |
| `uses` | solid | API → Service (which microservice implements it) |
| `queries` | solid | Service → Database (data dependency) |
| `owned_by` | dotted | API → Team (accountability metadata) |
| `deployed_on` | dotted | API → Deployment (where it physically runs) |
| `has_findings` | solid | API → Risk (security posture) |

Solid edges = runtime/data flow. Dotted edges = metadata (ownership, location).

---

## What the Graph Is Telling You

1. **The zombies bypass the gateway.** `legacy_search` and `partner_info` have *no* incoming `routes_to` edge — they are reachable on `legacy-vm` but invisible to gateway-level policy, rate limiting, and auth. That is the entire point of calling them zombies.

2. **`legacy-vm` is the blast-radius hotspot.** Every endpoint with a risk finding (`cust_v1`, `neft_legacy`, `legacy_search`, `partner_info`) is `deployed_on` `legacy-vm`. Decommissioning that one host clears every red and amber finding in the graph.

3. **PII leak path is one hop.** `partner_info` (zombie, no auth) → `partner-service` → `customer-db` (PII). An unauthenticated zombie endpoint is one query away from PII. Same shape applies to `legacy_search` → `customer-service` → `customer-db`.

4. **Risk concentrates on deprecated/zombie, never on active.** All five `has_findings` edges land on amber or red nodes. Lifecycle color is a strong predictor of risk — which is the implicit thesis of the visualization.

5. **Ownership is unambiguous.** Every endpoint (including zombies) has an `owned_by` edge, so there is a named team to ping for every finding: NEFT owns the NEFT mess, Customer owns the customer-lookup mess, Payments is clean.

6. **Two services touch the PII store.** `customer-service` and `partner-service` both `queries` `customer-db`. Any future PII access review only needs to audit those two services' upstream endpoints.


