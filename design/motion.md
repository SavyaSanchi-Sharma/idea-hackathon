# motion — animation catalog

Purposeful only. No decorative animation, no parallax, no looping background motion. Every animation in the product is one of the following, and the frontend agent must implement them at the timings and easings specified here.

The four allowed ambient loops (motion that runs without user input):

1. **caret-blink** — the typewriter cursor in the field-notes paragraph (and the run-scan button while scanning).
2. **depth-sweep** — the horizontal sweep inside the active stratum band during a scan.
3. **decay-drift** — the very subtle ±1px sway of critical specimen cards.
4. **disconnect-pulse** — the connection indicator dot when WS is down.

Everything else is **transient** — it runs once in response to an event, then stops.

---

## tokens

From `tokens.css`. Repeated here for the agent's convenience:

| token | value | use |
|---|---|---|
| `--ease-instrument` | `cubic-bezier(0.22, 1, 0.36, 1)` | the default "crisp settle". use for counters, tweens, drawer slide-in. |
| `--ease-mechanical` | `cubic-bezier(0.4, 0, 0.6, 1)` | even, linear-ish. use for the depth-sweep, loading-arc rotation. |
| `--ease-decay` | `cubic-bezier(0.65, 0, 0.35, 1)` | heavy fall-off. use for nodes settling into strata, fault-line propagation. |
| `--dur-fast` | 120ms | hover transitions, button state changes, scan-feed line entry |
| `--dur-base` | 200ms | most fades, opacity transitions |
| `--dur-slow` | 320ms | drawer slide-out, blast-mode exit |
| `--dur-drawer` | 260ms | drawer slide-in |
| `--dur-counter` | 2200ms | depth scan counter climb |
| `--dur-typewriter` | 22ms | per-character cadence for field notes |
| `--dur-teletype-jitter` | 6ms | ± jitter on typewriter for organic feel |
| `--dur-wave` | 1600ms | fault-line propagation total |
| `--dur-stratum-settle` | 900ms | graph nodes settling into strata on mount |

---

## animation reference

### A1 — counter climb (depth-meter `n =`)

- **Trigger**: WebSocket `scan_progress` events, OR mount when `summary.total_discovered` differs from cached value.
- **From → To**: `prev_value → new_value`, integer-rounded each frame.
- **Duration**: `dur-counter` (2200ms) on the initial scan-start tween (registry baseline → final). For progressive `scan_progress` events during a scan, each tween is shorter (~800ms) so the number tracks progress smoothly.
- **Easing**: `ease-instrument`.
- **Implementation**: framer-motion `useMotionValue` + `useTransform` to integer + `<motion.span>{value}</motion.span>`. The label `n =` is static; only the numeric value tweens.
- **Side effect**: the matching metric-card numbers (active/deprecated/orphaned/critical) tween in lockstep, with their own `useMotionValue`s.

### A2 — metric-card hero counter

- **Trigger**: `scan_complete`.
- **From → To**: previous value → final value.
- **Duration**: 800ms.
- **Easing**: `ease-instrument`.
- **Sequence**: the share-of-total bar animates width simultaneously. The delta line `▲ +34 vs registry baseline` fades in (opacity 0 → 1) **after** the count finishes, with a 120ms delay.

### A3 — depth-sweep (active stratum band)

- **Trigger**: a stratum becomes the active depth in `scan_progress`.
- **What**: a 32px-wide gradient sweeps left-to-right within the active stratum's bar.
- **CSS**:
  ```css
  .depth-sweep::after {
    content: "";
    position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent 0%, var(--blueprint) 50%, transparent 100%);
    width: 32px;
    animation: depth-sweep 1.6s linear infinite;
  }
  @keyframes depth-sweep {
    0%   { transform: translateX(-32px); }
    100% { transform: translateX(100%); }
  }
  ```
- **Duration**: 1.6s per cycle.
- **Easing**: linear (`ease-mechanical`).
- **Stops when**: the stratum status changes from `active` to `complete`.

### A4 — scan-feed line entry

- **Trigger**: a new `scan_event` is appended.
- **From → To**: opacity 0 → 1, translateY 2px → 0.
- **Duration**: `dur-fast` (120ms).
- **Easing**: `ease-instrument`.
- **Implementation**: framer-motion `<motion.div initial={{opacity: 0, y: 2}} animate={{opacity: 1, y: 0}} transition={{duration: 0.12}}>`.

