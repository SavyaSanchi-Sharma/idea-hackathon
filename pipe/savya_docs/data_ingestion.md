# `pipe/data` — Data Ingestion Module

A Rust library crate that runs six independent async producers feeding one shared bounded queue. Three synthetic producers replay local files; three real producers consume from external systems. Downstream code sees identical event shapes from both paths.

This document is a navigation map of the implementation — what lives in which file, the shape of every event, the lifecycle contract, and how to wire the pieces together.

---

## At a glance

```
producers ──► EventQueue (bounded mpsc) ──► downstream (out of scope)

Path A — synthetic                Path B — real
  syn_traf  (TrafficEvent)          real_traf  (TrafficEvent)
  syn_reg   (RegistryEvent)         real_reg   (RegistryEvent)
  syn_code  (CodeEvent)             real_code  (CodeEvent)
```

Every producer implements the `Prod` trait (`start`, `stop`, `health`), runs in its own `tokio::spawn` task, and pushes `Tagged { event_source, event }` into the shared queue.

The producer selection mechanism (which path to run, or both) is **not** in this module — each producer is constructed independently and started independently.

---

## Module layout

All source lives under `pipe/data/src/`. Flat layout, no subdirectories.

| File | Role |
|---|---|
| `lib.rs` | Module declarations + convenience re-exports (`Tagged`, `Event`, `Prod`, `Tx`, `Rx`, `make`). |
| `events.rs` | Event types: `Src`, `Traffic`, `Registry`, `Code`, `Event`, `Tagged`. |
| `queue.rs` | `Tx`/`Rx` aliases over `tokio::sync::mpsc`. `make(cap)` builds a bounded channel. `push` (try) / `push_blocking` (await) helpers update metrics atomically. |
| `cfg.rs` | Per-producer config structs (`SynTrafCfg`, `SynRegCfg`, `SynCodeCfg`, `RealTrafCfg`, `RealRegCfg`, `RealCodeCfg`) and `RegMode { Poll, Webhook }`. |
| `metrics.rs` | Atomic counters `M { emitted, dropped, errors, last_ts }` + serializable `Snap` snapshot. |
| `log.rs` | JSON-line logger with three call sites: `evt(kind, who)`, `err(who, msg)`, `hb(who, &snap)`. |
| `prod.rs` | `Prod` trait: `async fn start(&self)`, `async fn stop(&self)`, `fn health(&self) -> Snap`. |
| `syn_traf.rs` | **A1** — JSONL traffic replay with rate cap + `time_compression_factor` + loop-at-EOF + `set_rate()` runtime control. Malformed lines are skipped, the `errors` counter is incremented, and a JSON `error` log line is emitted via `log::err()` — the stream keeps running. |
| `syn_reg.rs` | **A2** — Registry baseline + 30s diff polling on stable key `(endpoint_path \| method \| service)`. Also exports `Entry`, `key`, `to_ev`, `diff_emit` — reused by `real_reg`. |
| `syn_code.rs` | **A3** — Walks a repo dir, reads `_meta.json` per relative path, regex-parses route declarations for python/nodejs/java/golang/dotnet. Exports `parse_routes` — reused by `real_code`. `rescan()` for manual re-trigger. |
| `real_traf.rs` | **B1** — TCP line consumer with exponential reconnect backoff. JSON body either deserializes as canonical `Traffic` or is translated from Kong access-log shape via `kong()`. |
| `real_reg.rs` | **B2** — Either `RegMode::Poll` (HTTP GET via `reqwest`, then diff) or `RegMode::Webhook` (axum POST on configurable path, accepts a list of pre-shaped change events, returns 202). |
| `real_code.rs` | **B3** — axum POST webhook with HMAC-SHA256 signature verification (`x-hub-signature-256`). On valid push, spawns a background task that fetches each changed file's raw content via the Git provider's REST API and pipes it through `parse_routes`. Returns 202 immediately so the 10 s webhook timeout is respected. |

---

## Event contract (the only thing downstream sees)

