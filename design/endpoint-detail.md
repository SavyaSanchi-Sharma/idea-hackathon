# endpoint-detail — drawer redline

A right-side **specimen file** that opens over any screen. This is the explainability centerpiece — the place where the AI exposes its reasoning. The drawer is wider than the brief's original spec (**520px**, not 480) because the specimen layout needs room for the field-notes typewriter.

The drawer is composed of five sections, top to bottom:

1. **Header** — specimen-id, classification, tier, method+path, service/team.
2. **Posture block** — circular score arc + five-factor breakdown (the auditable explanation).
3. **Classification reasoning** — the literal signals that produced the classification.
4. **Field notes** — the streaming threat narrative, in Plex Sans, with box-drawing frame and blinking caret.
5. **Signals grid + recommended action** — compact key/value facts and the CTA.

---

## full ASCII layout (an orphaned/critical specimen)

```
┌─────────────────────────────────────────────────────────┐
│ zh-0142   ● orphaned   ◆ critical                 [⤢][×]│  ← drawer header
│                                                           │
│ GET   /legacy/upi/collect-v1                              │
│                                                           │
│ service · upi-gateway     team · payments-platform-legacy │
├─────────────────────────────────────────────────────────┤
│                                                           │  ← posture block
│   ╭───────╮       posture score                           │
│  ╱   92    ╲      tier  ◆ critical                        │
│ ╱   / 100   ╲     last evaluated  14:32:08.103Z           │
│ ╲           ╱                                              │
│  ╲         ╱      ─────────────────────────────────       │
│   ╰───────╯       data sensitivity            weight 0.25 │
│                   █████████████████████░░░     9.0 / 10   │
│                   PAN, Aadhaar, account, transaction      │
│                                                           │
│                   auth strength               weight 0.25 │
│                   █████░░░░░░░░░░░░░░░░░       2.1 / 10   │
│                   basic auth · no rate limit · no MFA     │
│                                                           │
│                   staleness                   weight 0.20 │
│                   ██████████████████████░     9.6 / 10    │
│                   no commits 24mo · last author left 2019 │
│                                                           │
│                   blast radius                weight 0.15 │
│                   ████████████████████░░░     8.3 / 10    │
│                   reaches core banking, NPCI rails        │
│                                                           │
│                   cve / owasp match           weight 0.15 │
│                   █████████████░░░░░░░░░░     6.5 / 10    │
│                   CVE-2019-12384 · OWASP API1:2023        │
├─────────────────────────────────────────────────────────┤
│ classification reasoning                                  │  ← classification reasoning
│                                                           │
│  ├╴ no owner of record                                    │
│  ├╴ 0 commits in 18 months                                │
│  ├╴ traffic −94.0% vs prior 90-day window                 │
│  ├╴ author last_seen = 2019-04-12 (left org)              │
│  ├╴ documentation: not present in registry (shadow)       │
│  └╴ classification = orphaned · confidence 0.94           │
├─────────────────────────────────────────────────────────┤
│ ┌─ field notes / zh-0142 ─────────────────────────────── │  ← threat narrative
│ │                                                          │
│ │  This endpoint accepts a UPI collect request without    │  (streams char-by-char,
│ │  authentication and returns counterparty PAN, Aadhaar   │   font: Plex Sans 14)
│ │  hash, and account balance in the response payload.     │
│ │                                                          │
│ │  Last received traffic in March 2018, three months      │
│ │  before its original author's last commit. The endpoint │
│ │  has not been deployed since v3.2.1 (Oct 2018) and is   │
│ │  not present in the bank's official OpenAPI registry.   │
│ │                                                          │
│ │  Pattern matches CVE-2019-12384 (UPI handler — improper │
│ │  auth) and OWASP API1:2023 (BOLA). A scan from an       │
│ │  attacker IP could enumerate ~3.4M records before any   │
│ │  rate-limit applies.                                    │
│ │                                                          │
│ │  Recommended: full block, generate playbook, file RBI   │
│ │  IT-Gov incident IR-2025-XXXX. ▮                        │
│ │                                                          │
│ └─────────────────────────────────────────────────────── │
├─────────────────────────────────────────────────────────┤
│ signals                                                   │  ← signals grid
│                                                           │
│  auth type           basic         rate limited     no    │
│  mfa                 no            data classes     PAN,  │
│  last commit         2019-04-12                  Aadhaar, │
│  last deploy         2018-10-22                  account  │
│  calls (30d)         n =   2  ± 1   trend  Δ = −94.0%    │
│  cve matches         CVE-2019-12384 (CVSS 9.1)            │
│  owasp tags          API1:2023, API2:2023                 │
│                                                           │
│  traffic (90d)       ▁▁▂▂▁▁▁_______________________       │
│                      jul        oct        jan       apr  │
├─────────────────────────────────────────────────────────┤
│ recommended action                                        │  ← recommended action
│                                                           │
│   ◆ critical  →  block                                    │
│                                                           │
│   ┌────────────────┐  ┌──────────────────────────┐        │
│   │  block now     │  │  show blast radius   ▣  │        │
│   └────────────────┘  └──────────────────────────┘        │
│                                                           │
│   secondary actions: quarantine · generate playbook       │
└─────────────────────────────────────────────────────────┘
```

