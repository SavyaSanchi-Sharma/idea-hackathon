# states — per-screen catalog

Every screen must implement these five state shapes. This is the single source of truth for what each one looks like — individual screen redlines (`command-center.md`, `inventory.md`, etc.) reference but do not redefine them.

The five states:

1. **loading** — data fetch in flight, no prior data.
2. **empty** — fetch succeeded but the set is empty (pre-scan / no-results).
3. **scanning** — a scan job is in progress, live data streaming.
4. **complete** — scan finished, all counts settled.
5. **disconnected** — WebSocket dropped; data is stale but visible.

---

## global rules

- **No spinner-only loading states.** Spinners are a dev-tool default; we don't use them. Loading is conveyed by **skeletons** that share the destination layout, or by **streaming caret indicators** (`▮ retrieving…`) where a single mono line is sufficient.
- **No layout shift.** A state transition (loading → loaded → updating) must not jump heights or widths. Skeletons match their final-component dimensions exactly.
- **Disconnected ≠ blank.** When the WebSocket drops, the last-known data stays on screen, dimmed to 0.85 opacity, with a single banner explaining the state. Never replace data with "—" or a generic error.
- **Critical errors are mono.** No big alert icon, no centered red modal. The error is a line of mono text, prefixed with `▲`, in the matching severity color, sized so it reads as another instrument readout.

---

## skeleton style

The unified skeleton appearance:

- **Color**: `stratum-raised` (4-step darker than `bone-dim`, on the `stratum` panel).
- **Shape**: simple solid blocks at the exact dimensions of the final content. No rounded corners — they are the same shape as the content they will become.
- **Animation**: opacity cycles 0.5 → 0.8 → 0.5 over 1.2s with `ease-in-out`. Implemented as CSS `animation`. All skeletons on a screen pulse in unison (shared keyframe).
- **Mono blocks for text**: for text skeletons, render the placeholder as a mono `█████` block (literal char) in `hairline-strong` color, sized to approximate the final word count. This keeps the type cadence consistent during loading.

```
posture score 92 / 100              ← live
posture score █████████             ← skeleton
```

---

## state catalog

### 1. loading

#### Command Center

- Depth meter: counter shows `n =  ··` (two dim dots in `sediment`). `Δ = …`. The stratum bars render as empty tracks. Status readouts all `loading…`.
- Metric cards: hero numbers are `··`. Bars hidden. Header line ("population · active") renders.
- Top-risk: 6 specimen-card skeletons stacked, each with `█████`-style mono blocks for the path, the service, etc. Classification badge area is empty.
- Scan feed: a single mono line: `└╴ —   awaiting feed connection…   ▮` in `bone-dim`.
- Connection indicator: `● connecting…` in `deprecated` color.

#### Inventory

- Filter rail renders fully.
- Count line: `retrieving…  ▮` in `bone-dim`.
- Catalog: 8 row-skeletons stacked, each at the final 56px height with mono-block placeholders.

#### Endpoint drawer

- Header: specimen-id and badges from cache; method+path from cache (the drawer was opened from a list, so these are known).
- Posture arc: the loading variant (50% gray fill, `mechanical` rotation, `··` in center).
- Factor bars: 5 skeleton bars with mono-block labels.
- Classification reasoning: `├╴ ████ ████ ████` × 4.
- Field notes: the frame renders, inside it: `retrieving field notes…  ▮` in `bone-dim`.
- Signals grid: skeleton key/value rows.
- Recommended action: shows `pending  ▮`.

#### Landscape graph

- X and Y axes render fully.
- Canvas center: single line `retrieving stratigraphy…  ▮` in 12px mono `bone-dim`.
- Filter rail renders fully.
- Legend collapsed by default during loading.

---

### 2. empty

#### Command Center (pre-scan)

