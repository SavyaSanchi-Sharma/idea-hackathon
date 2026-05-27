# Pipe Rust Backend Codebase

This document explains the Rust backend under `pipe/`, how graph data is built,
and why the website was only showing two graph nodes.

## Crates

The backend is split into small Rust crates:

- `pipe/backend`: Axum HTTP server, WebSocket broadcaster, batch processor, SLM
  runtime bridge, predictions, reports, and API routes.
- `pipe/data`: typed event model and queue. The core events are `Registry`,
  `Code`, and `Traffic`.
- `pipe/graph`: in-memory directed graph plus SQLite persistence. It stores
  nodes, edges, endpoint stats, graph queries, and event-to-graph ingestion.
- `pipe/endpoint_store`: SQLite endpoint property table used by endpoint list
  and detail APIs.
- `pipe/model_loader`: Python/sklearn bridge that converts endpoint feature
  rows into classifier and risk predictions.
- `pipe/models`: Python training and inference code for anomaly, classifier,
  and risk regressor models.

## Backend Startup

`pipe/backend/src/main.rs` is the entry point.

Startup flow:

1. Loads `config.toml` through `BackendCfg`.
2. Rehydrates `GraphStore` from `paths.graph_db`.
3. Opens `EndpointStore` from `paths.endpoint_db`.
4. Creates `ModelLoader`, `SlmRuntime`, `PythonPromptmaker`, `Predictions`,
   `Reports`, `WsBroadcaster`, and `ScanRegistry`.
5. Creates an in-process `data` queue.
6. Stores all shared services in `AppState`.
7. Spawns `loop_runner::run`, which drains queue batches into
   `process_batch::run`.
8. Starts the Axum router with permissive CORS.

Important detail: the current `main.rs` hardcodes `config.toml` instead of
reading `ZH_CONFIG`, so the backend must be started from `pipe/backend` unless
paths are changed.

## Event Flow

The data plane is event based:

- `Registry` says an endpoint exists in the official registry, who owns it,
  whether it is deprecated, and what auth/version metadata it has.
- `Code` says an endpoint was found in source code and records repo, commit,
  runtime, runtime version, file path, and author.
- `Traffic` says an endpoint was observed in logs with client, gateway, service,
  status, latency, and auth scheme.

`pipe/backend/src/process_batch.rs` handles a batch:

1. Acquires a write lock on `state.graph`.
2. Applies every event to `graph::ingest::apply`.
3. Mirrors registry and code events into `EndpointStore`.
4. Collects touched endpoint IDs.
5. Reads endpoint rows and graph endpoint stats.
6. Builds model feature rows.
7. Runs classifier and risk models through `ModelLoader`.
8. Runs deterministic rules and OWASP checks.
9. Writes unified predictions to the predictions DB.
10. Broadcasts endpoint updates over WebSocket.

Traffic events currently update the graph and endpoint stats, but they do not
write a row into `EndpointStore` by themselves. A code or registry event is
needed for the endpoint list/detail APIs to have a row.

## Graph Ingestion

Graph ingestion lives in `pipe/graph/src/ingest.rs`.

For each `Traffic` event, it creates or updates:

- endpoint node: `Endpoint`
- gateway node: `Gateway`
- service node: `Service`
- consumer node: `Consumer`
- `Consumer -> Gateway` edge with type `calls`
- `Gateway -> Endpoint` edge with type `routes_to`
- `Endpoint -> Service` edge with type `uses`

For each `Registry` event, it creates or updates:

- endpoint node with registry props
- optional team node
- `Endpoint -> Team` edge with type `owned_by`

For each `Code` event, it creates or updates:

- endpoint node with code props
- deployment node
- `Endpoint -> Deployment` edge with type `deployed_on`

Node IDs are deterministic 16-byte Blake3 hashes in `pipe/graph/src/id.rs`.
For endpoints, the hash input is:

```text
endpoint|{service}|{METHOD}|{path}
```

That means service, method, and path must match across registry, code, traffic,
and endpoint store. If any one differs, the backend creates different endpoint
nodes.

## Graph Store And Persistence

`pipe/graph/src/store.rs` owns:

- `g`: a `petgraph::DiGraph<NodeId, EdgeType>`
- `idx`: `NodeId -> NodeIndex`
- `nodes`: `NodeId -> Node`
- `edges`: `(src, dst, edge_type) -> Edge`
- `stats`: rolling endpoint traffic stats
- `pool`: SQLite connection pool

`GraphStore::rehydrate` opens the SQLite database, loads all persisted nodes
and edges, rebuilds the in-memory petgraph indexes, and skips orphan edges.

