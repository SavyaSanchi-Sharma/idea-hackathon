# inventory — redline spec

Route: `/inventory`. The exhaustive catalog of every endpoint the scan has recovered.

The brief's original design called for a "dense, dark, monospace table" with sortable columns. That is the developer-tool default and it doesn't carry our identity. Instead, the inventory is a **specimen catalog**: each row is a horizontal specimen card (same atom as the Command Center top-risk list, just compressed), filtered and sorted by a header rail. The result still surfaces every field the brief required, but it reads as a catalog drawer at a museum, not a SaaS table.

---

## full ASCII layout

```
┌──────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│      │  inventory · specimen catalog                                          [ id · zh-_____ ]    [ path · /v1/... ]       │
│      │                                                                              [ run discovery scan ]  [● connected]   │
│  ZH  ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ▼   │                                                                                                                       │
│  ◇←  │   classification   [ all n=281 ]  [ active n=204 ]  [ deprecated n=43 ]  [ orphaned n=34 ]  [ critical n=12 ]         │
│  ▣   │   tier             [ all ]  [ critical ]  [ high ]  [ medium ]  [ low ]                                               │
│  ▷   │   source           [ all ]  [ traffic logs ]  [ registry ]  [ code scan ]                                             │
│      │   sort             [ posture ▼ ]   [ t₀ asc ▽ ]   [ traffic ▲ ]                                                       │
│      │                                                                                                                       │
│      ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│      │  showing  n =  34 of 281     ·    filter: classification = orphaned                            page  1 / 4   ◀  ▶    │
│      ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│      │  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │
│      │  ┃ zh-0142    GET   /legacy/upi/collect-v1                          posture 92  ◆ critical   ● orphaned   ⫶            ┃ │
│      │  ┃            upi-gateway · payments-platform-legacy                t₀ 2014-06-21 · 12y  ·   calls(30d) n = 2  Δ −94% ┃ │
│      │  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│      │  ┌╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴┐ │
│      │  ╵ zh-0817    GET   /internal/core/account-balance                  posture 87  ◆ critical   ● orphaned   ⫶            ╵ │
│      │  ╵            core-banking-internal · (no owner)                    t₀ 2009-11-04 · 17y  ·   calls(30d) n = 0  Δ −100%╵ │
│      │  └╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴┘ │
│      │  ┌╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴┐ │
│      │  ╵ zh-2049    POST  /legacy/kyc/aadhaar-verify-v2                   posture 78  ◆ high       ● orphaned   ⫶            ╵ │
│      │  ╵            kyc-services · onboarding-legacy                      t₀ 2016-02-18 · 10y  ·   calls(30d) n = 47 Δ −62% ╵ │
│      │  └╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴ ╴┘ │
│      │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│      │  │ zh-1188    PUT   /internal/aml/screen                            posture 64  ◆ medium     ╴ deprecated  ⫶          │ │
│      │  │            aml-services · risk                                   t₀ 2018-09-12 · 8y   ·   calls(30d) n = 832 Δ −12%│ │
│      │  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│      │                                                                                                                       │
│      │  …additional specimens                                                                                                │
│      │                                                                                                                       │
└──────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## structure

The page has three sections, top to bottom:

1. **Filter rail** — classification chips, tier chips, source chips, sort options.
2. **Count line** — the showing-N-of-N readout, filter summary, pagination.
3. **The catalog** — vertically stacked specimen rows.

### filter rail (fluid height, typically ~140px)

- Background: `stratum`. 1px `hairline` bottom border. Padding: 16px 24px.
- Four labeled rows, each on its own line:
  - `classification` label (11px mono 500 `bone-dim`, 100px fixed width left column) + a row of filter chips.
  - `tier` row.
  - `source` row.
  - `sort` row.
- Chips are `components.md` §13. Selected chip has the matching wash background and the bottom border accent.
- The `[ all n=281 ]` chip is always present per row. Counts in `n=NNN` instrument-readout style.
- Sort chips use a small arrow glyph after the label: `▼` (desc), `▽` (asc), `▲` (high-to-low, used for non-time fields). One sort active at a time.
- Multi-select: classification and tier chips behave as toggles (multiple can be active). Source chips are radio (single active).

#### sort options

- `posture ▼` — posture_score descending (default)
- `posture ▽` — posture_score ascending
- `t₀ ▽` — birth-year ascending (oldest first)
- `t₀ ▼` — birth-year descending (newest first)
- `traffic ▲` — calls_30d descending
- `traffic ▽` — calls_30d ascending

### count line (40px tall)

- Background: `tar` (not `stratum` — it sits between the filter rail and the catalog as a thin trough).
- Left: `showing  n =  N of N` in 12px mono 500 — the `n =` and ` of N` in `sediment`, the active count in `bone`.
- Center: `·    filter: classification = orphaned, tier = critical` in 11px mono 400 `bone-dim`. If no filters active: `· no filters applied`.
- Right: pagination — `page  1 / 4   ◀  ▶` in 12px mono 500. The arrows are 16px hit-areas in `bone-dim`, `bone` on hover. Disabled (first/last page) at 0.4 opacity.

### catalog (fluid, fills remaining height)

- Padding: 0 24px.
- Rows: each row is a **horizontal specimen card** (a compressed variant of `components.md` §4). Dimensions:
  - Width: full content width.
  - Height: 56px (two lines of content + 12px vertical padding).
  - Vertical gap: 0 (rows share borders).
- Row layout (left → right):
  - Specimen-id (`zh-NNNN`) in 11px mono `sediment-strong`, fixed 80px column.
  - Method pill, 8px gap.
  - Path in 13px mono 600 `bone`, fluid width.
  - Right-aligned cluster: `posture NN` instrument readout (12px mono 500 tabular), 16px gap, risk-tier badge (with diamond), 8px gap, classification badge (with dot), 8px gap, action menu `⫶` (16×16 hit area, opens an action popover).
- Second line (12px mono 400 `bone-dim`): `{service} · {team}` on the left, right-aligned: `t₀ {date} · {N}y · calls(30d) n = N  Δ {trend}%`.
- Row decay: applies per the classification of the row (active = solid hairline, deprecated/orphaned/critical = the matching dashed/stipple/scanline-tilt — but tilt amount is reduced to **−0.2°** for inventory rows so the stack still reads as a list). Critical rows get the scanline overlay and the small tilt, no more than that — full −0.6° on every critical row would make the catalog unreadable.
- Hover: row bg fills with `stratum-raised`; cursor pointer.
- Click anywhere on the row: opens the endpoint drawer.

### action popover (from `⫶`)

A 200px-wide menu, `stratum-raised` bg, 1px `hairline` border. Items in 12px mono 500 `bone`:

- `open specimen`
- `show blast radius`
- `quarantine specimen`
- `copy specimen id`
- `copy endpoint path`

Hover row: `stratum` background. Click outside closes.

---

## empty / loading / no-results

| state | rendering |
|---|---|
| pre-scan (no specimens recovered, only registry) | catalog shows `awaiting first scan. n = 247 registry-known endpoints below:` followed by the registry list rendered as specimen cards. Each card has a 10px `sediment-strong` overlay caption: `(registry only — not yet scanned)`. |
| loading (filter change in flight) | the count line shows `retrieving…  ▮` (caret blink). The catalog is dimmed to 0.5 opacity over 200ms. Previous results stay visible until new results arrive (no flicker). |
| no results for current filter | `n = 0 of 281` in the count line. The catalog renders: a single panel with `no specimens match current filters.   [ clear filters ]` in 13px mono 400 `bone-dim`, centered, 160px tall. |
| error (api 500) | the catalog renders: `▲ inventory unreachable. retrying in 2s.` in `critical` color, with a `retry now` secondary button below. |

---

## interactions

| interaction | result |
|---|---|
| Click chip | toggle (classification/tier) or replace (source) the filter; updates `uiStore.inventoryFilters`. |
| Type in `id ·` input | filter by specimen-id prefix (case-insensitive). |
| Type in `path ·` input | filter by endpoint path substring. |
| Click row | open drawer with that endpoint. |
| Press `↓ / ↑` while focus is on a row | move focus to next/previous row. |
| Press `Enter` while focus on row | open drawer. |
| Press `Space` while focus on row | toggle a row's "marked" state (a future-phase feature; visually the specimen id gains a leading `●` mark). |
| Press `/` anywhere | focus the `path ·` search input. |

---

## responsive

| breakpoint | layout |
|---|---|
| ≥1440 | full layout |
| 1200-1439 | filter rail rows wrap; chips stay; sort row may break to two visual rows |
| 900-1199 | second row of each specimen card (service/team/t₀/calls) wraps below the first; row height grows to 76px |
| <900 | the entire right cluster (posture + tier badge + classification badge + `⫶`) wraps below the path; row height ~96px |

---

## accessibility

- Filter chips are `<button role="checkbox">` for the multi-select rows (classification, tier) and `<button role="radio">` for source. Sort chips are `<button>` with `aria-pressed`.
- The catalog is `<ol role="list">`; each row is `<li role="listitem">` with `tabindex=0` and an `aria-label` of `specimen zh-0142, GET /legacy/upi/collect-v1, classification orphaned, tier critical, posture 92, last seen 12 years ago`.
- The count line is `aria-live="polite"` so filter changes are announced.
- Decay (dashed borders) is purely visual; the classification text label is the assistive signal.

---

## acceptance criteria

- [ ] Filter rail has four labeled rows (classification, tier, source, sort) with chips.
- [ ] Counts on the classification chips use the `n=NNN` instrument-readout pattern.
- [ ] Each row is a horizontal specimen card with the two-line layout (header line + service/team/t₀ line) and shares its top/bottom borders with adjacent rows.
- [ ] Orphaned/critical rows show decay borders (dashed/stipple/solid-bruise) per the row's classification, with the reduced −0.2° tilt for critical rows.
- [ ] Row click opens the drawer.
- [ ] Pagination renders `page X / Y   ◀  ▶`.
- [ ] "showing n = N of N" readout uses the instrument pattern.
- [ ] Pre-scan state shows registry endpoints with the `(registry only)` annotation.
- [ ] All sort options work and update query state.
- [ ] Search via `/` keyboard shortcut focuses the path input.
