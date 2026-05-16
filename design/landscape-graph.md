# landscape-graph — stratigraphic cross-section spec

Route: `/landscape`. **This screen is the product's signature differentiator.** It is NOT a force-directed graph. It is a **stratigraphic cross-section** of the bank's API estate, plotted in two fixed axes:

- **X axis**: service domain — categorical, ~12 vertical lanes.
- **Y axis**: birth year — continuous, present at top (2026), oldest stratum at bottom (pre-2010).

Every endpoint is plotted at `(service-lane, birth-year)`. Zombies are literally **buried in the deeper strata** because they are older. Edges crossing strata represent dependencies that span decades — the high-signal relationships an analyst cares about.

**Do not use `react-force-graph-2d`.** That library implements a force-directed layout. We need a fixed-position SVG (or D3) layout. The migration brief lists the dependency change.

---

## full ASCII layout

```
┌──────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│      │  api landscape · stratigraphic cross-section                          [ id · zh-_____ ]    [ path · /v1/_ ]           │
│      │                                                                                  [ run discovery scan ]  [● connected] │
│  ZH  ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│      │                                                                                                                       │
│  ▼   │  classification  [ all ]  [ active ]  [ deprecated ]  [ orphaned ]  [ critical ]                                       │
│  ◇   │  node type       [ all ]  [ endpoint ]  [ service ]  [ database ]  [ gateway ]  [ team ]  [ deployment ] …            │
│  ▣←  │                                                                                                                       │
│  ▷   ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│      │ depth ·  service →   auth │ core │ payments │ upi  │ imps │ neft │ rtgs │ kyc │ aml │ cards │ internal │ legacy │     │
│      │ 2026  ────────────────────┼──────┼──────────┼──────┼──────┼──────┼──────┼─────┼─────┼───────┼──────────┼────────│     │
│      │ ╴  ╴  ╴  ╴  ╴  ╴  ╴  ╴  ╴ ●●●  │ ●●●  │ ●●●●●●  │ ●●●●● │ ●●●  │ ●●  │ ●  │ ●●● │ ●●● │ ●●●●  │ ●●●●●●  │ ─  │     │
│      │ 2024  ────────────────────┼──────┼──────────┼──────┼──────┼──────┼──────┼─────┼─────┼───────┼──────────┼────────│     │
│      │ ╴  ╴  ╴  ╴  ╴  ╴  ╴  ╴  ╴ ●●  │ ●●●  │ ●●●●  │ ●●● │ ●●  │ ●  │ ─  │ ●●  │ ●●  │ ●●●   │ ●●●●   │ ─  │           │     │
│      │ 2020  ────────────────────┼──────┼──────────┼──────┼──────┼──────┼──────┼─────┼─────┼───────┼──────────┼────────│     │
│      │                                                                                                                       │
│      │ ╴  ╴  ╴  ╴  ╴  ╴  ╴  ╴  ╴ ●   │ ●●   │ ●●●   │ ╴●╴  │ ╴●●╴ │ ╴●╴ │ ─  │ ╴●╴ │ ╴●╴ │ ●     │ ●●     │ ╴●●╴│           │
│      │ 2017  ────────────────────┼──────┼──────────┼──────┼──────┼──────┼──────┼─────┼─────┼───────┼──────────┼────────│     │
│      │                                                                                                                       │
│      │ ╴  ╴  ╴  ╴  ╴  ╴  ╴  ╴  ╴ ╴●╴  │ ╴●╴  │ ╴●●╴  │ ╳●╴  │ ╴●●╴ │ ╴●╴ │ ─  │ ╴●╴ │ ╴●╴ │ ╴●╴   │ ╴●●╴   │ ╴●●╴│           │
│      │ 2014  ────────────────────┼──────┼──────────┼──────┼──────┼──────┼──────┼─────┼─────┼───────┼──────────┼────────│     │
│      │                            ╳ zh-0142                                                                                 │
│      │ ╴  ╴  ╴  ╴  ╴  ╴  ╴  ╴  ╴ ─   │ ─    │ ╴●╴   │ ─   │ ╴●╴  │ ─  │ ─  │ ─  │ ─  │ ─    │ ╴●╴   │ ─  │                  │
│      │ 2011  ────────────────────┼──────┼──────────┼──────┼──────┼──────┼──────┼─────┼─────┼───────┼──────────┼────────│     │
│      │                                                                                                                       │
│      │ ╴  ╴  ╴  ╴  ╴  ╴  ╴  ╴  ╴ ─   │ ╳●╴  │ ╴●╴   │ ─   │ ─    │ ─  │ ─  │ ─  │ ─  │ ─    │ ─     │ ╴●╴│                  │
│      │ pre-2010 ─────────────────┼──────┼──────────┼──────┼──────┼──────┼──────┼─────┼─────┼───────┼──────────┼────────│     │
│      │                                  ╳ zh-0817                                                                            │
│      │                                                                                                                       │
│      │                                                                                  ┌─ legend ───────────────────┐       │
│      │                                                                                  │ node    shape · type      │       │
│      │                                                                                  │ ●       endpoint           │       │
│      │                                                                                  │ ■       service            │       │
│      │                                                                                  │ ◆       gateway / auth      │       │
│      │                                                                                  │ ╳       risk_finding         │       │
│      │                                                                                  │ stroke  classification     │       │
│      │                                                                                  │ ●       active (solid)     │       │
│      │                                                                                  │ ╴●╴     deprecated/orphaned │       │
│      │                                                                                  │         (dashed)            │       │
│      │                                                                                  │ ╳       critical (solid+×)  │       │
│      │                                                                                  └─────────────────────────────┘       │
│      │                                                                                                                       │
└──────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## layout system

### the canvas

- Background: `bg-grid-strata` — the heavier dotted grid (32px major dots in `grid-dot-strong`, 8px minor dots in `grid-dot`). This is the only screen that uses the strata grid backdrop.
- The grid is more visible here than on the Command Center because the graph is the content — we want the user to see the orthogonal axis system.
- Canvas fills the page below the filter rail. Padding: 24px on all sides.

### filter rail (above the graph, ~80px tall)

- Same chip pattern as Inventory (see `inventory.md`): two rows of filter chips for classification and node-type.
- 1px `hairline` bottom border separates from the graph canvas.

### the axis system

#### Y axis — depth (years)

- Drawn on the **left edge** of the canvas, ~96px wide column.
- 6 horizontal stratum bands, from top to bottom: `2026`, `2024`, `2020`, `2017`, `2014`, `2011`, `pre-2010`. Each band is a continuous range (e.g., 2024 band covers 2024 → 2026).
- Band heights: stretched to fill canvas height. At 1080p viewport, each band ≈ 130px.
- Band label: `YYYY` in `font-mono`, 10px / 1 / 400, color `bone-dim`, vertically centered on the band's upper boundary line.
- Between band boundaries: dotted horizontal `╴` line in `sediment` (made of `╴` glyphs spaced 8px apart, OR rendered as an SVG `stroke-dasharray="2 6"` 1px line).
- The deeper a stratum (lower on screen), the slightly darker its band background: `2024` band uses `tar`; `pre-2010` band uses `tar` with a 2%-opacity overlay of `stratum`. This is **very** subtle — at 2-4% opacity step. The intent is "the deeper you go, the older the rock", visible only when you stop and look.

#### X axis — service domain

- Drawn at the **top** of the canvas, ~32px tall row.
- 12 vertical lanes, each ~120px wide at the canonical 1440px viewport (or `(canvas_width - 96) / 12` fluid).
- Lane labels in 10px mono 500 `bone-dim`, lowercase, centered at the top of each lane: `auth`, `core`, `payments`, `upi`, `imps`, `neft`, `rtgs`, `kyc`, `aml`, `cards`, `internal`, `legacy`.
- Lane boundaries: faint 1px vertical `hairline` lines extending the full canvas height (so the grid + boundaries form a true cross-section).
- The label `legacy` is in `deprecated` color (sepia) — it is the only colored lane label, signaling its semantic significance. Endpoints in the `legacy` lane are disproportionately likely to be zombies.

#### corner label

The top-left corner of the canvas (96×32px, above the Y axis and to the left of the X axis) reads:

```
depth ·   service →
```

In 10px mono 500 `bone-dim`. The `depth` label refers downward (the Y axis); the `service →` label refers rightward (the X axis). This is the conventional reading-order indicator for a cross-section diagram.

### node placement

For each endpoint:

- **X coordinate**: the center of its `service` lane.
- **Y coordinate**: linearly interpolated within its birth-year band. (E.g., a 2015 endpoint sits in the 2014-2017 band, ~33% down from the top boundary.)
- **Jitter**: if two endpoints land at the same `(lane, year)`, jitter X by ±8-16px so they don't overlap. Jitter is deterministic from the specimen id hash, so the layout is stable.

For each non-endpoint node (service / database / gateway / etc.):

- Plotted in the **left margin** of its lane at a special "infrastructure layer" — the top 24px of the X axis row. They sit *above* the depth axis as a metadata strip.
- They are linked to their endpoints via thin `owned_by` / `routes_to` edges drawn through the canvas.

### node shapes & styles

See `components.md` §10 for the canonical shapes. Recap of fills/strokes:

| classification | fill | stroke | extra |
|---|---|---|---|
| `active` | `active` @ 65% opacity | `active` @ 100%, 1px solid | crisp |
| `deprecated` | `deprecated` @ 50% | `deprecated` @ 100%, 1px **dashed** `2 2` | opacity 0.92 |
| `orphaned` | `orphaned` @ 40% | `orphaned` @ 100%, 1px **dashed** `1 2` (very broken) | opacity 0.85 |
| `critical` (orphaned + tier=critical) | `critical` @ 60% | `critical` @ 100%, 1.5px solid | a small `╳` mark in `critical` painted **at the node center**, sized 8px |

#### node size by traffic

`size_radius = clamp(4, sqrt(calls_30d) * 0.6 + 4, 16)`.

- A high-traffic active endpoint is a bold 12-16px circle.
- A zombie endpoint with `calls_30d = 0` is a tiny 4px circle. The product visually conveys "this is small because nobody calls it any more".

### specimen-id labels

Only the **currently-hovered** and the **selected** nodes display their `zh-NNNN` label. Showing all labels at once would clutter the strata.

- Label placement: 4px below the node, anchored center-X. Format: `zh-0142` in 10px mono 400 `bone-dim` on a `stratum` 1px `hairline` panel with 2px horizontal padding.
- For `critical` nodes, the label uses `critical` color and renders 12px below the node (to clear the `╳` mark).
- Labels do not pan with mouse — they pop in/out on hover/select.

### edges

Rendered as SVG `<path>` elements (cubic bezier curves, not straight lines, to avoid the rats-nest look of straight lines crossing).

- Default thickness: 1px. Default opacity: per edge-type table in `components.md` §10.
- Curvature: the path bows away from the canvas center, giving the diagram its "subterranean cabling" feel.
- Cross-stratum edges (edges whose source and target are in different birth-year bands): rendered 1.5px thick, opacity bumped to 0.5. These are the **dependencies that span decades** — the high-signal edges.
- Edges from selected node: solid `blueprint`, 2px, opacity 1.0, drawn on top of all other edges.

### infrastructure layer (above the X axis)

A 32px-tall row above the depth axis houses non-endpoint nodes (services, databases, gateways, etc.). This is the "modern surface" — the systems that are present today regardless of the buried endpoints they wrap.

- The infrastructure row has its own subtle background: `stratum @ 0.4` overlay. It is visually a thin slab above the strata.
- Service nodes (`■` squares) are plotted at the center-top of their lane.
- Gateway / auth_system / database nodes cluster around their owning service, with 8px gap.

### the geological gradient

A subtle visual cue: the deeper a stratum, the more "deposit dust" we paint over it. Implemented as a sequence of three overlay layers:

1. Stratum 1 (2024-2026): no overlay.
2. Stratum 2 (2020-2023): `radial-gradient(at top, transparent, rgba(232,225,208,0.005))` covering the band.
3. Stratum 3 (2017-2019): same, 0.010 opacity.
4. Stratum 4 (2014-2016): 0.015 opacity.
5. Stratum 5 (2011-2013): 0.020 opacity, plus `.overlay-stipple` (the dust texture).
6. Stratum 6 (pre-2010): 0.030 opacity, plus `.overlay-stipple` at higher density.

The effect is barely perceptible at a glance but contributes to the "deeper = older = dustier" reading.

### legend

Bottom-right of the canvas, see `components.md` §15. Floats over the graph with a `stratum` 1px `hairline` background. Click to collapse to a `[ legend ▾ ]` 88×24 button.

---

## interactions

| interaction | result |
|---|---|
| Hover node | specimen-id label appears; node stroke brightens 1.2×. |
| Click endpoint node | opens the endpoint drawer (`uiStore.drawerOpen = true`). |
| Click non-endpoint node | opens a small popover with the node's metadata. |
| Click empty canvas | deselects current node; if drawer open from the graph, closes it. |
| Scroll wheel | zoom (1.0 → 4.0 range). Cursor position is the zoom origin. |
| Click-drag | pan. |
| `0` key | reset zoom + pan to default. |
| `f` key | fit-to-content (zoom so all nodes are visible). |
| Type in path search | highlight nodes whose path matches; non-matches drop to 0.2 opacity. |
| Press `Esc` | clear selection + search; restore default view. |

### node selection state

A selected node has:

- A 2px solid `blueprint` ring 4px outside the node.
- Its specimen-id label permanently shown.
- All edges connecting to/from it rendered as 2px solid `blueprint`, opacity 1.0.
- All other edges dropped to 0.1 opacity.
- All other nodes dropped to 0.5 opacity.

This is **focus mode** — implicitly entered on click. Click empty canvas to exit.

---

## intro animation (settle into strata)

When the page mounts:

1. All nodes appear instantly at their target X coordinate but Y = 0 (top of canvas).
2. Over 900ms with `ease-decay` easing, every node descends to its target Y coordinate. Sub-stagger: each node's animation has a +`(birthYearAgo * 6ms)` delay so newer endpoints settle first, ancient endpoints last. The visual reading is *"the endpoints fall into their geological positions in chronological order"*.
3. Once all nodes settle, edges fade in over 320ms.

This animation runs **once** on mount. It does not loop. It does not re-run on filter changes.

---

## states

| state | rendering |
|---|---|
| loading | all 12 X-axis lane labels render; Y axis bands render; canvas is empty with a single line at center `retrieving stratigraphy…  ▮` in 12px mono `bone-dim`. |
| empty (no nodes in graph) | the axis renders; canvas shows `no specimens recovered. depth scan has not been executed.   ▶ run discovery scan` centered. |
| filtered (chips selected) | nodes that don't match drop to 0.15 opacity. Edges connecting only to filtered-out nodes drop to 0.05 opacity. The count line at the top of the canvas updates: `showing n = N of M specimens · filter: classification = orphaned`. |
| disconnected | the canvas dims to 0.6 opacity; a banner at the top: `▲ live updates paused — connection severed at {ts}` in `critical` color. Nodes don't update until reconnect. |

---

## responsive

| breakpoint | layout |
|---|---|
| ≥1440 | full 12-lane layout |
| 1200-1439 | lanes 1100-1300px wide collapse: `internal` and `legacy` combine into one lane labeled `internal/legacy` |
| 900-1199 | further compression: `imps`/`neft`/`rtgs` collapse to one `rails` lane |
| <900 | the graph is replaced with a fallback message: `cross-section requires ≥900px viewport. open inventory to browse specimens →` with a CTA link |

---

## accessibility

- **The graph is not accessible to screen readers.** The Inventory view is the assistive fallback (and the brief explicitly states this is acceptable). The graph contains an `aria-hidden="true"` and an off-screen text alternative: `api landscape graph. 281 specimens plotted across 12 service lanes and 6 birth-year strata. Browse the inventory at /inventory for a list view.`
- Keyboard users can `tab` through the focusable controls (filter chips, search input, legend toggle). The graph canvas itself accepts arrow keys for pan and `+/−` for zoom but the primary navigation pathway for keyboard/screen-reader users is the inventory.
- The legend is always visible (or collapsible — never hidden by default) so the visual encoding is always documentable.
- Color is never the only signal: classification is encoded in stroke (solid/dashed/broken-dashed) and risk in shape (`╳` mark for critical).

---

## implementation notes

### library choice

- **Do not use `react-force-graph-2d`** — it implements force-directed layout, which is the wrong metaphor.
- **Use D3** for the layout math and SVG rendering, OR implement directly as React SVG with manually-computed positions.
- The simpler path: a custom React component that takes `nodes: GraphNode[]`, computes `(lane_x, year_y)` for each, and renders an `<svg>` with `<g>`s for each stratum.
- Edges: `<path d="M x0,y0 C cp1x,cp1y cp2x,cp2y x1,y1" />`.
- Zoom/pan: D3's `d3-zoom` is the standard. Wraps the `<svg>`'s root `<g>` with a `transform`.

### performance

- At 1000 nodes the SVG approach is fine. At 5000+ nodes, switch to `<canvas>` rendering for the nodes (and SVG just for the axes + selected-node decorations). The product target is 1-2k nodes per bank, so SVG is sufficient.
- `will-change: transform` on the zoom-target `<g>` to keep panning smooth.
- Animations use framer-motion only for the intro settle and the fault-line propagation; the rest is CSS transitions.

---

## acceptance criteria

- [ ] The graph plots nodes at fixed `(service-lane, birth-year)` positions, not force-directed.
- [ ] The Y axis has 6+ labeled stratum bands with the dotted boundary lines.
- [ ] The X axis has 12 service lanes (collapsible at smaller breakpoints) with the `legacy` lane label rendered in `deprecated` color.
- [ ] Each endpoint node renders with size by traffic and stroke style by classification (solid/dashed/broken-dashed).
- [ ] Critical-tier orphaned nodes render with a `╳` mark at center.
- [ ] The deeper strata get progressively dimmer dust overlay.
- [ ] Hovering a node shows its specimen-id label; selecting a node enters focus mode with blueprint-highlighted edges.
- [ ] The intro animation settles nodes into their strata over 900ms with a chronological stagger.
- [ ] Filter chips work and dim non-matching nodes.
- [ ] The legend renders the shape/classification/edge tables.
- [ ] Zoom (wheel) and pan (drag) work; `0` resets, `f` fits.
- [ ] The accessibility fallback message exists and points to the inventory.
