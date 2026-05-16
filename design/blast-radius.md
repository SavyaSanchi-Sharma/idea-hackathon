# blast-radius — mode spec

Not a separate screen — a **mode** of the Landscape graph (see `landscape-graph.md`). Triggered from the endpoint drawer's `show blast radius ▣` button, or from any specimen-card's action menu.

The blast radius answers the question: *"if this zombie endpoint were compromised, what is the maximum reachable damage path?"*

In our concept, the blast radius is a **fault line** — a structural crack — propagating outward through the strata. It crosses depths, traverses lanes, and visibly damages everything reachable. All unreachable systems dim into the background.

---

## activation

- `uiStore.graphMode = "blast_radius"` and `uiStore.blastRadiusOriginId = endpoint_id`.
- The route `/landscape` reads these and triggers blast-radius mode immediately on mount.
- When activated from the drawer: the drawer slides out (260ms) and the user lands on the Landscape view with blast-radius already engaged.

---

## visual changes when blast-radius mode is active

### the origin node

- Renders at 2× normal radius (e.g., a 12px node becomes 24px).
- Stroke: 2px solid `critical`.
- Fill: `critical` @ 80% opacity.
- A pulsing 4px `critical` ring expands from the origin (radius 24 → 64px, opacity 0.6 → 0.0) every 2.4s. Drawn as SVG `<circle>` with CSS `animation`.
- Specimen-id label is permanently shown above the node in `critical` color, 12px mono 600.

### the fault-line edges

Each edge in `BlastRadius.edges` is drawn as a **fault line**:

- Path: a thicker 2px solid `critical` overlay drawn on top of the original edge.
- Stroke: `critical` color.
- Edges propagate in waves from the origin outward. The propagation uses BFS layers:
  - Layer 0: edges directly from the origin. They animate in over 300ms with `ease-decay`.
  - Layer 1: edges from layer-0 nodes to their reachable neighbors. Start 240ms after layer 0.
  - Layer N: starts 240ms × N after the origin.
- Animation per edge: `stroke-dasharray` set to `0 length`, then animated to `length 0` over 300ms — gives a "the crack draws from source to target" feel.
- After all edges are drawn, the entire blast graph stays static with a single `fault-pulse` animation looping every 4s (very subtle opacity 0.7 → 1.0 → 0.7 on the fault overlay layer).

### reachable nodes

- Stroke: 2px solid `critical` (regardless of original classification).
- Fill: the original classification color but darkened to 50% lightness.
- Specimen-id labels are shown for ALL reachable nodes (the user is now navigating a damage map, so they need to read them).
- An animation propagates: as the fault edge reaches a node, the node's stroke updates from its original color to `critical` over 200ms.

### unreachable nodes and edges

- Opacity drops to **0.12** (barely visible, but they are still there — analyst can still see them as ghosts).
- This is the contrast that makes the blast path read.

### the canvas backdrop

- The dotted grid backdrop dims to `grid-dot` at 50% opacity. The strata bands dim 1 step.
- The legend updates to show the blast-radius-specific encoding (see below).

---

## overlay summary panel

A `stratum-raised`-backed panel anchored at the bottom-left of the canvas, 320px wide, fluid height. 1px solid `decay-critical` border + `.overlay-scanline`. Padding 16px.

```
┌─ blast radius / zh-0142 ──────────────────────────────────
│
│   origin     zh-0142  ·  GET /legacy/upi/collect-v1
│   estimated  n ≈ 3.4M records reachable
│
│   downstream systems reached
│   ├╴ core-banking (read + write)
│   ├╴ NPCI rails (read)
│   ├╴ kyc-services (read)
│   ╳╴ aml-services (write — escalation path)
│
│   write/delete access in path · YES
│
│   ┌──────────────────────────┐  ┌────────────────────┐
│   │  block now               │  │  exit blast mode   │
│   └──────────────────────────┘  └────────────────────┘
│
└──────────────────────────────────────────────────────────
```

### content

- Frame header: `┌─ blast radius / zh-NNNN ─` in 12px mono 500 `sediment` for chars, `bone-dim` for label.
- `origin    {specimen-id}  ·  {method} {path}` in 12px mono 500 `bone`.
- `estimated  n ≈ {affected_records} records reachable` — the number uses the readout pattern with `≈` to indicate it's an estimate. Rendered with units: a millions value formats as `≈ 3.4M`. Color: `critical` for the number.
- Section sub-header `downstream systems reached` in 11px mono 600 `bone-dim`.
- A tree of affected systems (max 6 shown; "+ N more" if longer). Each entry uses `├╴` prefix in `sediment`, the system name in `bone`, then ` ({access-level})` in `sediment-strong`. Lines where the access level includes "write" use `╳╴` instead.
- `write/delete access in path · {YES|NO}` in 11px mono 500 — the value in `critical` if YES, in `active` if NO.
- Two buttons in a row:
  - Primary: the action that matches the endpoint's `recommended_action` (here `block now` in `critical` border).
  - Secondary: `exit blast mode` in `bone-dim` border (returns the graph to normal mode).

