# command-center — redline spec (MVP, built first)

The single screen that proves all four judging criteria: live discovery, classification, explainable scoring, coherent dashboard. This is the screen the judge sees first and that they will remember the product by. **It is built first, and this is the most thorough redline in the design system.**

The Command Center is composed of three full-bleed strata, top-to-bottom:

1. **Strip α — the depth meter** (132px) — the discovery counter and stratigraphic depth scan.
2. **Strip β — the population readout** (~140px) — four metric cards in a row.
3. **Strip γ — the working surface** (fills remaining height) — left: top-risk specimens; right: the scan feed.

There is **no margin between strips**. They share borders. This is the brutalist composition rule — the instrument is one continuous readout, not a deck of slides.

---

## full ASCII layout (1440px breakpoint, post-scan-complete state)

```
┌──────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│      │  command center                                              [path · /v1/upi/_____________________]      [● connected] │
│      │                                                                                            [ run discovery scan ]      │
│  ZH  ├═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════┤
│      │                                                                                                                        │
│  ▼   │   discovery depth scan                              n =  281      registry baseline = 247                              │
│  ◇   │                                                     Δ = +34 unknown endpoints recovered  ·  last scan 14:32:18Z        │
│  ▣   │   ─────────────────────────────────────────────────────────────────────────────────────────────────────────────       │
│  ▷   │   2026 ─── 2024 ─│ stratum 1   2024–2026  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  complete                  │
│  …   │   2023 ─── 2018 ─│ stratum 2   2018–2023  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  complete · 19 zombies     │
│      │   2017 ─── 2011 ─│ stratum 3   2011–2017  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  complete · 12 zombies     │
│      │   2010 ─── pre  ─│ stratum 4   pre-2010   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  complete ·  3 zombies     │
│      │                                                                                                                        │
│      ├═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════┤
│      │                                                                                                                        │
│      │  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐  ┏━━━━━━━━━━━━━━━━━━━━━━┓                │
│      │  │ population · active  │  │ population · depr…   │  │ population ╴ orpha…  │  ┃ population · critical┃ ⟵ −0.6° tilt   │
│      │  │                      │  │                      │  │                      │  ┃                       ┃                │
│      │  │ n =  204             │  │ n =   43             │  │ n =   34             │  ┃ n =   12              ┃                │
│      │  │     no change        │  │  ▲  +11   vs reg…    │  │  ▲  +34   vs reg…    │  ┃  ▲  +12   vs reg…     ┃                │
│      │  │                      │  │                      │  │                      │  ┃                       ┃                │
│      │  │ ▓▓▓▓▓▓▓▓▓▓░░░░ 72.6% │  │ ▓▓░░░░░░░░░░░░ 15.3% │  │ ▓▓░░░░░░░░░░░░ 12.1% │  ┃ ▓░░░░░░░░░░░░░  4.3%  ┃                │
│      │  │ share of total       │  │ share of total       │  │ share of total       │  ┃ share of total        ┃                │
│      │  └──────────────────────┘  └──────────────────────┘  └╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴┘  ┗━━━━━━━━━━━━━━━━━━━━━━━┛                │
│      │                                                       (broken-stipple)            (scanline + tilt + solid bruise)     │
│      ├═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════┤
│      │  ┌───────────────────────────────────────────────────────────────┐ │ ┌────────────────────────────────────────────────┐│
│      │  │ top-risk specimens                            n =  6 of 281   │ │ │ ┌─ depth scan / 2026-05-17T14:32:00Z ─────────  ││
│      │  ├───────────────────────────────────────────────────────────────┤ │ │   status = complete   ·  progress = 100.0%     ││
│      │  │ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │ │ │ ├╴ 14:32:07.412   parse        zh-0142   reco… ││
│      │  │ ┃ zh-0142                              posture = 92 / 100   ┃ │ │ │ ├╴ 14:32:07.880   classify     zh-0142   orph… ││
│      │  │ ┃                                                            ┃ │ │ │ ╳╴ 14:32:08.103   score        zh-0142   ◆ cr… ││
│      │  │ ┃    GET   /legacy/upi/collect-v1                            ┃ │ │ │ ├╴ 14:32:08.331   reason       zh-0142   nar… ││
│      │  │ ┃                                                            ┃ │ │ │ ├╴ 14:32:09.012   parse        zh-0817   reco… ││
│      │  │ ┃    service · upi-gateway     team · payments-legacy        ┃ │ │ │ ├╴ 14:32:09.244   classify     zh-0817   orph… ││
│      │  │ ┃    t₀ = 2014-06-21  ·  ~12y old        ● orphaned          ┃ │ │ │ ╳╴ 14:32:09.401   score        zh-0817   ◆ cr… ││
│      │  │ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │ │ │ ├╴ 14:32:09.802   reason       zh-0817   nar… ││
│      │  │ ┌╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴┐ │ │ │ ├╴ 14:32:10.118   parse        zh-2049   reco… ││
│      │  │ ╵ zh-0817                              posture = 87 / 100   ╵ │ │ │ ╳╴ 14:32:10.330   score        zh-2049   ◆ hi… ││
│      │  │ ╵                                                            ╵ │ │ │ ├╴ 14:32:10.812   parse        zh-1188   reco… ││
│      │  │ ╵    GET   /internal/core/account-balance                    ╵ │ │ │ ├╴ 14:32:11.045   classify     zh-1188   depr ││
│      │  │ ╵                                                            ╵ │ │ │ ├╴ 14:32:11.241   score        zh-1188   ◆ me… ││
│      │  │ ╵    service · core-banking-internal       team · ?          ╵ │ │ │ └╴ 14:32:18.012   complete     scan completed ││
│      │  │ ╵    t₀ = 2009-11-04  ·  ~17y old        ● orphaned          ╵ │ │ │                                                ││
│      │  │ └╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴┘ │ │ │ [feed scrolls — most recent at bottom]         ││
│      │  │ … further specimens                                            │ │ └────────────────────────────────────────────────┘│
│      │  └───────────────────────────────────────────────────────────────┘ │                                                    │
│      │                                                                                                                          │
└──────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## strip α — depth meter

Spec: see `components.md` §9. Repeating critical numbers:

- Height: **132px** total. Top half (52px) = counters; bottom half (80px) = strata.
- Horizontal padding: **24px** from nav rail's right edge to the start of "discovery depth scan".
- Counter `n = NNN` uses mono 72/1/700 in `bone`. Tabular nums. The `n =` is mono 14/1/500 in `sediment`, vertically aligned to the *baseline* of the big number — not to its visual center.
- Δ line is 12px mono 500. Pre-scan: `Δ = 0`. Mid-scan: `Δ = +XX unknown endpoints recovered ·  recovering…`. Post-scan complete: `Δ = +34 unknown endpoints recovered  ·  last scan 14:32:18Z`.
- The depth meter borders strip β with a single 1px `hairline` — there is no gap between the two strips.

### during-scan motion

- The `n =` value tweens from `247` (registry baseline) up to `281` (final discovery) over the scan duration. Tween uses framer-motion `useMotionValue` with `latest = Math.round(value)` and is driven by the WebSocket `scan_progress.stats.total_discovered`.
- The active stratum band has the depth-sweep animation (see `motion.md`).
- As each stratum completes, its bar fills from current value to 100% in one `instrument` ease over 600ms, then its status readout swaps from `depth = NNNN` to `complete · N zombies` with a 200ms opacity crossfade.

---

## strip β — population readout

Spec: see `components.md` §7. Layout details:

- **4 cards in a row, gap 16px, padding 24px on the strip's left and right.**
- Card minimum width: 256px. Card height: 132px.
- At ≥1440px: all four cards in a row.
- At 1200-1439: still four cards in a row but card width compresses to 220px and the inline `share of total` caption truncates.
- At 900-1199: cards wrap to 2×2.
- At <900: cards stack vertically.

### the critical card's hero treatment

The rightmost card (`population · critical`) is the **only** card that gets the full decay treatment:

- 1px solid `decay-critical` border (replaces the standard hairline).
- `.overlay-scanline` layer above the content (mix-blend-mode: screen at 1px every 3px).
- `transform: rotate(-1.2deg)` — the strong tilt variant.
- The hero number `n = 12` is in `critical` color (`#C24545`).
- The card has 4px of negative margin on its right edge so the tilt doesn't crop visibly. Use `transform-origin: 30% 50%` so the tilt pivot reads as "the top-right is falling off".

