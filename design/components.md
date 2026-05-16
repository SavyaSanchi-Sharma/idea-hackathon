# components — atom redlines

Every component below uses tokens from `tokens.css` / `tailwind.tokens.js` and obeys the motifs from `identity.md`. Dimensions in px. ASCII mockups assume 1 char ≈ 7px of mono width.

---

## 1. classification badge

A tiny pill that labels every endpoint with one of: `active`, `deprecated`, `orphaned`. Replaces the SOC green/amber/red pattern.

```
 active   deprecated   orphaned 
```

- Height: **18px**. Horizontal padding: 6px. Gap before label: 4px.
- Border-radius: `xs` (2px).
- Font: mono, 10px / 1 / 500, letter-spacing `0.04em`, lowercase (the spec already lowercases).
- Background: the matching `*-wash` token at 10% over the panel.
- Text color: the matching solid token (`active` / `deprecated` / `orphaned`).
- Leading dot: a 5px circle in the same color, vertically centered. Not optional — this is the accessibility-redundancy mark so state is conveyed by shape, not color alone.
- Outline: none in default state. On hover/focus: `0 0 0 1px var(--*-color)` with the same color at full saturation (lifts the badge).

States:

| state | change |
|---|---|
| default | as above |
| hover (when on a clickable row) | adds 1px outline of the matching color |
| focused (badge is selected as a filter chip) | adds outline AND `bg` brightens to 16% wash |
| disabled (e.g., filter not available) | opacity 0.4, no outline, cursor `not-allowed` |

---

## 2. risk-tier badge

Same shape as classification badge but uses the risk-tier palette. Labels: `critical`, `high`, `medium`, `low`. Always paired with the score (e.g., `tier critical · score = 92`).

```
 ◆ critical   ◆ high   ◆ medium   ◆ low 
```

- Leading mark: a 5px filled diamond (`◆`) — distinct from the classification badge's circle (`●`). This is the shape-redundancy for tier.
- Otherwise identical to the classification badge.

---

## 3. method pill

Already specified in `typography.md`. Recap for completeness:

```
GET    POST    PUT    DELETE    PATCH
```

- 18px tall, 6px horizontal padding, 2px radius.
- Mono 10px / 1 / 600, uppercase, letter-spacing `0.04em`.
- Fill is the method `wash`; text is the method color.
- No icons, no leading dot.

---

## 4. specimen card (the signature atom)

This is the **fundamental container** in ZombieHunter. Every endpoint that appears anywhere — top-risk list, inventory row, drawer header, graph hover-card — is rendered as a specimen card. The card replaces the generic "endpoint row" of every SaaS table.

### structure (default — active classification)

```
┌─────────────────────────────────────────────────────────────────────┐
│ zh-0142                                       posture = 92 / 100    │
│                                                                      │
│   GET   /v1/upi/collect                                              │
│                                                                      │
│   service · upi-gateway          team · payments-platform            │
│   t₀ = 2021-08-12   ·   ~5y old           ● active                   │
└─────────────────────────────────────────────────────────────────────┘
```

- Container: `bg-stratum`, 1px `hairline` border, no border-radius, padding 12px 16px.
- Min width: 360px. Min height: 88px. Width is fluid.

#### header line
- Left: **specimen-id**, 11px mono, `sediment-strong`, letter-spacing 0.04em, lowercase. `zh-0142`.
- Right: **posture readout**, 12px mono medium, tabular-nums. The label `posture =` in `sediment`, the value in `bone`, with `/ 100` in `sediment`. Right-aligned.