Defined in `events.rs`. All events are wrapped in `Tagged`:

```rust
pub struct Tagged {
    pub event_source: Src,   // syn_traffic | syn_registry | syn_code | real_traffic | real_registry | real_code
    pub event: Event,        // tagged enum on "kind"
}
```

`Event` is internally tagged on `kind`:

```rust
pub enum Event {
    Traffic(Traffic),    // kind = "traffic"
    Registry(Registry),  // kind = "registry"
    Code(Code),          // kind = "code"
}
```

### `Traffic` — one per observed API call
`timestamp, request_id (Uuid), method, path, status_code, latency_ms, client_id, auth_scheme, upstream_service, bytes_in, bytes_out`

### `Registry` — emitted on registry add/modify/delete
`timestamp, change_type (added|modified|deleted), endpoint_path, method, version?, service, owner_team?, auth_required, deprecated_flag, sunset_date?, last_modified`

### `Code` — emitted per discovered endpoint declaration in a code change
`timestamp, repo_name, commit_sha, endpoint_path, method, service, file_path, last_commit_date, last_author, runtime, runtime_version`

All timestamp fields are `chrono::DateTime<Utc>` and serialize as RFC 3339 / ISO 8601.

---

## The shared queue

```rust
let (tx, rx) = data::queue::make(10_000);  // bounded mpsc
```

* `Tx = mpsc::Sender<Tagged>`
* `Rx = mpsc::Receiver<Tagged>`
* Capacity is the caller's choice (default suggestion: 10 000).
* The queue is the boundary. Downstream owns `rx`.

Two helpers in `queue.rs`:
- `push(&tx, &m, ev)` — `try_send`. On full, increments `dropped` and returns. Non-blocking. Used by producers that prefer dropping to stalling (webhooks, replayers, low-volume scanners).
- `push_blocking(&tx, &m, ev).await` — `send().await`. Blocks until space is available. Used by `real_traf` to give at-least-once delivery into the queue.

---

## Backpressure decisions per producer