The orphaned card uses the lighter dashed-stipple border treatment (no tilt, no scanline). The deprecated and active cards are crisp — the dashboard's decay is only on the populations that are *themselves* decayed.

### counter-climb on scan complete

When `scan_complete` fires:

1. All four card numbers tween from their current value to the final value over **800ms** with `ease-instrument`.
2. The share-of-total bars animate width simultaneously.
3. The delta lines animate in (opacity 0 → 1) **only after** the count has settled, with a 120ms delay.

---

## strip γ — working surface

Two-column layout. **Left column: 60% width. Right column: 40% width.** Both columns share the strip's top border with strip β (no gap).

### left column — top-risk specimens

#### header bar (24px tall)

- Section title: `top-risk specimens` in 14px mono 600 `bone`.
- Right: instrument readout `n = 6 of 281` in 12px mono 500. The `n =` and ` of 281` in `sediment`; the `6` in `bone`.
- The bar uses 1px `hairline` bottom border to separate from the list.

#### the list (specimen cards stacked vertically)

- 6 cards by default, more on scroll. Each card is a `<SpecimenCard>` (see `components.md` §4).
- Vertical gap between cards: **0px**. Cards share borders. This is the brutalist rule again — the instrument is one continuous readout.
- The single highest-risk card (the first one) uses the `decay-tilt-strong` (-1.2°) variant if `risk_tier = "critical"`. All other critical cards use the standard `-0.6°` tilt.
- Click → opens the endpoint drawer with that specimen.

