# Pipeline Architecture — Frontend ↔ Backend Integration

This document traces a request end-to-end through ZombieHunter: where the data comes from, how the FastAPI server materialises it once at boot, what the REST and WebSocket surfaces look like, and how the React app consumes them.

For the higher-level "what the system does" picture, see [`ARCHITECTURE.md`](./ARCHITECTURE.md). For the math of the synthetic dataset, see [`../ai_engine/train/DATA.md`](../ai_engine/train/DATA.md).

---

## 1. Data provenance

```
APIs.guru index (~45 specs) ─┐
                             ├──► data/openapi_specs/*.{json,yaml}   (52 files, committed)
fintech specs (stripe,       │
plaid, adyen×2, paypal) ─────┘
                             │
                             ▼   [data.ipynb extracts structural noise]
                  data/generated/openapi_inventory.csv               (1920 rows)
                             │
                             ▼   [banking overlay via MD5 hash]
                  data/generated/banking_inventory.csv               (1920 rows)
                             │
                             ▼   [scenario sampling + risk formula]
   ┌─────────────────────────┼──────────────────────────────┐
   ▼                         ▼                              ▼
lifecycle_training.csv   lifecycle_sequences.csv      lifecycle_findings.csv
(1920 rows, 23 cols)     (57600 rows = 1920 × 30 d)   (1920 rows, OWASP labels)
```

- **Real source specs** — 52 OpenAPI/Swagger files in `ai_engine/train/data/openapi_specs/`. ~45 from APIs.guru (random sample of providers — Azure, AWS, Google, eBay, NYTimes, PayPal, Stripe, Vercel, GOI APISetu, …) and 5 hand-picked fintech specs (`stripe.json`, `plaid.yaml`, `adyen_checkout.json`, `adyen_payments.json`, `paypal_orders.json`).
- **Banking overlay** — each spec operation gets a banking-style path (UPI/IMPS/NEFT/RTGS/KYC/accounts/cards/loans/…) chosen deterministically by MD5-hashing `(source_file, endpoint, method)`. Structural attrs (auth, method, schema_count, deprecated) are preserved.
- **Scenario assignment** — each endpoint is sampled into `{active 0.50, deprecated 0.15, orphaned_quiet 0.10, zombie 0.15, shadow 0.10}`. Each scenario has documented feature distributions (DATA.md §4.3) that produce the telemetry columns the server later reads.
- **Determinism** — `SEED=42` makes the generator reproducible byte-for-byte. The notebook is `ai_engine/train/data.ipynb`.
- **No runtime ingest** — nothing fetches the source specs or external feeds while the server is running. The CSVs are the only data input.

---

## 2. Backend boot — heavy work happens once

`ai_engine/server/main.py:52` (`lifespan`) runs at FastAPI startup and never again.

```
FastAPI lifespan ──► run_inference()                                 ai_engine/server/inference_pipeline.py:104
                       │
                       ├─ pd.read_csv(lifecycle_training.csv)        1920 rows × 23 cols
                       ├─ pd.read_csv(lifecycle_sequences.csv)       57 600 rows × 11 cols
                       │
                       ├─ joblib.load(classifier/{preprocessor,model}.joblib)
                       │     ml_state, ml_confidence
                       ├─ classify_batch(features)                   models/classifier/rule.py
                       │     rule_state, rule_is_zombie, rule_is_shadow, rule_reason
                       │     needs_review = (rule_state ≠ ml_state)
                       ├─ joblib.load(regressor/{preprocessor,model}.joblib)
                       │     risk_score 0–100, risk_band ∈ {low,medium,high,critical}
                       ├─ joblib.load(anomaly/{scaler,model}.joblib)
                       │     14-dim sequence features → anomaly_flag, anomaly_score
                       └─ owasp_findings() per row                   inference_pipeline.py:48
                             API1/API2/API4/API8/API9/API10
                       │
                       ▼
                  InferenceResult { features, predictions, sparklines, trend_pct, sequences }
                       │
                       ▼
                  to_endpoint_list(...)                              ai_engine/server/mapping.py
                       │   adds display-only fields: specimen_id,
                       │   service_lane, blast_radius_nodes,
                       │   data_classes, threat_narrative, …
                       ▼
                  state.endpoints           (list[dict], 1920 rows)
                  state.endpoints_by_id     (dict for O(1) lookup)
                  state.summary             (counts: registry_baseline, total_discovered, active,
                                             deprecated, orphaned, critical, last_scan_at)
                  state.event_plan          (scripted scan events, built once)
                  state.scans               (per-scan progress and event timelines)
```