### A5 — drawer slide-in / slide-out

- **Trigger**: `uiStore.drawerOpen` toggles.
- **In**: `transform: translateX(100%) → translateX(0)` over `dur-drawer` (260ms) with `ease-instrument`. The backdrop scrim fades in (opacity 0 → 1) simultaneously.
- **Out**: reverse with `dur-slow` (320ms) — slightly slower out than in (the asymmetry feels natural).
- **Focus**: when the drawer opens, focus moves to the `[×]` button after the animation completes. When it closes, focus returns to the element that triggered it.

### A6 — typewriter (field-notes streaming)

- **Trigger**: drawer opens with a non-empty `threat_narrative`, OR a re-evaluation event re-streams.
- **What**: one character of the narrative appended per tick.
- **Tick**: `22ms ± 6ms` (uniform random ±6 each tick), implemented as `setTimeout` re-scheduling itself with a fresh random offset.
- **Caret**: a trailing `▮` block char in `blueprint`, `animation: caret-blink 1.1s steps(1, end) infinite`. The caret is rendered as a sibling `<span>` to the streamed text. It is removed once streaming completes.
- **Pause**: if the drawer closes before streaming completes, the streaming is canceled. On re-open, it restarts from the beginning (no resume — narratives are short and consistency wins).
- **Skip**: a small `(skip ▶)` link in 10px mono `bone-dim` appears 100ms after streaming starts, in the top-right of the frame. Click jumps to the fully-rendered narrative.

### A7 — caret-blink

- **CSS**:
  ```css
  @keyframes caret-blink {
    0%, 49%  { opacity: 1; }
    50%, 100%{ opacity: 0; }
  }
  .caret-blink { animation: caret-blink 1.1s steps(1, end) infinite; }
  ```
- **Where used**: the typewriter caret; the `▮` after `scanning · 62.0%` in the run-scan button; the trailing caret on any `retrieving…  ▮` skeleton text.

### A8 — graph nodes settle (stratigraphic intro)

- **Trigger**: Landscape graph mounts.
- **From → To**: each node starts at `y = 0` (top of canvas) and falls to its target `y`.
- **Duration per node**: `dur-stratum-settle` (900ms).
- **Easing**: `ease-decay` (heavy fall-off — the node decelerates as it settles into its layer).
- **Stagger**: per-node start delay = `(years_ago * 6ms)`. So a 2025 endpoint starts at `t=0`; a 2015 endpoint starts at `t=60ms`; a 2008 endpoint starts at `t=108ms`. The visual reading is "endpoints fall into their stratigraphic position in chronological order — newest first, oldest last."
- **After all settle**: edges fade in (opacity 0 → 1) over `dur-slow` (320ms).

### A9 — graph node hover/selection

- **Hover**: 200ms `ease-instrument` brighten of node stroke (1.0 → 1.2× saturation). Specimen-id label pops in (opacity 0 → 1, translateY 4 → 0) over 120ms.
- **Selection**: the 2px `blueprint` ring expands from radius (node_radius) to (node_radius + 4) over 200ms `ease-instrument`. Other edges drop to 0.1 opacity over 320ms. Other nodes drop to 0.5 opacity over 320ms.
- **Deselection**: reverse, 200ms.

### A10 — fault-line propagation (blast-radius mode)

- **Trigger**: `uiStore.graphMode = "blast_radius"` and BlastRadius data is loaded.
- **Sequence**:
  1. The origin node pulses (continuous; see A11).
  2. After 200ms delay, layer-0 fault edges animate in. Each edge: `stroke-dasharray` starts at `0 length`, animates to `length 0` over 300ms with `ease-decay`. Visually: the crack draws from origin to target.
  3. After each layer-N completes, layer-(N+1) starts with a 240ms delay.
  4. As an edge reaches a node, that node's stroke updates from its original color to `critical` over 200ms.
  5. After all edges drawn, the summary panel slides in from below: `translateY(100%) → 0` over 320ms `ease-instrument`.

### A11 — blast-radius origin pulse