The SQLite schema is created in `pipe/graph/src/persist.rs`:

- `graph_nodes(id, node_type, label, props_json, first_seen, last_seen)`
- `graph_edges(source_id, target_id, edge_type, props_json, first_seen,
  last_seen)`

Node and edge upserts write to SQLite first, then update the in-memory graph.

## HTTP Routes

Routes are in `pipe/backend/src/routes.rs`.

Important routes:

- `GET /health`: backend and model health.
- `GET /api/stats/summary`: summary from predictions and endpoint store.
- `GET /api/endpoints`: endpoint list from predictions plus endpoint store.
- `GET /api/endpoints/:id`: endpoint detail, prediction, graph features, and
  reports.
- `GET /api/graph`: graph payload consumed by the Landscape page.
- `GET /api/graph/blast-radius/:id`: downstream blast-radius query.
- `POST /api/_dev/seed`: creates two demo endpoints.
- `POST /api/_dev/seed_many?n=50`: creates many synthetic banking endpoints.

## Frontend Graph Flow

The website calls:

```text
Landscape.tsx -> useGraph() -> getGraph() -> GET /api/graph
```

Frontend adapter:

```text
frontend/src/api/endpoints.ts
```

Graph renderer:

```text
frontend/src/components/graph/StratigraphicGraph.tsx
```

The renderer only positions nodes where `node.type === "endpoint"`. Other node
types such as services, teams, consumers, gateways, and deployments are part of
the API graph payload but are not drawn as endpoint specimens in the current
stratigraphic view.

## Fault: Why Only Two Nodes Loaded

There were two separate causes to understand.

### 1. The persisted demo data has only two endpoints

The current local database has:

```text
graph_nodes:
consumer   2
deployment 2
endpoint   2
gateway    1
service    2
team       1

endpoint_props:
2 rows
```

So if you only ran `POST /api/_dev/seed`, the site has only two endpoint
specimens to draw. To create more endpoint specimens, run:

```bash
curl -X POST 'http://localhost:8000/api/_dev/seed_many?n=50'
```

Then reload the site.

### 2. The `/api/graph` route was incorrectly serializing the graph

The actual code fault was in:

```text
pipe/backend/src/routes.rs
```

Old behavior in `graph_full`:

- It iterated `s.endpoint_store.list_ids()` instead of the graph store.
- It returned only endpoint nodes that also existed in `EndpointStore`.
- It created `edges` but never filled it.
- It dropped graph props, so the frontend could not use service/path/timestamp
  metadata for layout.

That meant the graph database could contain consumers, gateways, services,
teams, deployments, and edges, but `/api/graph` still returned only the two
endpoint rows from `EndpointStore` and zero edges.

The fix is:

- expose public graph iterators in `pipe/graph/src/store.rs`
- make `GET /api/graph` serialize all `GraphStore` nodes and edges
- include node/edge props in the JSON payload
- adapt frontend graph nodes to pass backend `props` into `metadata`

Files changed for this fix:

- `pipe/graph/src/store.rs`
- `pipe/backend/src/routes.rs`
- `frontend/src/api/endpoints.ts`

## Live Probe Bridge

The Boreholes page is served by `ai_engine` on port 8001, while the Landscape
graph reads the Rust `pipe` backend on port 8000. That means live probes used
to classify endpoints inside `ai_engine` only; they did not populate the Rust
graph.

The bridge is:

- `ai_engine/server/ingest/runner.py` mirrors every parsed live log line to
  `ZH_PIPE_BASE_URL/api/live/traffic` (`http://localhost:8000` by default).
- `pipe/backend/src/routes.rs` exposes `POST /api/live/traffic`.
- That route converts one live log line into `Registry`, `Code`, and `Traffic`
  events and passes them through `process_batch::run`.

Result: a looped file replay or Docker borehole now creates endpoint rows,
graph nodes, graph edges, stats, and predictions in the Rust backend.

The bridge is best-effort. If the Rust backend is down, the borehole still runs
inside `ai_engine`; it just will not update the Rust Landscape graph until
`pipe` is reachable again.

## Remaining Design Note

After the route fix, `/api/graph` returns the full graph. The current
`StratigraphicGraph` still visually draws only endpoint nodes. That is a
frontend design choice, not a backend data-loss problem.

If the UI should display services, gateways, teams, consumers, and deployments
as visible graph nodes too, update:

```text
frontend/src/components/graph/StratigraphicGraph.tsx
```

Specifically, remove or replace the filter:

```ts
graph.nodes.filter((n) => n.type === "endpoint")
```

and add layout rules for the non-endpoint node types.
