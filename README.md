# ZombieHunter — Continuous Discovery & Risk Triage for Bank API Estates

## Problem Statement

This project addresses **PS: Zombie & Shadow API Discovery for Public Sector Banks**. ZombieHunter continuously inventories a bank's API estate, classifies every endpoint as `active`, `deprecated`, or `orphaned` (with `zombie` and `shadow` flags layered on top), scores its risk on a 0–100 scale, surfaces OWASP API Top-10 findings per endpoint, and pushes the result to an investigator console designed as a forensic instrument rather than a dashboard.

## Live Demo

- 🔗 Live demo: _to be deployed_
- 🎥 Demo video: _to be recorded_

If no live deployment, run locally using the instructions below — the FastAPI service ships with the trained model artifacts and synthetic dataset, so a full end-to-end demo runs offline in under a minute.

## Tech Stack

**AI engine (`ai_engine/`)**
- Python 3.11
- FastAPI + Uvicorn (inference API, WebSocket scan stream)
- scikit-learn — Random Forest classifier (3-class lifecycle), Random Forest regressor (risk 0–100), Isolation Forest (sequence anomaly)
- joblib (model artifacts), Pandas + NumPy (data plane)
- Deterministic rule classifier (`ai_engine/train/models/classifier/rule.py`) cross-checked against the ML pass — disagreements flow to a review queue

**Frontend (`frontend/`)**
- React 18 + TypeScript + Vite
- TailwindCSS with custom design tokens (the "STRATA" system, see `design/`)
- D3 (`d3-zoom`, `d3-selection`) for the stratigraphic landscape graph
- Recharts (sparklines, sequence detail charts), Framer Motion (scan / decay animations)
- TanStack Query (server state), Zustand (UI state), React Router

**Data**
- 1,920 synthetic banking endpoints generated from ~50 OpenAPI specs (45 from APIs.guru + Stripe, Plaid, Adyen Checkout, Adyen Payments, PayPal Orders as banking-shape seeds)
- 30-day per-endpoint telemetry sequences (57,600 rows)
- CVE join table covering 13 (runtime, version) pairs across Spring Boot / Node.js / Python / Go / .NET
- Full generator is deterministic on `SEED=42` — see `ai_engine/train/DATA.md`

## How to Run Locally

```bash
# 1. Clone the repo
git clone https://github.com/SavyaSanchi-Sharma/idea-hackathon
cd idea-hackathon

# 2. Backend — FastAPI + scikit-learn (port 8000)
# from repo root
pip install -r ai_engine/server/requirements.txt
python -m ai_engine.server.run
# inference runs once at startup; first request is served immediately after

# 3. Frontend — Vite dev server (port 5173)
cd frontend
npm install
npm run dev

# 4. Open the console
# http://localhost:5173
```

Backend health check: `http://localhost:8000/health` should return `{"status":"ok","endpoints_loaded":1920}`.

## Deployment

Free-tier path: **frontend on Vercel, backend on Render** (Docker). Both auto-deploy from `main`. The order matters — the frontend URL has to exist before the backend can be told to trust it for CORS.

> **Render free-tier note.** The backend sleeps after 15 minutes of inactivity. The first request after sleep takes ~30 seconds to wake the container; subsequent requests are fast. The frontend's HTTP client retries, so the UI recovers on its own — just be patient on the very first scan.

### 1. Push the repo to GitHub
Already done — `https://github.com/SavyaSanchi-Sharma/idea-hackathon`. Make sure your local `main` is up to date with origin.

### 2. Deploy the frontend to Vercel *first*
We need the Vercel URL before the backend can be configured.