| Producer | Mode | Why |
|---|---|---|
| `syn_traf` | drop (`try_send`) | Replay rate is bounded by config; backpressuring the rate controller would just stall the demo. Drops are visible via the counter. |
| `syn_reg` | drop | Low volume by nature (one batch per 30 s poll). Drops here mean the queue is broken downstream. |
| `syn_code` | drop | One-shot batch at startup. |
| `real_traf` | **block** (`push_blocking`) | The plan calls for at-least-once delivery into the queue. Blocking on a full queue is the only way to guarantee that without offset replay infra. **Caveat:** "at-least-once" here is only as strong as the TCP source itself — see [known limitations](#known-limitations). |
| `real_reg` | drop | Webhook handler must respond fast; polling mode is low volume. |
| `real_code` | drop | Webhook handler returns 202 immediately and spawns a background task; that background task may run after the response so blocking has no upside. |

---

## Lifecycle

Every producer:

```rust
let p = SynTraf::new(cfg, tx.clone());
p.start().await;        // idempotent — second call is a no-op
let snap = p.health();  // counters + last_ts
p.stop().await;         // signals the task to exit on the next loop iteration, then awaits join
```

Internally each owns:
- `Arc<AtomicBool>` `run` flag — flipped to `false` by `stop()`, polled by the spawned task.
- `Mutex<Option<JoinHandle<()>>>` — holds the task handle so `stop()` can `await` it.
- `Arc<M>` — atomic counters shared between the public surface (`health()`) and the spawned task.

A failure in one producer logs + backs off (where applicable) and does not affect any other producer. Each task is fully isolated.

---

## Logging

All logging is one JSON object per line on stdout. Three call sites only. Heartbeat cadence is currently hard-coded to 30 s in every producer that has a heartbeat loop (syn_traf, syn_reg, syn_code, real_traf, real_reg::Poll). A future change would lift this to a per-producer config field so a registry watcher could heartbeat every 5 minutes and a high-rate replayer every 5 seconds. `real_code` and `real_reg::Webhook` do not currently emit a periodic heartbeat — their main task is an axum server with no work-loop to sample.

```jsonl
{"t":"2026-05-23T12:00:00Z","kind":"start","who":"syn_traf"}
{"t":"2026-05-23T12:00:30Z","kind":"hb","who":"syn_traf","emit":14721,"drop":0,"err":0}
{"t":"2026-05-23T12:00:31Z","kind":"error","who":"syn_traf","msg":"..."}
{"t":"2026-05-23T12:05:00Z","kind":"stop","who":"syn_traf"}
```

Per-event logs are **not** emitted. The heartbeat (every 30 s) is the only volume-visible log.

---

## Metrics

`Snap` carries `emitted`, `dropped`, `errors`, `last_ts` (epoch seconds of last successful emit). These are the universal counters across all six producers — exposed via `health()` and serializable (for any introspection endpoint a caller wants to mount).

---

## Path A inputs

* `data/synthetic/gateway_logs.jsonl` — one `Traffic` per line.
* `data/synthetic/registry.json` — list of registry `Entry` records (shape in `syn_reg.rs`).
* `data/synthetic/repo/` — sample microservice files with route declarations.
* `data/synthetic/repo/_meta.json` — `{ "<relative path>": { last_commit_date, last_author, runtime, runtime_version } }` — synthetic stand-in for Git history.

These paths are **conventional**, not hardcoded — every producer takes its file/dir paths through its `*Cfg` struct.

## Path B inputs

* `RealTrafCfg { broker, topic, group, gateway }` — broker is a `host:port` for the TCP stream consumer. `gateway` selects the translator (`"kong"` v1; canonical-shape JSON falls through directly).
* `RealRegCfg { mode }`:
  - `Poll { url, secs }` — HTTP GET that returns a `Vec<Entry>`.
  - `Webhook { bind, path }` — axum server on `bind`, POST handler at `path`, accepts `{ "changes": [{ "change_type", ...entry fields }] }`.
* `RealCodeCfg { bind, path, secret, api_base, api_token }` — axum POST at `path`. Validates `x-hub-signature-256` against `secret`. Fetches changed file content from `{api_base}/repos/{full_name}/contents/{path}?ref={sha}` with `Authorization: Bearer {api_token}`. **Tested against the GitHub push-event shape only.** Gitea matches GitHub's HMAC scheme and `x-hub-signature-256` header, so it should work without changes. GitLab uses a different scheme — a plain-compare `X-Gitlab-Token` header by default, no HMAC — and would need its own verifier function alongside `verify()`. Bitbucket signs with `X-Hub-Signature` (no `-256` suffix) and SHA-1; also out of scope here.

---

## Route parser (shared by `syn_code` and `real_code`)

`syn_code::parse_routes(src, runtime) -> Vec<(method, path)>` runs one regex per supported runtime:

| Runtime | Pattern matched |
|---|---|
| `python` | `@blueprint.get("/...")`, `@router.post("/...")`, etc. |
| `nodejs` | `app.get('/...')`, `router.post('/...')`, etc. |
| `java` / `springboot` | `@GetMapping("/...")`, `@PostMapping(value = "/...")`, etc. |
| `golang` | `r.GET("/...")`, `r.POST("/...")` (gin / chi shape) |
| `dotnet` | `[HttpGet("/...")]`, `[HttpPost("/...")]`, etc. |

Method strings are normalized to uppercase in the emitted `Code` event.

The parser is regex-based, not AST-based. See [known limitations](#known-limitations) for what it will miss.

---

## Wiring example (caller code)

```rust
use data::{cfg::*, make, syn_traf::SynTraf, real_traf::RealTraf, prod::Prod};
use std::path::PathBuf;

let (tx, rx) = make(10_000);

let a1 = SynTraf::new(
    SynTrafCfg { file: PathBuf::from("data/synthetic/gateway_logs.jsonl"), rate: 500, compress: 1.0 },
    tx.clone(),
);
a1.start().await;

let b1 = RealTraf::new(
    RealTrafCfg { broker: "broker.local:9092".into(), topic: "gw.access".into(), group: "data-ingest".into(), gateway: "kong".into() },
    tx.clone(),
);
b1.start().await;

// downstream consumer reads `rx` …
```

---

## Known limitations

Things this implementation does **not** do, deliberately or because of the chosen shortcuts. Worth knowing before a demo.

* **`real_traf` is a TCP line consumer, not a real Kafka client.** `RealTrafCfg` carries `broker`, `topic`, and `group` fields to match the plan's vocabulary, but the implementation just connects to `broker` as a `host:port` and reads newline-delimited JSON. `topic` and `group` are accepted and ignored at this layer. Consequence: the "at-least-once into the queue" claim only holds while the TCP source itself does not drop messages between `send()` calls. A real Kafka client would commit consumer offsets after a successful enqueue and replay from the last committed offset on restart, giving genuine at-least-once across process restarts. The current implementation has no such replay; on disconnect it reconnects (with exponential backoff) but starts from whatever the broker sends next.

* **Route parsing is regex-based, not AST-based.** Each runtime in `parse_routes` is a single regex. This catches the common, single-line decorator/annotation form (`@app.get("/foo")`, `@GetMapping("/foo")`, `r.GET("/foo", ...)`, `[HttpGet("/foo")]`) and nothing else. Specifically it **will miss**:
  - Multi-line decorators (Python `@app.get(...\n  ...)`, Java `@RequestMapping(\n  method = ...,\n  value = "/foo"\n)`).
  - Computed paths (`@app.get(BASE + "/foo")`, `@app.get(f"/{prefix}/foo")`, string formatting, constants).
  - Mount-time URL composition (`app.use("/v1", router)`, Spring `@RequestMapping` on a controller class with `@GetMapping` on a method).
  - Frameworks not in the table (FastAPI's `APIRouter.include_router` chains; gRPC; GraphQL; webhook frameworks).
  - Generated routes (codegen, macros, runtime decorators).

  For the controlled synthetic repo this is fine — the contents are known. For a real GitHub push, `real_code` will under-report endpoints. Document this when claiming "endpoint discovery from code". A real implementation would use tree-sitter or per-language AST parsers.

* **`real_code` HMAC verification is GitHub/Gitea-shaped.** It reads `x-hub-signature-256` and verifies with HMAC-SHA256. GitLab (default `X-Gitlab-Token` plain compare, no HMAC) and Bitbucket (legacy `X-Hub-Signature` SHA-1) would need their own verifier added next to `verify()` and a config switch to pick which one to use.

* **Heartbeat cadence is hard-coded to 30 s.** Lifting this to a per-producer config field is the natural next change — the registry diff loop is comfortable at 5 minutes, a 5 000 ev/s replayer benefits from 5 s.

* **`real_code` and `real_reg::Webhook` emit no periodic heartbeat.** Both run an axum server as their main task and have no work-loop to sample. The startup, shutdown, and error logs still fire; only the heartbeat is absent. A future change would spawn a side task that polls the metrics counters at the configured cadence.

* **Webhook payload validation is structural-only.** `real_reg::wh` and `real_code::hook` deserialize into the expected shape; if the payload deserializes successfully, downstream fields are trusted. No schema-version negotiation, no request-id deduplication, no replay-protection beyond HMAC.

---

## What is out of scope here

- The downstream consumer that drains `rx`.
- The mechanism that picks which producers to start (synthetic / real / mixed).
- Event persistence — the queue is the boundary, not durable storage.
- The load generator used to populate the real broker during integration testing.
- Any UI / dashboard / introspection HTTP endpoint exposing `health()` snapshots.

---

## Build / verify

```bash
cd pipe/data
cargo check
```

Compiles clean on Rust edition 2024 (Rust 1.85+). Dependencies are tokio, serde, serde_json, chrono, uuid, async-trait, axum, reqwest (rustls-tls), regex, hmac, sha2, hex.