All later requests just read from `state`. **No model runs on the request path.**

---

## 3. REST surface

Defined in `ai_engine/server/main.py`.

| Method | Route | Data source | Notes |
|---|---|---|---|
| GET | `/health` | counts in `state` | liveness probe |
| GET | `/api/stats/summary` | `state.summary` | summary tiles on Command Center |
| GET | `/api/endpoints` | `state.endpoints` | filtered by `_matches`, sorted by `_sorted`, paginated |
| GET | `/api/endpoints/{id}` | `state.endpoints_by_id` | full Endpoint payload |
| GET | `/api/endpoints/{id}/sequence` | `state.inference.sequences` | 30-day per-day telemetry for the detail chart |
| GET | `/api/review-queue` | rows where `needs_review` | rule vs ML disagreements |
| GET | `/api/models/metrics` | reads `metrics.json` from each model artifact dir | classifier / regressor / anomaly metrics |
| POST | `/api/endpoints/{id}/action` | mutates `recommended_action` in memory | demo-only; not persisted |
| GET | `/api/graph` | `_build_graph(state.endpoints)` | nodes: endpoint+service; edges: `owned_by`, `depends_on` |
| GET | `/api/graph/blast-radius/{id}` | radius around one endpoint + same-lane neighbours | overlays on Landscape |
| GET | `/api/registry` | `[e for e in state.endpoints if e['in_registry']]` | registry baseline |
| POST | `/api/scan/start` | mints a `ScanState`, copies `state.event_plan`, stamps timestamps | returns `scan_id` |
| GET | `/api/scan/{id}` | wall-clock-derived progress over an 8 s window | progress + stats |
| GET | `/api/scan/{id}/events` | events from `ScanState.events` whose `ts` has elapsed | revealed in order |

CORS is gated by the `ZH_ALLOWED_ORIGINS` env var (default `http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173`) — `main.py:72`.

---

## 4. WebSocket surface

Single endpoint at `/ws` (`main.py:416`).

```
client                                                          server
  │                                                                │
  │── connect /ws ───────────────────────────────────────────────► │  ws.accept()
  │                                                                │
  │── { type: "subscribe_scan", scan_id: "..." } ────────────────► │  mint ScanState if new
  │                                                                │
  │ ◄── { type: "scan_progress", payload: { scan_id, progress, stats } }
  │ ◄── { type: "scan_event",    payload: ScanEvent }
  │                                                                │  loop every 0.32s
  │ ◄── { type: "scan_progress", ... }                             │  over event_plan
  │ ◄── { type: "scan_event",    ... }                             │
  │                                ⋯                               │
  │ ◄── { type: "scan_complete",  payload: ScanJob }               │  on last event
```

Same data as the REST `/api/scan/*` endpoints — just pushed instead of polled. The frontend currently uses the REST polling path; the WebSocket exists for the live-stream path.

---

## 5. Frontend client layer

Files under `frontend/src/api/`.

```
VITE_API_BASE_URL (env, default http://localhost:8000)
        │
        ▼
client.ts          apiRequest<T>(path, opts)
        │           - buildUrl(path, query)
        │           - JSON in/out
        │           - throws ApiError on non-2xx
        │
        ▼
endpoints.ts       one typed wrapper per route
        │           getSummary, getEndpoints, getEndpoint,
        │           getEndpointSequence, getReviewQueue,
        │           getModelMetrics, getGraph, getBlastRadius,
        │           getRegistry, startScan, getScan, getScanEvents,
        │           postEndpointAction
        │
        ▼
hooks/use*.ts      React-Query hooks (cached fetches)
                   useSummary, useEndpoints, useEndpointDetail,
                   useGraph, useScan, useWebSocket


VITE_WS_URL (env, default ws://localhost:8000/ws)
        │
        ▼
websocket.ts       getWsClient() singleton
                   - typed WsMessage union
                   - auto-reconnect (800 ms → 8 s backoff)
                   - pendingSends queue while closed
```

---

## 6. End-to-end — "user clicks Run Scan"