#### body line
- Method pill (see #3) + **endpoint path**, mono 14/1.25/600, `bone`, with a 12px gap between pill and path.
- The path is allowed to truncate with ellipsis on narrow widths. The full path is in `title=`.

#### footer line
- 11px mono 400, `bone-dim`, tabular-nums.
- Three fields separated by `·` (the bullet in `sediment`). Layout left-to-right: `service · {service}` | `team · {team}` | `t₀ = {birth-year} · ~Ny old`.
- The classification badge (#1) anchors the right side of the footer.

### state variations — decay encoding

| classification | container border | container effects | posture color |
|---|---|---|---|
| `active` | 1px solid `hairline` | none | `bone` for the value |
| `deprecated` | 1px **dashed** `decay-deprecated` (`#B8854A`), dash pattern `8 6` (set via SVG border component for precision — see implementation note) | opacity 0.94 | value in `deprecated` |
| `orphaned` | 1px **dashed** `decay-orphaned` (`#C8B068`), dash pattern `2 4` (short, broken) | opacity 0.88, `.overlay-stipple` layer | value in `orphaned` |
| `critical` (orphaned + tier critical) | 1px solid `decay-critical` (`#C24545`) | `.overlay-scanline` layer; `transform: rotate(var(--decay-tilt))` = −0.6°; **single hero card on dashboard:** uses `--decay-tilt-strong` (−1.2°) | value in `critical` |

#### implementation note — controllable dashed borders

CSS `border-style: dashed` browser-renders an uncontrolled dash. For consistent dash patterns matching the tokens, render the border as an SVG `<rect>` inside the card with `stroke-dasharray` set from `--decay-dash-pattern` / `--decay-stipple-pattern`. The card content is layered on top. This is a one-time `<SpecimenFrame>` wrapper component.

### interaction states

| state | change |
|---|---|
| hover | container border color steps up by one strength level (`hairline` → `hairline-strong`, `decay-deprecated` → 1.15× saturation). The cursor is `pointer`. |
| focused (keyboard) | `box-shadow: var(--focus-ring-offset)` (2px blueprint outline, 1px tar gap). |
| selected (e.g., active in inventory list) | left edge gets a 2px solid `blueprint` strip; `bg-stratum-raised`. |
| pressed | `transform: translateY(1px)`; the orphaned `decay-drift` animation pauses. |
| loading | the card renders a skeleton: same dimensions, internal text replaced by mono `█` blocks in `hairline-strong` with `opacity` cycling 0.5 → 0.8 over 1.2s. No spinner. |

### responsive variants

| breakpoint | layout |
|---|---|
| ≥1200px | full three-row layout above |
| 900-1199 | footer collapses: `service` and `team` on one row, `t₀ + classification badge` on a second row (the badge moves to right of the t₀ line) |
| <900px | header + body + classification badge only; service/team/t₀ collapse into a single 10px micro line wrapping with `·` separators |

---

## 5. posture-score arc meter

A circular arc that goes from 0° to 270° (three-quarters circle, opening at the bottom). Used in the drawer header.

### dimensions

- Outer diameter: **88px** in the drawer; **56px** as inline variant in the top-risk list (smaller variant uses no number, just the arc and tier color).
- Stroke width: 4px.
- Empty track: `hairline-strong` (4px solid).
- Filled arc: the tier color (`tier-critical`/`tier-high`/`tier-medium`/`tier-low`), 4px solid.
- Arc rotation: starts at 225° (bottom-left), sweeps clockwise through top to 315° (bottom-right). 270° total sweep = `score/100` of the arc filled.
- Center: the score number, mono 28/1/700 in the tier color, tabular-nums. Below it, `/ 100` in mono 10/1/400 `sediment`.
- A 1px tick at every 25% of the arc, painted in `sediment` (visible above the empty track, hidden beneath the fill).

```
        ╭───────╮          (the tick marks visualize quartiles)
       ╱    92   ╲
      ╱   / 100   ╲
     ╲              ╱
      ╲            ╱
       ╲          ╱
        ╲────────╯
```

### states
- Default: filled arc in tier color.
- Loading: filled arc renders at 50% in `hairline-strong`, with a 1.6s `mechanical` rotation. Number shows `··` (two dim dots).
- Updating (during a scan): the arc fills from previous value to new value over 800ms with `ease-instrument`. The number ticks up in lockstep.

### implementation

SVG, two `<circle>` elements (track + fill) with `stroke-dasharray` and `stroke-dashoffset` driving the fill. No external dependency. Total component ~60 lines.

---

## 6. factor bar

A horizontal 0-10 bar used inside the drawer's posture block. Five of these stack vertically (data sensitivity, auth strength, staleness, blast radius, CVE/OWASP).

```
data sensitivity                                weight 0.25
█████████████████████████░░░░░░░░░░░░░░░         8.2 / 10
PAN, account, transaction · 4 PII classes touched
```

### dimensions

- Wrapper: full width of the posture block (~440px in the 520px drawer).
- Label row: 14px mono medium `bone`, 11px mono `bone-dim` weight, right-aligned.
- Bar row: 8px tall.
  - Track: 8px height, `stratum-raised` fill, `hairline` 1px top/bottom borders only (left and right open — extends edge-to-edge).
  - Fill: solid color by score band — 0-3 in `active` (it's healthy), 4-6 in `tier-medium`, 7-8 in `tier-high`, 9-10 in `critical`. Width: `(score/10) * 100%`.
  - Tick marks: short 1px sediment ticks at each integer (0,1,2…10) drawn over the track, above the fill.
- Value readout (right): 12px mono medium tabular-nums. `8.2 / 10` — value in `bone`, `/ 10` in `sediment`.
- Detail line: 11px mono 400 `bone-dim`, italic optional, max 80 chars, ellipsis on overflow.

### vertical spacing between factor bars

- 16px top padding from previous detail line.

---

## 7. metric card (population readout)

The four cards in the Command Center top row. Replaces the generic "metric card with a big number".

```
┌─────────────────────────────────────────┐
│  population · orphaned                  │
│                                          │
│  n =  34                                 │
│       ▲ +34   from registry baseline    │
│                                          │
│  ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░  12.1%  │
│  share of total discovered               │
└─────────────────────────────────────────┘
```

- Container: `bg-stratum`, 1px `hairline` border, padding 16px. Width fluid (4 cards in a row at ≥1200px, gap 16px).
- Header: 11px mono 500 letter-spacing 0.04em, `bone-dim`. Format: `population · {classification}`. The `·` is in `sediment`.
- Hero number row:
  - `n =` in 14px mono 500 `sediment`.
  - The number itself in **mono 36px / 1 / 700**, `bone` (or the matching classification color when classification ≠ `active`). Tabular-nums.
  - Below the number, a delta line: `▲ +34` (or `▼ −12`) in 11px mono 500 in the matching classification color, followed by `from registry baseline` in 11px mono 400 `sediment-strong`. The triangle char is part of the text, not an icon.
- Share-of-total bar: 4px tall, full width, `stratum-raised` track, fill in the classification color. Right-aligned value: 11px mono 500 tabular-nums `bone`. Caption below: 10px mono 400 `sediment-strong`.

### decay encoding

The orphaned and critical cards get progressively decayed borders:

| card | border |
|---|---|
| `population · active` | 1px solid `hairline` |
| `population · deprecated` | 1px solid `hairline` (cards themselves are not decayed, only the icon/color signals) |
| `population · orphaned` | 1px dashed `decay-orphaned` short-pattern (via SVG border) |
| `population · critical` | 1px solid `decay-critical` + `.overlay-scanline` + `transform: rotate(-0.6deg)` (the critical card visibly tilts) |

The orphaned and critical cards are the only metric cards that decay. This is the dashboard's single most distinctive moment: the rightmost card looks structurally wrong compared to its siblings.

### loading state

- Header line renders normally.
- Hero number area: a single `█████` block, 36px tall, `hairline-strong` fill, opacity cycling 0.5 → 0.8 over 1.2s.
- Delta line and bar: hidden.

### counter-climb animation

When `liveStats` updates during a scan, the number tweens from previous to new value over 800ms with `ease-instrument`. Implemented via framer-motion's `<motion.span>` and a `MotionValue` that interpolates and renders rounded to integers. The triangle and delta amount snap to the final value at the end (they do not tween).

---

## 8. scan-feed line

Each row in the live scan feed.

```
├╴ 14:32:07.412   parse        zh-0142   recovered /legacy/upi/collect-v1  · last seen 2018-03-14
└╴ 14:32:07.880   classify     zh-0142   orphaned (no traffic 24mo, no commits 18mo)
╳╴ 14:32:08.103   score        zh-0142   ◆ critical · score = 92 · CVE-2019-12384 match · OWASP API1
```

- Single line, height 22px (or wraps to 2 lines at 880px+).
- Font: mono 12 / 1.4 / 400. Tabular nums.
- Color by severity:
  - `info` → text in `bone-dim`, prefix `├╴` in `sediment`.
  - `warning` → text in `deprecated`, prefix `├╴` in `deprecated` at 0.7 opacity.
  - `critical` → text in `critical`, prefix `╳╴` in `critical`.
- The most recent line uses `└╴` instead of `├╴` (the tree closes at the bottom).
- Fields, in order, separated by 2-space gaps: timestamp (ISO time only), phase (8-char left-padded), specimen-id, message.
- Entry animation: opacity 0 → 1 over 120ms `instrument`, plus `translateY(-2px) → 0`. No fade-up beyond 2px.

### header bar (above the feed)

```
┌─ depth scan / 2026-05-17T14:32:00Z ──────────────────────  status = running  ·  progress = 62.0%
```

- Box-drawing chars in `sediment`, 12px mono 400.
- The label `depth scan` and ISO timestamp in `bone-dim` 12px mono 500.
- Right-aligned status readout: `status = {phase}` in mono 12/1/500, value in `bone`. Then `· progress = 62.0%` likewise.

---

## 9. depth meter (the discovery counter strip)

The full-width strip that runs across the top of the Command Center, 132px tall total.

```
═══════════════════════════════════════════════════════════════════════════════════════════════
  discovery depth scan                              n =  281      registry baseline = 247
                                                    Δ = +34 unknown endpoints recovered
───────────────────────────────────────────────────────────────────────────────────────────────
  2026 ─── 2024 ─────────│  stratum 1                              recovered : 198
                          │  2024–2026  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ complete
  2023 ─── 2018 ─────────│  stratum 2
                          │  2018–2023  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░ depth = 2019
  2017 ─── 2011 ─────────│  stratum 3                                      ◀── sweep ──▶
                          │  2011–2017  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ queued
  2010 ─── pre ──────────│  stratum 4
                          │  pre-2010   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ queued
═══════════════════════════════════════════════════════════════════════════════════════════════
```

### structure

- Outer container: full width, `bg-stratum`, 1px `hairline` borders top + bottom (`──` style). No left/right borders. Total height 132px.
- Top row (~52px): the counter readouts.
  - Left: section title `discovery depth scan` in 14px mono 600 `bone`.
  - Center / right: two readouts spaced 32px apart.
    - `n = 281` — 72px mono 700 tabular-nums in `bone`. The `n =` is 14px mono 500 `sediment`, vertically centered to the value's baseline.
    - `registry baseline = 247` — 12px mono 500 `bone-dim`, vertically centered, tabular-nums.
  - Below them, the delta line: `Δ = +34 unknown endpoints recovered` in 12px mono 500. The `Δ =` in `sediment`. The number+caption in `critical` once a scan is complete (pre-scan it reads `Δ = 0`).
- Horizontal divider: 1px `hairline`.
- Bottom row (~80px): the four-stratum depth display.
  - Left column (~140px): year labels in two pairs (`2026 ─── 2024`, `2023 ─── 2018`, `2017 ─── 2011`, `2010 ─── pre`). Mono 10/1/400 `sediment-strong`.
  - Right column (flex 1): each stratum row contains a label, a 4px-tall bar, and a status readout.
    - Stratum label: 11px mono 500 `bone-dim`. Format: `stratum N` then a `·`-separated label `2024–2026`.
    - Bar: 4px tall, full width minus 240px, `stratum-raised` track, fill in `blueprint`. Filled width = (depth-progress within this stratum). Completed strata are 100% filled in `blueprint-deep`.
    - Status readout (right, 120px wide): `complete` / `depth = 2019` / `queued` in 11px mono 500. Completed → `bone-dim`. Active → `blueprint`. Queued → `sediment-strong`.
    - During active scan: the active stratum's bar shows the `depth-sweep` animation — a 32px-wide gradient sweeps left-to-right at 1.6s linear infinite. CSS: `::after { background: linear-gradient(90deg, transparent, var(--blueprint), transparent); animation: depth-sweep 1.6s linear infinite; }`.

### states

| state | values |
|---|---|
| pre-scan | `n =` shows the registry baseline (`= 247`). `Δ = 0`. All strata bars empty, all status readouts `queued`. The right side of the top row shows a `run discovery scan` button instead of the delta line. |
| scanning | counter tweens from baseline up to current discovery count; active stratum shows the sweep; delta line appears once first orphaned is found. |
| complete | counter settles at final discovery count; all stratum bars filled; status readouts all `complete` except orphaned-rich strata which read `complete · {n} zombies`. |
| disconnected | counter shows last-known value with a strikethrough `Δ = ?`; the active stratum shows a static caution mark `▲ connection severed at {ts}`; status readouts freeze. |

---

## 10. graph node (stratigraphic)

Used on the API Landscape page. See `landscape-graph.md` for the full layout system; this section specifies the node atom only.

### shapes by node type

The graph's nine node types (per `models.ts`) are differentiated by shape, never by color alone.

| type | shape | size hint |
|---|---|---|
| `endpoint` | circle | 4-16px by traffic volume |
| `service` | square | fixed 14px |
| `database` | wide rectangle (16×8) | |
| `gateway` | diamond | fixed 12px |
| `team` | upward triangle | fixed 12px |
| `deployment` | downward triangle | fixed 10px |
| `consumer` | half-circle (open right) | fixed 10px |
| `auth_system` | hexagon | fixed 12px |
| `risk_finding` | small X cross | fixed 10px |

### endpoint node (the most common)

- Fill: the classification color at 65% opacity.
- Stroke: the classification color at 100%, 1px.
- For `orphaned`: dashed stroke, `2 2` pattern. For `critical`: solid stroke + a small `╳` mark in `critical` color at the node center.
- Size: `Math.sqrt(calls_30d) * scale + 4` clamped to [4, 16]. A traffic-less zombie is visibly small.
- Hover: a 24×16 specimen-id tag appears below the node — `zh-NNNN` in 10px mono `bone-dim` on a `stratum` background with 1px `hairline` border.
- Selected: 2px `blueprint` stroke ring 4px outside the node.

### edge styles

| edge type | style |
|---|---|
| `calls` | 1px solid `bone-dim` at 0.25 opacity |
| `routes_to` | 1px solid `blueprint` at 0.4 opacity |
| `queries` | 1px solid `active` at 0.35 opacity |
| `owned_by` | 1px dashed `sediment` at 0.5 opacity |
| `depends_on` | 1px solid `deprecated` at 0.35 opacity |
| `exposes` | 1px solid `orphaned` at 0.5 opacity |

Edge that crosses ≥2 strata: thickness bumps to 1.5px, opacity to 0.5. This emphasizes "cross-decade dependencies" which are the high-signal relationships.

### blast-radius fault edge

When in blast-radius mode, the path edges are painted as **fault lines**: 2px solid `critical`, with a `fault-pulse` animation propagating outward (see `motion.md`). All non-path edges drop to 0.05 opacity. All non-path nodes drop to 0.15 opacity.

---

## 11. button atoms

Two variants. Both lowercase mono.

### primary (the run-discovery-scan button)

```
┌─────────────────────────────┐
│  run discovery scan         │
└─────────────────────────────┘
```

- Height: 36px. Padding: 0 16px.
- Border: 1px solid `blueprint`. No fill (background: `tar`).
- Text: 13px mono 500 lowercase, color `blueprint`.
- Radius: 2px.
- Hover: background fills with `blueprint-wash`. Border brightens to `blueprint` at full saturation (no change in spec — already at 100%). Cursor pointer.
- Focused: `box-shadow: var(--focus-ring-offset)`.
- Pressed: `transform: translateY(1px)`.
- Loading (during a scan in flight): label becomes `scanning · 62.0%` with `cursor: progress`; background fills with `blueprint-wash`; the label gets a subtle `animation: caret-blink` on a trailing `▮` after the percentage.
- Disabled: opacity 0.4, cursor `not-allowed`.

### secondary

- Same dimensions.
- Border: 1px solid `hairline-strong`.
- Text: 13px mono 500 `bone-dim`.
- Hover: border `bone-dim`, text `bone`.

---

## 12. input field

Used for search and filter inputs.

```
┌──────────────────────────────────────────────┐
│  path · /v1/upi/                              │
└──────────────────────────────────────────────┘
```

- Height: 32px. Padding: 0 12px.
- Background: `stratum`. Border: 1px `hairline`. Radius: 2px.
- Font: 13px mono 400 `bone`.
- Placeholder: in `sediment-strong`, with a leading symbol indicating the input type (`path ·` for endpoint-path search, `id ·` for specimen-id search). The leading symbol stays visible at all times (in `sediment`), the user types after it.
- Focused: border `blueprint`, `box-shadow: 0 0 0 2px var(--blueprint-wash)`.
- Invalid: border `critical`, with a 10px mono `critical` error line below.

---

## 13. filter chip

Used in the inventory filter bar.

```
[ all ]  [ active n=204 ]  [ deprecated n=43 ]  [ orphaned n=34 ]
```

- Same shape as a classification badge but slightly taller (22px) and showing a count.
- Default: `stratum` bg, `hairline` border, `bone-dim` text.
- Selected: bg in the matching wash, border in the matching color, text in the matching color. A 1px solid bottom edge (3px tall, full width) in the matching color anchors it visually.
- Counts in mono `n=NN` to keep the readout pattern.

---

## 14. drawer header

The top of the right-side specimen drawer. See `endpoint-detail.md` for full drawer spec.

```
┌──────────────────────────────────────────────────────────────┐
│  zh-0142   ● orphaned   ◆ critical                            │
│                                                                │
│  GET   /legacy/upi/collect-v1                          [⤢] [×] │
│                                                                │
│  service · upi-gateway       team · payments-platform-legacy  │
└──────────────────────────────────────────────────────────────┘
```

- Container: `bg-stratum-raised` (one stop brighter than the canvas), 24px padding.
- Bottom border: 1px `hairline`.
- Decay: header inherits the specimen-card decay rules (#4). For an `orphaned` endpoint the header itself uses a 1px dashed `decay-orphaned` left edge (not full border — only the left edge, 3px wide). For `critical`, the left edge is solid `decay-critical` 3px wide and the entire header gets `.overlay-scanline`. The header is the only place where the entire panel decays — for the rest of the drawer, only the posture-score arc adopts the tier color.

---

## 15. graph legend

A compact, always-visible legend on the API Landscape page. Bottom-right of the canvas, `bg-stratum` panel, 1px `hairline` border, 12px padding, max-width 280px.

```
┌─ legend ─────────────────────────────────────
│
│  node shape        node type
│  ●                 endpoint
│  ■                 service
│  ◆                 gateway / auth_system
│  ▲ ▼               team / deployment
│  ⫸                 consumer
│  ▭                 database
│  ╳                 risk_finding
│
│  node fill         classification
│  ●  active         clinical cyan
│  ●  deprecated     sepia (dashed stroke)
│  ●  orphaned       bone-yellow (broken stroke)
│  ●  critical       bruise-red + scanline
│
│  edge              relationship
│  ──── 0.25         calls
│  ──── 0.4          routes_to
│  ┄┄┄┄ 0.5          owned_by
│
└──────────────────────────────────────────────
```

- The legend uses real Unicode shapes — never images. This keeps it crisp at any zoom.
- Font: 11px mono 400 `bone-dim`. Section sub-headers in 11px mono 500 `bone`.

---

## 16. connection indicator (top bar)

The WebSocket status indicator on the right of the top bar.

```
●  ws://localhost:8000/ws  ·  connected  ·  last event 0.4s ago
```

- 5px filled circle in `active` (connected), `deprecated` (reconnecting), or `critical` (disconnected).
- Text: 11px mono 400 `bone-dim`, with the URL in `sediment-strong`, the status in the matching state color.
- On disconnect: the circle pulses (1.2s ease-in-out infinite); the text reads `connection severed at 14:32:07 · retry ×2`.

---

That covers every atom referenced elsewhere. Each subsequent screen-spec doc uses these atoms by name.