---

## dimensions & structure

- **Width**: 520px. Fixed.
- **Height**: 100vh (minus top bar). The drawer scrolls internally.
- **Background**: `stratum`. Sits on top of a `bg-tar @ 0.7 opacity` backdrop scrim.
- **Left border**: 1px `hairline-strong` (visible as the seam against the canvas).
- **Top alignment**: 0 (covers the top bar — it does NOT push the top bar; it overlays, including the search and run-scan button. The drawer's `[⤢] [×]` controls replace those affordances.)
- **z-index**: `--z-drawer` (40).

### slide-in

- Slides from right: `transform: translateX(100%) → 0` over 260ms with `ease-instrument`.
- Backdrop scrim fades in: `opacity 0 → 1` over the same duration.
- Slide-out reverses with the same timing.

### header (top section, ~140px tall)

- Padding: 24px.
- Bottom border: 1px `hairline` (separates from posture block).
- **Decay encoding**: a 3px-wide left edge inside the header matches the classification color:
  - `active` → 3px solid `active`
  - `deprecated` → 3px dashed `deprecated`
  - `orphaned` → 3px dashed `orphaned` short-stipple
  - `critical` orphaned → 3px solid `critical` + `.overlay-scanline` over the entire header
- **Top-left line**: specimen-id (`.specimen-id` class — 11px mono `sediment-strong` lowercase), 12px gap, classification badge (with leading dot), 8px gap, risk-tier badge (with leading diamond).
- **Top-right corner**: two icon buttons inline, 32×32 each: `[⤢]` (expand → opens the inventory view with this endpoint focused) and `[×]` (close drawer). Mono 14px, `bone-dim` default, `bone` on hover. Both have focus rings.
- **Body line** (24px gap below the top line): method pill (10px mono UPPERCASE in method-color wash), 12px gap, endpoint path in 19px mono 600 `bone`. The path is allowed to wrap to a second line on long paths (e.g., `/legacy/kyc/aadhaar-verify-v2-with-doc-upload`).
- **Footer line** (12px gap below the body): instrument readouts in 11px mono 400 `bone-dim`: `service · {service}     team · {team or "?"}`. The `·` glyphs are in `sediment`.

### posture block (~360px tall)

- Padding: 24px. Bottom border: 1px `hairline`.
- **Left**: the posture-score arc (88px diameter, see `components.md` §5). Below the arc, a small caption: `posture score` in 11px mono 500 `bone-dim`, then `tier  ◆ critical` in 11px mono 500 with the tier color and diamond glyph, then `last evaluated  14:32:08.103Z` in 10px mono 400 `sediment-strong`.
- **Right**: the five factor bars (see `components.md` §6), separated by 16px vertical gaps. Order, top to bottom, matches the data model: data sensitivity → auth strength → staleness → blast radius → cve/owasp match.
- A thin 1px `hairline` divider sits between the arc-and-caption column and the factor-bar column.

### classification reasoning block (~140px tall, fluid)

- Padding: 24px.
- Section title: `classification reasoning` in 14px mono 600 `bone`.
- Each reason renders as a tree-line — `├╴` prefix (or `└╴` on the last line, `╳╴` if the reason is the one that tipped to orphaned/critical), in 11px mono 500 `sediment` for the prefix, then the reason text in 12px mono 400 `bone-dim`. Numbers inside the reason use the readout pattern (`n = ?`, `Δ = ?`, `t₀ = ?`).
- The last reason line is **always** `classification = {value} · confidence {confidence}` where confidence is the 2-decimal float. This is the explainability closure.
- 1px `hairline` bottom border to the field-notes block.

### field-notes block (~280px tall, fluid)

This is the signature wow-moment.

- Padding: 24px on the outer container; inside, the box-drawing frame creates an inset of 16px from the frame chars.
- **Frame top line**: `┌─ field notes / zh-NNNN ──────────────────────────────────` in 12px mono 500. The `┌─` and trailing `──` in `sediment`. The text `field notes / zh-NNNN` in `bone-dim`.
- **Frame side**: a left-side column of `│` chars in 12px mono `sediment`, repeated per line of the narrative. Implemented as a CSS `border-left: 1px solid var(--sediment)` plus 16px padding-left — cheaper than rendering chars.
- **Narrative body**: **IBM Plex Sans 14/1.65/400** in `bone`. Streams character-by-character at 22ms cadence (±6ms random jitter applied per character for organic teletype feel). Italic Plex Sans 400 italic is used for short emphasis inside (the streaming respects nested `<em>` tags in the source).
- **Trailing caret**: `▮` block char, 14px mono 400 `blueprint`, animated `animation: caret-blink 1.1s steps(1, end) infinite`. The caret hides once the entire narrative has finished streaming.
- **Frame bottom line**: `└──────────────────────────────────────────────────────────` in 12px mono `sediment`. Appears after the caret finishes (or immediately, if the narrative is short).
- **The frame's right-side chars are NOT rendered.** Box-drawing on the right is fragile when the content wraps at varying widths. The frame is open on the right; it functions as a left bracket only. This is intentional and matches a real laboratory field-notes book.

#### narrative content rules

- ~120-220 words. The backend's SLM produces this.
- First paragraph: what the endpoint does and what data it touches.
- Second paragraph: why it's classified as it is — staleness signals, deployment history, registry status.
- Third paragraph: threat scenario — CVE pattern, OWASP category, attack vector, scale of exposure.
- Final paragraph: recommended action and any regulatory framing (RBI IT-Gov, PCI-DSS section, etc.).

#### no-narrative fallback

For endpoints whose `threat_narrative` is empty/null (e.g., `active` endpoints without ai analysis):

```
┌─ field notes / zh-0904 ──────────────────────────────────
│
│  no narrative available. specimen is active and below the
│  ai-reasoning threshold (score < 40).
│
└──────────────────────────────────────────────────────────
```

No streaming, no caret. The text in 13px mono 400 `bone-dim` italic.

### signals grid (~200px tall, fluid)

- Padding: 24px.
- Section title: `signals` in 14px mono 600 `bone`.
- Two-column key/value grid. Keys are 11px mono 500 `bone-dim`, values are 12px mono 400 `bone` with readouts where numeric (`n = 2 ± 1`).
- Specific rows, in this order:
  1. `auth type` | `rate limited`
  2. `mfa` | `data classes`
  3. `last commit` | (continuation if data_classes wraps)
  4. `last deploy` | (continuation)
  5. `calls (30d)` | `trend`
  6. `cve matches` (spans both columns if more than one)
  7. `owasp tags` (spans both columns)
- After the grid, a `traffic (90d)` row with a sparkline (recharts `LineChart`, 320×40, stroke `blueprint`, no axes, no tooltip, no fill — just the line). Below the sparkline, four month tick labels in 10px mono 400 `sediment-strong`.
- For orphaned/zombie endpoints, the sparkline is mostly flat with a long tail of zeros — visually obvious as a "flatlined" specimen.

### recommended action (~140px tall)

- Padding: 24px.
- Section title: `recommended action` in 14px mono 600 `bone`.
- A single-line readout: `◆ {tier}  →  {action}` in 14px mono 500. The diamond and tier in tier color; the `→` in `sediment`; the action in `bone`.
- Below it, two buttons in a row with 12px gap: the primary action (`block now` / `quarantine` / `monitor` / `playbook`) and the secondary `show blast radius ▣`.
- Below the buttons, a 10px mono 400 `sediment-strong` line: `secondary actions: quarantine · generate playbook · file RBI incident report`. These are clickable text links.

#### action button mapping

| `recommended_action` | primary button label |
|---|---|
| `block` | `block now` |
| `quarantine` | `quarantine specimen` |
| `monitor` | `place in monitor` |
| `playbook` | `generate playbook` |

All in lowercase mono 13/1/500. Default border color: the tier color (`critical` → `critical` border; `high` → `deprecated` border; `medium`/`low` → `blueprint` border). Background: `tar`. Hover: fills with tier-wash.

---

## responsive

- The drawer is fixed at 520px above 900px viewport width.
- At 600-899px, the drawer takes 90vw with the slide-in unchanged.
- Below 600px, the drawer becomes a full-screen modal (100vw, 100vh).

---

## states

| state | rendering |
|---|---|
| loading | `useEndpointDetail.isLoading === true`. Header renders the specimen-id and badges (already in `liveStore`/list cache). Posture arc renders the loading variant (50% gray fill, mechanical rotation, `··` in center). Factor bars render as skeleton mono blocks. Classification reasoning shows `├╴ ····` × 4. Field-notes block shows the frame with `└╴ retrieving field notes…` inside. Signals grid is empty. Recommended action shows `pending`. |
| loaded | full layout. |
| narrative-streaming | content is in DOM but `<ThreatNarrative>` is progressively appending chars. The trailing caret blinks. All other sections render fully. |
| stale (drawer opened from cached endpoint, fresh data still in flight) | content renders from cache; a single 10px mono 400 `deprecated` line at the top of the field-notes block reads `▲ cached at 14:31:00Z · refreshing in 0.8s`. Once fresh data arrives, the line disappears via 200ms crossfade. |
| disconnected | the connection indicator pulses in the top bar (handled by shell, not the drawer). The drawer continues showing last-fetched data. |

---

## interactions

| interaction | result |
|---|---|
| Click outside drawer (on the scrim) | drawer closes |
| Press `Esc` | drawer closes |
| Click `[×]` | drawer closes |
| Click `[⤢]` | navigates to `/inventory?endpoint={id}` and closes the drawer |
| Click `show blast radius ▣` | sets `uiStore.graphMode = "blast_radius"`, `blastRadiusOriginId = id`, navigates to `/landscape`. Drawer stays open during the navigation transition (fades out after 200ms). |
| Click on a CVE id in signals | opens a tooltip with full CVE summary (from `cve_matches[i].summary`) |
| Click on an OWASP tag | opens a tooltip linking to the OWASP page |
| Focus management | when drawer opens, focus moves to `[×]` button; trap focus inside drawer; restore previous focus on close |

---

## accessibility

- Drawer has `role="dialog"`, `aria-modal="true"`, `aria-labelledby="drawer-title"` where the title is `${method} ${path}`.
- `aria-live="polite"` on the field-notes paragraph announces the narrative once streaming completes (not while streaming — that would announce every character).
- Posture score has an `aria-label` of `posture score 92 out of 100, tier critical`.
- Each factor bar has an `aria-label` of `data sensitivity, score 9.0 out of 10, weight 25 percent, PAN Aadhaar account transaction`.
- The streaming narrative has `aria-busy="true"` while streaming, switching to `false` when complete.
- Color is never the only signal: the leading dots (`●`) and diamonds (`◆`), the dashed borders, and explicit text labels (`orphaned`, `critical`) carry the same information.

---

## acceptance criteria

- [ ] Drawer slides in from right at 520px width, 260ms duration, no bounce.
- [ ] Header decay treatment matches classification (3px left edge for active/deprecated/orphaned; scanline overlay on critical).
- [ ] Posture arc renders correctly at 88px with three-quarter sweep, tier color fill, tabular score in center.
- [ ] All five factor bars render with weight, value, fill in band-appropriate color (active band for 0-3, medium for 4-6, high for 7-8, critical for 9-10).
- [ ] Classification reasoning is rendered as a tree (`├╴`/`└╴`/`╳╴`) with the final line being `classification = {value} · confidence {conf}`.
- [ ] Field-notes frame uses the `┌─ field notes / zh-NNNN ──`-style header in mono, the body in Plex Sans 14, streaming at 22ms per char ±6ms jitter, with the blinking caret that disappears on complete.
- [ ] Signals grid renders auth type, mfa, last commit, last deploy, calls (30d) with `n = N ± M` pattern, trend with `Δ = `, CVE matches, OWASP tags, 90-day sparkline.
- [ ] Recommended action shows `◆ {tier} → {action}` and renders the primary CTA + the "show blast radius" CTA.
- [ ] Esc / outside-click / `[×]` all close the drawer; focus returns to the triggering element.
- [ ] The narrative paragraph is the ONLY use of `font-sans` in the drawer.