- Depth meter: counter at registry baseline (`n = 247`); `Δ = 0`. The right side of the counter row shows: `awaiting first specimen.   ▶ run discovery scan` (mono 12 `bone-dim` with the CTA underlined and clickable).
- Metric cards: registry-known numbers (`active n = 198`, `deprecated n = 38`, `orphaned n = 0`, `critical n = 0`). Delta line on each: `Δ = 0`. Bars rendered. The orphaned and critical cards do NOT show their decay borders in this state (they have nothing to be decayed about).
- Top-risk: header reads `top-risk · registry static analysis`. Lists the 6 highest-static-risk registry endpoints with the caption (small 10px mono `sediment-strong` line below each card): `(registry only — not yet scanned)`. Cards are crisp regardless of static-risk tier.
- Scan feed: a single line `└╴ —   waiting for scan…   feed will populate on /api/scan/start`.

#### Inventory (no specimens recovered, registry only)

- Catalog renders the 247 registry endpoints. Each card has a small annotation `(registry only)` in 10px mono `sediment-strong` at the row's far-right or below the t₀ line.
- Filter rail's count chips show the registry counts: `[ all n=247 ]  [ active n=204 ]  [ deprecated n=43 ]  [ orphaned n=0 ]  [ critical n=0 ]`. The orphaned and critical chips are disabled (0 count → opacity 0.4, no hover).
- Count line: `showing  n = 247 of 247  ·  registry only — no scan executed`.

#### Inventory (no results for current filter)

- Catalog renders: a single panel (`stratum`, 1px `hairline`, 160px tall, centered content) with: `no specimens match current filters.   [ clear filters ]` — the clear filters is a secondary button.
- Filter rail still renders.

#### Landscape graph (empty)

- Canvas center: `no specimens recovered.   ▶ run discovery scan` in 13px mono `bone-dim`. The CTA button (inline primary style) is below the line.
- Axes still render.

#### Endpoint drawer (endpoint not found — rare)

- Header: `zh-???? · specimen not found` in `bone-dim`. Method pill replaced with `404` pill in `critical` color.
- All other sections collapsed; one line in the body: `endpoint id {id} was not found in the catalog. it may have been re-classified or removed.   [ close ]`.

---

### 3. scanning

#### Command Center

- Depth meter counter tweens upward as `scan_progress` events arrive. The active stratum band has `depth-sweep` animation.
- Metric cards: numbers replaced with `n = ··` plus a 10px mono `bone-dim` caption below `updating`. Bars hidden.
- Top-risk: a small `(updating)` annotation appended to the section title in 10px mono `sediment-strong`. As `endpoint_update` events arrive, new specimens insert at their sorted position with a 200ms `instrument` fade-in. List length capped at 6.
- Scan feed: streaming.
- The `run discovery scan` button shows `scanning · 62.0%` with a caret-blink trailing the percentage. Cursor `progress`. Clicks during scan are dropped.
- Connection indicator: `● connected · streaming events at ~14/s`.

#### Inventory

- The filter rail's count chips update live as new specimens are classified. Each count change tweens over 600ms.
- The count line: `showing  n = N of M   ·  scanning…   ▮  progress = 62.0%`.
- The catalog: new specimens insert at their sorted position; older rows shuffle. To avoid visual chaos at high event rates, the catalog uses a 320ms debounce on row reorders — events accumulate during scanning and the final positions are committed in batches.

#### Endpoint drawer (open during a scan)

- The currently-shown specimen receives `endpoint_update` events normally — its posture and classification update live. Each tween: 600ms `ease-instrument`. The user sees the score and tier badge change.
- The field-notes block: if the specimen receives a re-evaluation, a small line above the frame: `(re-evaluated 14:32:08 — narrative re-generating)` and the narrative re-streams.

#### Landscape graph

- New nodes appear at their target position with a 200ms opacity fade. They do not re-run the intro fall-into-strata animation.
- Filter chips' counts update live.

---

### 4. complete

#### Command Center