- **What**: a `critical` ring expands outward from the origin node.
- **CSS** (SVG):
  ```svg
  <circle cx="..." cy="..." r="0" fill="none" stroke="var(--critical)" stroke-width="2">
    <animate attributeName="r" from="0" to="64" dur="2.4s" repeatCount="indefinite" />
    <animate attributeName="opacity" from="0.6" to="0" dur="2.4s" repeatCount="indefinite" />
  </circle>
  ```
- **Duration per cycle**: 2.4s. Repeats indefinitely while blast-mode is active.

### A12 — decay-drift (critical specimen cards)

- **What**: a very subtle vertical sway (±1px) combined with a ±0.1° tilt around the current tilt baseline.
- **CSS**:
  ```css
  @keyframes decay-drift {
    0%, 100% { transform: translateY(0)    rotate(var(--decay-tilt)); }
    50%      { transform: translateY(-1px) rotate(calc(var(--decay-tilt) - 0.1deg)); }
  }
  .decay-drift { animation: decay-drift 7s ease-in-out infinite; }
  ```
- **Duration**: 7s per cycle. Slow enough that it doesn't read as motion at a glance, but fast enough that a long look perceives it.
- **Applied to**: only the critical hero card on the Command Center, and to selected critical specimen cards in the inventory. **NOT** applied to: cards in the top-risk list (they share borders; drift would create visual chaos). **NOT** to: inventory rows in bulk (same reason).

### A13 — disconnect pulse

- **What**: the connection indicator dot (5px) pulses opacity 1.0 → 0.4 → 1.0 over 1.2s `ease-in-out`.
- **Stops when**: WS reconnects.

### A14 — banner crossfade (disconnect / reconnect)

- **In**: opacity 0 → 1 + translateY(-4) → 0 over `dur-base` (200ms) `ease-instrument`.
- **Out**: reverse.

### A15 — toast (scan complete, action success)

- **In**: translateY(8) → 0 + opacity 0 → 1 over 240ms `ease-instrument`.
- **Hold**: 3.6s.
- **Out**: opacity 1 → 0 over 320ms.
- **Position**: bottom-right of viewport, 16px from edges. Max width 360px.
- **Style**: `stratum-raised` bg, 1px `hairline` border, 12px padding, 12px mono 400 `bone`. The leading symbol (`✓` for success, `▲` for error) in the matching color.

### A16 — chip toggle

- **What**: background fills from `stratum` to the matching wash; the bottom accent bar (3px tall) animates width from 0 → 100% over 200ms `ease-instrument`.
- **No bounce, no scale.**

### A17 — button hover / press

- **Hover**: background fill (`tar` → matching wash) over 120ms `ease-instrument`. Border color brightens.
- **Press**: `transform: translateY(1px)` instantly. Released: back to 0 over 80ms.
- **No scale, no glow.**

---

## prefers-reduced-motion

If the user has set `prefers-reduced-motion: reduce`, all transient motion is reduced:

- A1 (counter climb): no tween — number snaps to final value.
- A3 (depth-sweep): disabled. The active stratum is indicated by its solid `blueprint` fill only.
- A4 (scan-feed line entry): no fade — lines appear instantly.
- A6 (typewriter): no streaming — narrative renders all at once.
- A8 (graph nodes settle): no fall — nodes appear at their target positions.
- A10/A11 (blast-radius propagation, pulse): replaced by an instant render of the fault path (no draw animation, no pulse).
- A12 (decay-drift): disabled. Critical cards still tilt and have the scanline overlay, but don't drift.
- A13 (disconnect pulse): disabled — the indicator just shows the static color.

Ambient loops (caret-blink, depth-sweep, decay-drift) are paused; transient animations (drawer slide-in, fade-in, button hover) keep their durations but the content snaps instead of animating where reasonable.

Implementation: a `@media (prefers-reduced-motion: reduce)` block in `globals.css` that disables the affected animations and a single hook `useReducedMotion()` (from framer-motion) that the frontend reads to short-circuit JS-driven motion.

---

## acceptance criteria

- [ ] Every animation listed above is implemented at its specified duration and easing.
- [ ] `prefers-reduced-motion` is honored across all 17 animations.
- [ ] No animation runs longer than 2.4s repeating, except the 7s decay-drift loop (which is deliberately slow).
- [ ] No parallax, no scroll-driven motion, no background-image animation.
- [ ] The only ambient loops are caret-blink, depth-sweep, decay-drift, and disconnect-pulse. Everything else is event-triggered.