1. On [vercel.com](https://vercel.com), **Add New Project** → import the GitHub repo.
2. Set **Root Directory** to `frontend`.
3. Framework preset auto-detects as **Vite** (confirmed by `frontend/vercel.json`). Leave it.
4. **Do not click Deploy yet.** Open **Environment Variables** and add:
   - `VITE_API_BASE_URL` = `https://zombiehunter-api.onrender.com` *(placeholder — we'll correct this in step 4 once the real Render URL exists)*
   - `VITE_WS_URL` = `wss://zombiehunter-api.onrender.com/ws` *(note `wss://`, not `ws://`)*
5. Click **Deploy**. Copy the resulting URL (e.g. `https://zombiehunter.vercel.app`).

### 3. Deploy the backend to Render
1. On [render.com](https://render.com), **New +** → **Blueprint** → connect the GitHub repo.
2. Render auto-detects `render.yaml` and shows one service: `zombiehunter-api` (Docker, `singapore` region, free plan).
3. **Before applying**, edit the `ZH_ALLOWED_ORIGINS` env var on the service and set it to the Vercel URL from step 2 — e.g. `https://zombiehunter.vercel.app`. Comma-separate if you want to allow multiple origins (preview deploys, custom domain, etc.).
4. Click **Apply**. The first build takes ~5–10 minutes on the free tier (image build + cold pip install).
5. Once `/health` is green, copy the service URL (e.g. `https://zombiehunter-api.onrender.com`).

### 4. Update the frontend with the real backend URL
1. In Vercel → Project → **Settings** → **Environment Variables**, edit:
   - `VITE_API_BASE_URL` → real Render URL (`https://zombiehunter-api.onrender.com`)
   - `VITE_WS_URL` → `wss://zombiehunter-api.onrender.com/ws`
2. Trigger a redeploy: **Deployments** → latest → **... → Redeploy**. (Vite env vars are baked at build time, so an env change alone is not enough — you must redeploy.)

### 5. Verify
```bash
# Backend health (this also wakes the dyno if it slept)
curl https://<your-render-url>/health
# → {"status":"ok","endpoints_loaded":1920}
```
Then open `https://<your-vercel-url>` in an **incognito window** (avoids stale env vars cached on a logged-in tab), click **Run Discovery Scan**, and confirm specimens populate. WebSocket scan stream should tick to 100% in ~8 seconds.

### 6. Wire the live URLs into the README
Update the **Live Demo** section at the top of this file with both URLs and commit.

### Operational notes
- **Auto-deploy** is on for both platforms — every push to `main` triggers a rebuild on Render and Vercel.
- **Rollback.** Render: service → **Deploys** → pick a green commit → **Rollback to this deploy**. Vercel: **Deployments** → previous → **Promote to Production**.
- **CORS errors after deploy** almost always mean `ZH_ALLOWED_ORIGINS` on Render doesn't include the *exact* Vercel origin (scheme + host, no trailing slash). Update the env var in the Render dashboard and the service will restart.
- **Updating the backend env var** through `render.yaml` requires a Blueprint sync. Editing it directly in the Render dashboard is faster for one-offs.

## Project Structure

```
ai_engine/
  server/             FastAPI app — inference cached at startup, served via REST + WS
    main.py             routes: /api/stats/summary, /api/endpoints, /api/endpoints/{id}, /api/scan/start, ws://…
    inference_pipeline.py  loads the three trained models + the rule classifier and joins their outputs per endpoint
    mapping.py          translates raw features+predictions into the rich Endpoint payload the React app consumes
    scan_sim.py         drives the scan-feed animation (replayable event plan)
  train/
    data.ipynb          synthetic-data generator + training notebook (deterministic on SEED=42)
    DATA.md             mathematical formulation of every column in every generated file
    data/               openapi_specs/ (sources) + generated/ (training CSVs)
    models/             trained artifacts — classifier/, regressor/, anomaly/, plus rule.py

frontend/
  src/
    pages/              Command Center, Inventory, Endpoint Detail, Landscape Graph, Review Queue
    components/         specimen card, classification badge, posture arc, factor bar, depth meter, …
    api/                typed HTTP + WS client against the FastAPI server
    store/              Zustand stores for scan state, filters, selection

design/                 The STRATA design system — identity, tokens, components, screen redlines
docs/                   Problem analysis, architecture, decisions
```

## Dataset

All data is 100% synthetic, generated by `ai_engine/train/data.ipynb`. It simulates a mid-size PSB's API estate:

- **1,920 endpoints** drawn from 50 real OpenAPI specs, then overlaid with banking paths from a 45-template lexicon (`/v{1,2,3}/accounts/{accountId}/balance`, `/upi/collect`, `/v2/loans/applications/{id}/disburse`, etc.) and 10 services (`core-banking`, `payments`, `cards`, `loans`, `kyc`, `wealth`, `forex`, `notifications`, `audit`, `aa-bridge`).
- Each endpoint is sampled into one of 5 scenarios with weights `(active 0.50, deprecated 0.15, orphaned_quiet 0.10, zombie 0.15, shadow 0.10)`. The scenario drives the feature distribution — registry presence, owner presence, last-seen days, call volume, auth failure rate, p95 latency, last deploy days.
- **30-day sequences** per endpoint (57,600 rows) with realistic per-scenario trajectories (`deprecated` linearly decays from baseline → 20%, `zombie` runs flat-high, `shadow` is spiky, `orphaned_quiet` is near-zero). 10% of endpoints receive an injected behavior shift (3× spike or 10× drop) to train the anomaly detector.
- **CVE overlay** — every runtime+version joins to a curated CVE row, so each endpoint carries a `max_cvss` ∈ [0, 10] used by the risk model and the OWASP rule engine.

No real bank data was used. All endpoint IDs, account numbers, and customer references in fixture content are fabricated.

## Model Performance (on Synthetic Test Set)

| Model | Task | Notes |
|---|---|---|
| Classifier (Random Forest) | 3-class lifecycle (`active` / `deprecated` / `orphaned`) | High separability by design — `in_registry`, `owner_present`, `last_deploy_days`, `call_count_7d` each linearly separate at least one class pair (see `DATA.md` §5.5). |
| Regressor (Random Forest) | Risk score 0–100 | `risk_score` is a deterministic function of the same features the regressor sees plus `N(0, 5)` noise (see `DATA.md` §4.7) — the model fits the pipeline tightly. **This proves the inference path works end-to-end, not generalization to real-world risk.** |
| Anomaly detector (Isolation Forest) | Behavior-shift detection on 14 sequence features | Trained on 30-day trajectories; ~10% of endpoints have injected shifts. Surfaced as a binary flag plus a score; recall is tunable via the contamination parameter. |
| Rule classifier | Deterministic ground-truth pass | Run alongside the ML classifier; disagreements set `needs_review=1` and flow to the review queue surfaced in the UI. |
| OWASP rule engine | API Top-10 findings (API1, API2, API4, API8, API9, API10) | Pure rules, audit-defensible. Each category has a stated predicate (`DATA.md` §4.8). |

Real numerics will be regenerated against a held-out split — they belong in the model artifacts, not the README — but the pipeline is reproducible byte-for-byte from `SEED=42`.

## Known Limitations

- **Synthetic-only.** Trained against generated data designed to be honest about its own structure (the dataset README documents label leakage and CVE coverage explicitly). Real PSB telemetry would require re-feature-engineering and re-training; the model interfaces are stable but the artifacts are not portable.
- **Batch ingestion in the POC.** The discovery layer is mocked from CSV at startup. The production architecture (see `docs/ARCHITECTURE.md`) places a Rust ingest plane between API-gateway/service-mesh telemetry and the inference cache; that plane is not yet built.
- **No live SLM in this build.** The threat-narrative paragraph for each flagged endpoint is currently template-filled from the structured signals. Phase 2 swaps in a locally-hosted small language model (so a bank's traffic patterns never leave the perimeter); the I/O contract is already JSON-in / JSON-out, so the swap is mechanical.
- **OWASP coverage is 6 of 10 categories.** API1, API2, API4, API8, API9, API10 are wired; API3 (Broken Object Property Level Authorization), API5 (BFLA), API6 (Unrestricted Access to Sensitive Business Flows), API7 (SSRF) need response-payload signals we don't simulate.
- **No write-path automation.** The "graduated response" tier (quarantine / rate-limit / block) is designed but unimplemented — the UI surfaces the recommendation, but a human operator executes it.
- **Auth-scheme distribution carries from source specs.** Real banking APIs would have a much tighter auth distribution; the current spread is a structural noise property of the 50 source specs, not a literal bank auth survey.

## Team

- **[Name 1]** — AI engine (data generation, training notebook, inference pipeline, OWASP rule engine)
- **[Name 2]** — Backend (FastAPI service, scan simulator, WebSocket stream, mapping layer)
- **[Name 3]** — Frontend (STRATA design system, Command Center, Endpoint Detail, Landscape Graph)
- **[Name 4]** — Domain research, PS analysis, compliance mapping, documentation

## Contact

- **Team Name:** _to fill_
- **Institute:** _to fill_
- **Email:** _to fill_
- **Repo:** https://github.com/SavyaSanchi-Sharma/idea-hackathon

iDEA 2.0 Phase 2 Submission