- Counter settles at final discovery count.
- Stratum bars all 100%; status readouts swap to `complete` or `complete · N zombies`.
- Metric cards' numbers counter-climb to final values over 800ms `ease-instrument`; delta lines appear after a 120ms delay.
- The orphaned card now shows its broken-stipple decay border. The critical card now shows its scanline + −1.2° tilt.
- Top-risk list settles in its final order.
- Scan feed appends one final line: `└╴ {ts}   complete    scan completed · n = 281 specimens · {orphaned-count} zombies`.
- The `run discovery scan` button restores to default.
- A bottom-right toast: `scan complete · n = 281 specimens · 34 zombies recovered` for 4s.

#### Inventory

- The catalog settles into its final sorted order.
- Filter chip counts settle to their final values.

#### Landscape graph

- New nodes that arrived during the scan are now permanently placed.

---

### 5. disconnected

#### the disconnect event

When the WebSocket fires `onclose`, the global shell:

1. Connection indicator turns to `critical` color: `● disconnected · last event {ts} · retry ×N`. The dot pulses (1.2s ease-in-out infinite).
2. A non-blocking banner appears at the top of `<main>` (overlays the first 28px of the content, full-width, `critical-wash` bg, 1px `critical` bottom border): `▲ connection severed at {ts}. last known depth = {N}. retrying ×{retryCount}.` in 12px mono 500 `critical`.
3. Auto-reconnect with exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped). Each retry attempts the WS open.

#### per-screen behavior

##### Command Center
- Depth meter counter shows the last-known value with a strikethrough `Δ = ?`. Active stratum sweep pauses. Strata bars freeze.
- Metric cards keep their last values. A small 10px mono `deprecated` line appears at the bottom of each card: `last updated {ts}`.
- Top-risk: last rendered set stays. A 10px mono `deprecated` caption above the list: `cached at {ts}`.
- Scan feed: append a single info line `├╴ {ts}   disconnect   websocket closed · retrying in 1s`, then on each retry, another `├╴ ... reconnect attempt ×N`.

##### Inventory
- All cards stay; the catalog dims to 0.85 opacity.
- Count line gets `· stale (since {ts})` appended.

##### Endpoint drawer
- Shows last-fetched data unchanged.
- A 10px mono `deprecated` line at the top of the field-notes block: `▲ cached at {ts} — connection severed`.

##### Landscape graph
- The canvas dims to 0.6 opacity.
- No new nodes update.

#### reconnect

On WS `onopen` after a drop:

1. The banner crossfades out over 200ms.
2. Connection indicator flips back to `active`: `● connected · last event 0.4s ago`.
3. A feed event appears: `├╴ {ts}   reconnect    resumed at depth = {N}`.
4. Caches are revalidated: each open TanStack query re-fetches its data in the background (no visible reload — the screens just receive fresh data via the standard query-update path).

---

## ARIA / live regions per state

| state | aria-live | message |
|---|---|---|
| loading → loaded | polite | `inventory loaded, n = 281 specimens` |
| scanning starts | assertive | `discovery scan started at {ts}` |
| scan progress (every 25%) | polite | `scan at 50 percent · n = 142 specimens recovered so far` |
| scan complete | assertive | `scan complete · n = 281 specimens · 34 zombies recovered` |
| disconnect | assertive | `connection severed. retrying.` |
| reconnect | polite | `connection restored. resuming.` |

---

## acceptance criteria (cross-screen)

- [ ] No screen uses a generic loading spinner.
- [ ] All skeletons share the unified pulse animation and `hairline-strong` color.
- [ ] Pre-scan (empty) states preserve the registry data and clearly mark it as such with the `(registry only)` caption.
- [ ] Scanning states use `n = ··` for in-flight values and have explicit `updating` captions.
- [ ] Complete states trigger counter-climb on all live counts and a toast confirmation.
- [ ] Disconnected states show the `▲ connection severed at {ts}` banner with retry count; data stays on screen at 0.85-0.6 opacity; auto-reconnect runs with exponential backoff.
- [ ] All state transitions are announced to assistive tech via the appropriate `aria-live` regions.