#### top-risk fixture (use for the demo)

Fill the list with these six banking-authentic specimens. Use these exact paths in the fixture file:

| # | specimen | method+path | classification | tier | posture | service | team | t₀ |
|---|---|---|---|---|---|---|---|---|
| 1 | `zh-0142` | `GET /legacy/upi/collect-v1` | orphaned | critical | 92 | upi-gateway | payments-legacy | 2014-06-21 |
| 2 | `zh-0817` | `GET /internal/core/account-balance` | orphaned | critical | 87 | core-banking-internal | (none) | 2009-11-04 |
| 3 | `zh-2049` | `POST /legacy/kyc/aadhaar-verify-v2` | orphaned | high | 78 | kyc-services | onboarding-legacy | 2016-02-18 |
| 4 | `zh-1188` | `PUT /internal/aml/screen` | deprecated | medium | 64 | aml-services | risk | 2018-09-12 |
| 5 | `zh-0509` | `POST /legacy/imps/p2p-transfer` | orphaned | high | 72 | imps-rails | payments-legacy | 2015-04-30 |
| 6 | `zh-3471` | `DELETE /legacy/auth/session-token` | orphaned | high | 70 | auth-edge | identity | 2012-08-09 |

(These are illustrative banking-authentic examples drawn from `docs/ps-understanding-2.md`. The frontend's fixture file already mirrors the data model; the migration brief lists the field updates needed.)

### right column — scan feed

#### header bar

Renders the box-drawing motif (M2). See `components.md` §8 header bar block. Format: `┌─ depth scan / {ISO timestamp} ─────────  status = {phase}  ·  progress = {pct}%`. The trailing line in 11px mono 400 `bone-dim`.

#### the feed itself

- Scrollable container, **max 18 visible lines** (above the viewport bottom). The feed grows downward; on append, the latest line goes to the bottom and the container auto-scrolls to keep it visible.
- New lines: opacity 0 → 1 over 120ms `instrument`, plus a 2px translateY.
- The most recent line uses `└╴` prefix (the tree closes at the bottom). All preceding lines have `├╴`. Critical lines use `╳╴` regardless of position.
- When a line scrolls off the top: opacity drops to 0.4 to indicate it's older. The first off-screen 4 lines stay rendered (for accessibility scroll-back); beyond that, virtualized.
- On a `scan_event` with `severity === "critical"`: the line additionally renders a 2px-tall `critical` strip 4px to the left of the prefix (a fissure marker in the line tree). This is functional redundancy with the color and the `╳╴` glyph.

#### terminal commands

- **Auto-scroll** is on by default. If the user scrolls up manually, auto-scroll pauses and a `↓ jump to latest` button appears at the bottom-right, with a count of unread lines (e.g., `↓ jump to latest · n = 12`). Clicking it scrolls to bottom and resumes auto-scroll.

---

## global shell context (nav rail + top bar)

The Command Center sits inside the global shell. Shell details:

### nav rail (left, 64px wide)

- Background: `tar` (same as canvas — the rail does not visually break from the grid).
- 1px `hairline` right border separates from main content.
- Items, top to bottom:
  1. `ZH` brand mark — 16px mono 700 `bone`, in a 32×32 panel at the top with 1px `hairline` border. Hover: bg `stratum-raised`. Selected route: bg `stratum-raised`, 2px `blueprint` left edge.
  2. `▼` (depth scan / command center) — selected on `/`.
  3. `◇` (inventory / catalog) — `/inventory`.
  4. `▣` (landscape / stratigraphy) — `/landscape`.
  5. `▷` (reports) — `/reports`.
  6. (spacer pushes the rest to bottom)
  7. `…` (settings — non-functional placeholder)
- Icons rendered as Unicode glyphs in 18px mono 400 `bone-dim`. Selected route: glyph in `bone`. Hover: glyph in `bone`. Active routes get a 2px `blueprint` left edge inside the rail item.
- Tooltip on hover (300ms delay): `command center · depth scan` etc., displayed as a 11px mono 500 `bone-dim` chip floating 8px right of the rail with a `stratum-raised` background and `hairline` 1px border.

### top bar (56px tall)

- Background: `tar`. Bottom border: 1px `hairline`.
- Left: current screen title in mono 19px 600 `bone`. Below it, a 11px mono 400 `bone-dim` subtitle: `command center · depth scan`. (The subtitle is the route's full path in the rail tooltip system — it doubles as breadcrumb.)
- Center: global search input (see `components.md` §12), 320px wide, with placeholder `path · /v1/...`. Searches dispatch to `/api/endpoints` with `?search=` filter.
- Right (in order): the **run discovery scan** button (primary, see `components.md` §11), then 16px gap, then the **connection indicator** (see `components.md` §16).

The top bar is sticky (`position: sticky; top: 0; z-index: var(--z-topbar)`).

---

## states

### pre-scan (first time the user lands on `/`)

- Counter: `n = 247` (registry baseline). `Δ = 0`. The right-of-counter area shows a centered call-to-action: `awaiting first specimen.   ▶ run discovery scan` rendered as mono 12/1/400 `bone-dim` with an inline primary-button-styled CTA.
- All four strata bars are empty (0% fill). Status readouts: all `queued`.
- Metric cards show registry-known numbers: `active n = 198`, `deprecated n = 38`, `orphaned n = 0`, `critical n = 0`. The Δ line on each card reads `Δ = 0`.
- Top-risk list shows `awaiting first scan. registry-known endpoints sorted by static risk:` and lists the 6 highest-static-risk registry endpoints (no zombies yet, since none have been discovered).
- Scan feed shows: a single line: `└╴ —    waiting for scan…    feed will populate on /api/scan/start`.
- The `run discovery scan` button in the top bar is animating the caret-blink (a faint `▮` after the label). The button glows attention by being the only animated thing on the screen.

### scanning (active)

- Counter tweens upward as `scan_progress` events arrive.
- Active stratum band shows the `depth-sweep` animation.
- Metric cards: numbers are not yet final — they show `n = ··` (two dim dots in `sediment`) with a label `updating` below. Bars are hidden.
- Top-risk list: as each new orphaned/critical is found via `endpoint_update`, it inserts at its sorted position with a 200ms `instrument` fade-in. List length is capped at 6; new items push lower-rank items off the bottom.
- Scan feed: streams events as fast as they arrive.
- The `run discovery scan` button shows `scanning · 62.0%` with the trailing caret-blink. Cursor: `progress`. Clicking does nothing (a `pointer-events: none` overlay).
- The connection indicator: `● connected · streaming events at ~14/s` in `bone-dim`.

### complete

- Counter settles at final value. Δ line replaces the streaming-recovery text with the timestamp.
- Metric cards settle with the counter-climb animation (800ms) and the delta lines animate in.
- All stratum bars full. Status readouts swap to `complete · N zombies` where N > 0.
- A single short toast appears at the bottom-right (8px from the strip γ edge, see `motion.md` toast spec): `scan complete · n = 281 specimens · 34 zombies recovered`. Toast auto-dismisses after 4s.
- The `run discovery scan` button restores to its default `run discovery scan` state.

### error / disconnected

- The WebSocket dropping mid-scan: the connection indicator flips to `critical` color (pulsing).
- A non-blocking banner appears at the top of strip α (overlays the depth-meter top edge, full-width, 28px tall): `▲ connection severed at 14:32:07. last known depth = 2014. retrying ×2.` in 12px mono 500 `critical` on a `critical-wash` background.
- Counter freezes at last-known value. Active stratum's sweep animation pauses. All strata bars stop updating.
- The Δ line gets `·  ?` appended: `Δ = +12 unknown endpoints recovered  ·  ?  ·  reconnecting…`.
- On reconnect: banner crossfades out over 200ms; the stratum sweep resumes; an info-severity event is appended to the feed `├╴ {ts}   reconnect    resumed at depth = 2014`.

---

## responsive

| breakpoint | layout |
|---|---|
| ≥1440px | full layout above |
| 1200-1439 | strip γ columns become 55%/45%; specimen cards narrow (path may truncate); metric cards stay in a row |
| 900-1199 | metric cards wrap to 2×2; strip γ becomes single-column (top-risk on top, feed below at fixed 280px tall); depth meter strata fill width still |
| <900 | strip α counters stack (n above Δ, both centered); strata bars compact (single column with labels collapsed); top-risk truncates to 3 specimens; feed is below in a 240px container |

The Command Center is **designed for ≥1200px first**. Below 900 it remains functional but the brutalist composition reads less strongly — this is acknowledged and accepted.

---

## accessibility

- All four card numbers, the counter, and every scan-feed line have `aria-live="polite"` regions that announce changes (the counter announces every 25% milestone; the cards announce on scan-complete; feed lines are read out as they arrive).
- Classification badges have the leading shape (`●`/`◆`) plus the lowercase text — color is redundant.
- Decay edges (dashed/broken-stipple) communicate state visually to sighted users; sighted users with color-blindness still get the shape difference. Screen-reader users get the text label.
- The depth meter exposes its strata as an `<ol>` with role="list", each stratum has an `aria-label` like `stratum 2 of 4, years 2018 to 2023, status complete, 19 zombies recovered`.
- All interactive elements have visible focus rings (`var(--focus-ring-offset)`).
- The `run discovery scan` button has an `aria-keyshortcuts="r"` and a global hotkey `R` triggers it (no modifier — a single-key shortcut, since this is the primary action and there's no text input that captures `R` by default).

---

## acceptance criteria

A frontend implementation is "done" when:

- [ ] The Command Center renders all three strips with no margin between them.
- [ ] The depth meter has four strata with year labels, 4px bars, sweep animation on the active stratum, and status readouts. Pre-scan shows all `queued`; post-scan all `complete`.
- [ ] The counter reads `n = NNN` (not `NNN`), with the `n =` in sediment and the number in bone, tabular-nums. It tweens during a scan.
- [ ] The four metric cards exist; the orphaned card has the broken-stipple dashed border; the critical card has the scanline overlay + −1.2° tilt + solid bruise border. The other two cards are crisp.
- [ ] The top-risk list renders six specimen cards with shared borders (no gap). Each card has the three-row layout (header / body / footer) and the classification badge anchored bottom-right. The single highest-risk card uses the stronger tilt.
- [ ] The scan feed renders the `┌─ depth scan ─` header, with `├╴` / `└╴` / `╳╴` line prefixes by severity. Lines fade in. Auto-scroll works. The `jump to latest` button appears on manual scroll-up.
- [ ] All instrument readouts use the `n =` / `Δ =` / `t₀ =` / `score =` patterns. No bare numbers.
- [ ] Banking-authentic content: every fixture endpoint uses UPI/NEFT/RTGS/IMPS/Aadhaar/KYC/AML/core-banking paths.
- [ ] WCAG AA contrast verified on bone (14.8:1), bone-dim (6.9:1), active (11.8:1), deprecated (5.8:1), orphaned (8.5:1), critical (5.1:1), blueprint (7.6:1) — all on tar background.