```
Command Center (UI)                Frontend hooks/state                Backend
─────────────────                  ─────────────────────                ─────────
   │
   │ click "Run Scan"
   ├─────────────► useScan.runScan()
   │                    │
   │                    │  startScan()
   │                    ├──────────────────────────► POST /api/scan/start
   │                    │                                  │
   │                    │                                  ▼  mint ScanState,
   │                    │                                     stamp event_plan
   │                    │ ◄───────────────────────── { scan_id }
   │                    │
   │                    │  liveStore.startScan(scan_id)
   │                    │  setInterval(280 ms) ► pumpScan()
   │                    │           │
   │                    │           │  GET /api/scan/{id}
   │                    │           ├──────────────► progress, stats
   │                    │           │  GET /api/scan/{id}/events
   │                    │           ├──────────────► new ScanEvent[]
   │                    │           │
   │                    │           │  liveStore.setProgress(...)
   │                    │           │  liveStore.appendEvent(...) for each
   │  ◄─────────── re-render via Zustand subscription
   │                    │           │
   │                    │           │  (repeat until status === "complete")
   │                    │           │
   │                    │           │  on complete:
   │                    │           │    liveStore.completeScan()
   │                    │           │    queryClient.invalidateQueries([
   │                    │           │      "summary","endpoints","graph","review-queue"
   │                    │           │    ])
   │  ◄─────────── Inventory / Landscape / Review Queue refetch
```

Key invariant: only one poller may run at a time. `activePoller` is module-scoped in `frontend/src/hooks/useScan.ts`, so starting a second scan kills the previous loop — prevents stale events bleeding between runs.

---

## 7. Layered view

```
┌──────────────────────────────────────────────────────────────────┐
│  React 18 + Vite                                                 │
│  Pages: CommandCenter · Inventory · Landscape · ReviewQueue ·    │
│         Reports                                                  │
│  State: Zustand (liveStore, uiStore) + React Query cache         │
│  API:   api/client.ts · api/endpoints.ts · api/websocket.ts      │
└──────────────────────────────────────────────────────────────────┘
                │  HTTPS / WSS
                ▼
┌──────────────────────────────────────────────────────────────────┐
│  FastAPI + Uvicorn                                               │
│  REST:      /health · /api/stats/summary · /api/endpoints/* ·    │
│             /api/review-queue · /api/models/metrics ·            │
│             /api/graph · /api/graph/blast-radius · /api/registry │
│             /api/scan/* (start, poll, events)                    │
│  WebSocket: /ws (subscribe_scan → scan_progress / scan_event /   │
│             scan_complete)                                       │
│  CORS:      ZH_ALLOWED_ORIGINS env, defaults to localhost dev    │
└──────────────────────────────────────────────────────────────────┘
                │  in-process reads
                ▼
┌──────────────────────────────────────────────────────────────────┐
│  In-memory state (built once at lifespan startup)                │
│    state.endpoints, state.endpoints_by_id, state.summary,        │
│    state.event_plan, state.scans, state.inference.sequences      │
└──────────────────────────────────────────────────────────────────┘
                ▲
                │  loaded once
                │
┌──────────────────────────────────────────────────────────────────┐
│  Inference (ai_engine/server/inference_pipeline.py)              │
│    Classifier (RF) · Rule classifier · Regressor (RF) ·          │
│    Anomaly (IsolationForest) · OWASP rule engine                 │
│  Artifacts: ai_engine/train/models/{classifier,regressor,         │
│             anomaly}/artifacts/*.joblib                          │
└──────────────────────────────────────────────────────────────────┘
                ▲
                │  pd.read_csv at boot
                │
┌──────────────────────────────────────────────────────────────────┐
│  Synthetic dataset (ai_engine/train/data/generated/)             │
│    lifecycle_training.csv     · 1 920 rows · classifier+regressor│
│    lifecycle_sequences.csv    · 57 600 rows · anomaly + detail   │
│    lifecycle_findings.csv     · 1 920 rows · OWASP labels        │
│    banking_inventory.csv      · 1 920 rows · path overlay        │
│    cve_table.csv              · 13 rows    · runtime → CVE       │
│  Generator: ai_engine/train/data.ipynb (SEED=42, deterministic)  │
│  Seeds:    52 real OpenAPI specs in data/openapi_specs/          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Key invariants

- **No request-path ML.** Inference runs once at FastAPI startup; everything the frontend touches is a view over the cached `InferenceResult`.
- **No live data ingest.** The system reads two CSVs at boot. Swapping in real traffic means producing a CSV with the same schema as `lifecycle_training.csv` (23 cols) and a 30-row-per-endpoint sequence file matching `lifecycle_sequences.csv`.
- **Scan is presentational.** `POST /api/scan/start` does not re-discover anything. It plays back a pre-built `event_plan` derived from data the server already has, on an 8 s wall-clock timeline.
- **Rule + ML run side-by-side.** Disagreement between the deterministic rule classifier and the ML classifier sets `needs_review = 1` and surfaces the row in the Review Queue — disagreement is the discovery signal, not noise.
- **Deterministic by seed.** Regenerating with `SEED=42` reproduces every byte. Different seeds shift counts but preserve the documented distributions and sanity guarantees.