### entrance animation

The panel slides in from below: `transform: translateY(100%) → 0` over 320ms with `ease-instrument`, starting **after** the layer-0 edges have begun propagating (so the visual sequence is: pulse the origin → draw fault edges → reveal the summary panel).

---

## legend updates (blast-radius mode)

When blast-radius mode is active, the legend's content shifts to show the blast-radius-specific encoding:

```
┌─ legend · blast radius ──────────────────────────────────
│
│  node        meaning
│  ●━          origin specimen (pulsing)
│  ●           reachable node (stroke = critical)
│  ◌           unreachable node (dimmed)
│
│  edge        relationship
│  ━━━━        fault line — propagation path
│  ─ ─ ─       original edge (dimmed)
│
└──────────────────────────────────────────────────────────
```

---

## interactions

| interaction | result |
|---|---|
| Click on a reachable node | opens that endpoint's drawer over the graph; the blast-radius state persists. Closing the drawer returns to the blast-radius view. |
| Click on an unreachable node | does nothing (cursor: `default`). |
| Click on `exit blast mode` button | sets `uiStore.graphMode = "normal"`, clears `blastRadiusOriginId`. The fault overlay fades out over 240ms, edges/nodes restore over the next 240ms, the summary panel slides out. |
| Press `Esc` | exits blast mode. |
| Click the origin node | does nothing (it's already selected). |
| Click on the canvas (empty area) | does nothing while in blast mode. (Empty-canvas-deselect is disabled — blast mode requires explicit exit.) |
| Click `block now` | calls `POST /api/endpoints/{id}/action` with `{ action: "block" }`. On success: a toast appears (top-right, 8px from edge) `specimen zh-NNNN blocked. rate limit → 0. policy push queued.` and the origin node updates its appearance (a 12-tooth gear-like `⊗` mark replaces the `●`). Exits blast mode after 2s. |

---

## responsive

- The blast-radius summary panel adapts the same way as the legend: at <1200px it floats over the canvas with the same dimensions; at <900px it expands to 80vw and stacks below the canvas.
- On the <900px fallback for the graph (where the graph itself is hidden), blast-radius mode becomes a list view: the summary panel renders full-width, and the reachable nodes are listed as specimen rows (same atom as the Inventory) below it.

---

## states

| state | rendering |
|---|---|
| loading (BlastRadius fetch in flight) | the origin node renders pulsing; all other nodes dim to 0.4 opacity; the summary panel renders with the frame and a `retrieving blast radius…  ▮` line inside. |
| loaded (full data) | as above with full propagation animation. |
| empty (no reachable nodes — orphan endpoint with no downstream graph) | the summary panel shows: `no reachable downstream systems. specimen is structurally isolated.` This is rare but happens for orphans that have zero outgoing edges. |
| failed (api error) | the summary panel shows: `▲ failed to compute blast radius for zh-NNNN. retry?` with a `retry` button. Mode stays active (the user can still exit). |

---

## accessibility

- Mode change is announced via `aria-live="assertive"` polling region: `entered blast radius mode. zh-0142 with 47 reachable nodes and write access in path.`
- The summary panel has `role="region"` and `aria-label="blast radius summary"`.
- Each tree row in the summary is a `<li>` with `aria-label` `core banking, read and write access reachable`.
- The graph remains hidden from screen readers; the summary panel + inventory are the assistive view.

---

## acceptance criteria

- [ ] Blast mode is activated by `uiStore.graphMode = "blast_radius"` + `blastRadiusOriginId`.
- [ ] The origin node renders at 2× radius with the pulsing ring.
- [ ] Fault edges propagate outward in BFS layers with 240ms staggers, each edge animating its dasharray.
- [ ] Reachable nodes adopt 2px `critical` stroke as the fault reaches them.
- [ ] Unreachable nodes and edges drop to 0.12 opacity.
- [ ] The summary panel slides in from below, shows origin, estimated records (with `n ≈` and `M`/`k` units), downstream systems tree (with `╳╴` for write-access lines), and write/delete YES/NO with the critical/active color.
- [ ] `block now` calls the action API and shows a toast confirmation.
- [ ] `exit blast mode` / `Esc` cleanly restores the normal graph view.
- [ ] Legend swaps to the blast-radius-specific encoding while mode is active.
