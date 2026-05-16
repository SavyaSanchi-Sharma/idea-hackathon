# FRONTEND_MIGRATION_BRIEF

This is the prescription for the frontend UI agent. The design system has been redone: a forensic / stratigraphic identity called **STRATA**. Every existing screen needs to be migrated. This brief lists the **exact** code changes — which files to delete, rewrite, keep — and ends with a verification checklist.

**Read `identity.md` first** before executing. The motifs (grid, box-drawing, specimen-ids, instrument readouts, decay edges, depth meter, field-notes typewriter, stratigraphic graph) are non-negotiable.

---

## table of contents

1. [Dependency changes](#1-dependency-changes)
2. [Per-file disposition](#2-per-file-disposition)
3. [Step-by-step migration order](#3-step-by-step-migration-order)
4. [Component-by-component implementation notes](#4-component-by-component-implementation-notes)
5. [Wow-moments — implement these with care](#5-wow-moments--implement-these-with-care)
6. [Fixture content update](#6-fixture-content-update)
7. [Verification checklist](#7-verification-checklist)

---

## 1. dependency changes

### add

```bash
npm install -E @fontsource/ibm-plex-mono@5.1.1 @fontsource/ibm-plex-sans@5.1.1
npm install -E d3-zoom@3.0.0 d3-selection@3.0.0
```

- `@fontsource/ibm-plex-mono` / `@fontsource/ibm-plex-sans` — the new typefaces.
- `d3-zoom` + `d3-selection` — needed by the stratigraphic graph for zoom/pan. We do **not** add a force-graph library because we use a fixed-position layout.

### remove

```bash
npm uninstall @fontsource/inter @fontsource/jetbrains-mono
```

- Both are explicitly forbidden by the new design (see `identity.md` anti-patterns).
- The previous brief mentioned `react-force-graph-2d`; that was never installed (`package.json` confirms). Good — do not install it now.

### keep (no changes)

- `@tanstack/react-query`, `framer-motion`, `lucide-react`, `react`, `react-dom`, `react-router-dom`, `recharts`, `zustand`, `clsx`, `tailwind-merge`.
- Recharts is still used for the 90-day traffic sparkline in the endpoint drawer's signals grid. Don't remove it.
- Framer-motion is used for the counter climb, drawer slide-in, scan-feed line entry, blast-radius propagation, and graph node settle. Don't remove it.

---

## 2. per-file disposition

### keep unchanged

| file | status |
|---|---|
| `src/main.tsx` | keep |
| `src/App.tsx` | keep (the route table doesn't change) |
| `src/api/client.ts`, `endpoints.ts`, `websocket.ts` | keep (data model unchanged) |
| `src/store/liveStore.ts`, `uiStore.ts` | keep |
| `src/hooks/*.ts` | keep |
| `src/types/models.ts` | keep (data model is unchanged per `FRONTEND_IMPLEMENTATION_SPEC.md`) |
| `src/lib/cn.ts`, `format.ts` | keep |
| `src/vite-env.d.ts` | keep |

### rewrite (overwrite contents — old visual logic does not apply)

| file | what to rewrite |
|---|---|
| `src/styles/globals.css` | replace `@fontsource/inter` + `@fontsource/jetbrains-mono` imports with the IBM Plex imports listed in `typography.md`. Add `font-variant-ligatures: none` to the body. Update the `*` border-color default to `var(--hairline)`. Add `font-family: var(--font-mono)` to body. Add the `prefers-reduced-motion` block from `motion.md`. |
| `tailwind.config.ts` | replace the entire `theme.extend` block with the content of `design/tailwind.tokens.js`. Keep `darkMode: "class"` and the `content` array. Remove the old method-* / status-* / accent-* colors that are now replaced by the new naming. |
| `src/components/shell/NavRail.tsx` | rewrite per `command-center.md` global shell section. Use Unicode glyphs (`▼ ◇ ▣ ▷`) not Lucide icons. Add tooltips. |
| `src/components/shell/TopBar.tsx` | rewrite per `command-center.md` global shell section. Add the dual-line title (page-title + sediment subtitle), the search input with the `path ·` placeholder, the primary `run discovery scan` button, the connection indicator. |
| `src/components/shell/ConnectionIndicator.tsx` | rewrite per `components.md` §16. Add the pulse animation for the disconnected state. |
| `src/components/common/Badge.tsx` | rewrite per `components.md` §1 (classification badge — adds a leading `●` shape) and §2 (risk-tier badge — adds a leading `◆` shape). Accept a `variant` prop: `"classification" \| "tier"`. |
| `src/components/common/MethodPill.tsx` | rewrite per `components.md` §3. Mono 10/1/600 uppercase. Use the new method-color tokens. |
| `src/components/common/MetricCard.tsx` | rewrite per `components.md` §7. Add the `n =` instrument readout, the share-of-total bar, the delta line, and the decay variants (active/deprecated cards stay crisp; orphaned card uses dashed-stipple SVG border; critical card adds scanline overlay + `transform: rotate(-1.2deg)` + solid critical border). |
| `src/components/common/ScoreMeter.tsx` | rewrite per `components.md` §5. Three-quarter SVG arc, 88px diameter (drawer) or 56px (inline), tier color, tabular score inside. |
| `src/components/common/FactorBar.tsx` | rewrite per `components.md` §6. Add the weight label, value-driven fill color (active/medium/high/critical band), the integer-tick marks on the track, the one-line detail string. |
| `src/components/command-center/CounterStrip.tsx` | rewrite per `command-center.md` strip α. This becomes the **depth meter** — not a generic progress bar. 132px tall, four stratum bands with their own bars and status readouts, the `n =` counter with the registry-baseline readout, the Δ line. Animation: the `depth-sweep` keyframe on the active stratum band. |
| `src/components/command-center/ClassificationCards.tsx` | rewrite per `command-center.md` strip β. Four cards in a row, gap 16px, applying decay variants to the orphaned and critical cards. |
| `src/components/command-center/TopRiskList.tsx` | rewrite per `command-center.md` strip γ left. The list is **specimen cards** (use a new `<SpecimenCard>` atom; see below), 6 cards stacked with shared borders. |
| `src/components/command-center/ScanFeed.tsx` | rewrite per `command-center.md` strip γ right. Add the `┌─ depth scan / {ts} ─` box-drawing header. Line prefixes: `├╴` / `└╴` / `╳╴`. Add the `↓ jump to latest` button on manual scroll-up. |
| `src/components/detail/EndpointDrawer.tsx` | rewrite per `endpoint-detail.md`. Width 520px (was 480). Header decay-edge encoding. Box-drawing frame for the field-notes block. |
| `src/components/detail/PostureBlock.tsx` | rewrite per `endpoint-detail.md` posture-block section. New `<ScoreMeter>` on the left, 5 `<FactorBar>`s on the right. |
| `src/components/detail/ThreatNarrative.tsx` | rewrite per `endpoint-detail.md` field-notes block. Box-drawing frame (header `┌─ field notes / zh-NNNN ─`, left side `│` chars, bottom `└─`). Body in **IBM Plex Sans 14/1.65** with 22ms ± 6ms typewriter. Trailing `▮` caret. `(skip ▶)` link in top-right. |
| `src/components/detail/SignalsGrid.tsx` | rewrite per `endpoint-detail.md` signals-grid section. Two-column key/value, with the `n = N ± M` readout pattern, the `Δ` for trend, the recharts sparkline (90d, no axes, no tooltip, stroke `blueprint`). |
| `src/components/inventory/FilterBar.tsx` | rewrite per `inventory.md` filter-rail section. Four labeled rows (classification/tier/source/sort) of chips. Each chip in the new style with the matching wash + bottom accent bar. |
| `src/components/inventory/EndpointTable.tsx` | rewrite — but this is NOT a `<table>` anymore. It's a stacked list of **horizontal specimen cards** (see `inventory.md`). The component should be renamed conceptually to `<SpecimenCatalog>` — keep the file name for git history continuity, but the implementation is a list. |
| `src/pages/CommandCenter.tsx` | rewrite per `command-center.md`. Three full-bleed strips, no margins between them. |
| `src/pages/Inventory.tsx` | rewrite per `inventory.md`. |
| `src/pages/Landscape.tsx` | rewrite per `landscape-graph.md`. This is a major rewrite — the previous file likely contained scaffolding for force-graph or was empty. Implement the stratigraphic SVG layout. |
| `src/pages/Reports.tsx` | minimal stub for now. Just a centered `compliance reports — phase 3, not yet implemented` line in mono. |

### create (new files)

| file | purpose |
|---|---|
| `src/components/common/SpecimenCard.tsx` | the signature atom from `components.md` §4. Three-row layout (header / body / footer) with classification-driven decay variants. Used by `TopRiskList` and `EndpointTable`/`SpecimenCatalog`. |
| `src/components/common/SpecimenFrame.tsx` | the SVG-bordered wrapper that renders controllable dashed/stipple borders for decay encoding (CSS `border-style: dashed` is uncontrollable cross-browser). Wraps any content with a precise `stroke-dasharray` border. Used by `SpecimenCard` and `MetricCard`. |
| `src/components/common/BoxFrame.tsx` | utility component that renders a `┌─ {label} ─...` box-drawing header line with the children below and an optional `└─...` bottom line. Used by `ScanFeed`, `ThreatNarrative`, the blast-radius summary panel, the legend. |
| `src/components/common/InstrumentReadout.tsx` | renders the `<label> = <value> [unit]` pattern with the label in `sediment` and the value in `bone`, tabular-nums. Props: `label`, `value`, `unit?`, `valueColor?`. Used everywhere. |
| `src/components/common/SpecimenId.tsx` | a `<span>` with the `.specimen-id` class. Props: `id: string`. Renders lowercased `zh-NNNN`. |
| `src/components/command-center/DepthMeter.tsx` | the stratigraphic depth-scan meter from `command-center.md` strip α. New file (replaces / extends the role of the old `CounterStrip`). |
| `src/components/graph/StratigraphicGraph.tsx` | the main graph component per `landscape-graph.md`. SVG-based, fixed `(service-lane, birth-year)` layout, with d3-zoom for pan/zoom. |
| `src/components/graph/GraphLegend.tsx` | per `components.md` §15. Toggle-collapsible. Swaps content based on `uiStore.graphMode`. |
| `src/components/graph/GraphControls.tsx` | filter chips + path search + the reset/fit buttons. |
| `src/components/graph/BlastRadiusOverlay.tsx` | the fault-line propagation overlay + summary panel per `blast-radius.md`. |
| `src/components/common/FilterChip.tsx` | (if not already present) the chip atom from `components.md` §13, used by both Inventory and Landscape filter rails. |

### delete

None. The existing scaffolding is structurally correct; we are rewriting contents in place. **Do not delete any TypeScript files** — keep the file paths so the React Query keys and route components don't need re-wiring.

(There is no `src/components/graph/` content yet — the folder will be populated, not replaced.)

---

## 3. step-by-step migration order

Follow this order to avoid broken intermediate states. The frontend should typecheck and run at every step.

### step 1 — design system substrate

1. `npm install` the new fonts; uninstall the old.
2. Replace `src/styles/globals.css` per spec.
3. Replace `tailwind.config.ts` `theme.extend` with `design/tailwind.tokens.js`. **Keep the surrounding config structure** (the `content`, `darkMode`, etc.) as it is — only swap the theme.
4. Run `npm run typecheck`. Fix any type errors caused by removed color names (the old `status-active`/`status-deprecated`/`status-orphaned`/`accent-interactive` Tailwind classes will be referenced in old components — temporarily acceptable, they will be removed in steps 2-5).
5. Run `npm run dev`. The app should still render — visually broken (colors mismatched) but functional.

### step 2 — atoms

Build the new atoms in this order. Each one should be unit-renderable in isolation.

1. `SpecimenId.tsx` (trivial — 5 minutes)
2. `InstrumentReadout.tsx` (trivial)
3. `BoxFrame.tsx`
4. `SpecimenFrame.tsx` (the SVG-bordered wrapper; ~80 lines)
5. `Badge.tsx` rewrite (add the `variant: "classification" | "tier"` prop, add leading `●` / `◆` shapes)
6. `MethodPill.tsx` rewrite
7. `FilterChip.tsx` (per `components.md` §13)
8. `MetricCard.tsx` rewrite (uses `SpecimenFrame` for the decay variants)
9. `ScoreMeter.tsx` rewrite
10. `FactorBar.tsx` rewrite
11. `SpecimenCard.tsx` (the signature atom; uses `SpecimenFrame` for decay, `Badge`, `MethodPill`, `SpecimenId`, `InstrumentReadout`)

### step 3 — shell

1. `ConnectionIndicator.tsx`
2. `NavRail.tsx`
3. `TopBar.tsx`

### step 4 — Command Center (MVP screen 1)

1. `DepthMeter.tsx` (new file — the strip α)
2. `ClassificationCards.tsx` rewrite (the strip β)
3. `TopRiskList.tsx` rewrite (the strip γ left)
4. `ScanFeed.tsx` rewrite (the strip γ right)
5. `CommandCenter.tsx` rewrite (composes the three strips)

After this, run the full app and verify the Command Center matches the redline. This is the demo-critical screen.

### step 5 — Endpoint drawer (MVP screen 2)

1. `PostureBlock.tsx` rewrite
2. `ThreatNarrative.tsx` rewrite (with the typewriter logic)
3. `SignalsGrid.tsx` rewrite
4. `EndpointDrawer.tsx` rewrite (composes header + posture block + classification reasoning + threat narrative + signals + recommended action)

### step 6 — Inventory (MVP screen 3)

1. `FilterBar.tsx` rewrite (uses `FilterChip`)
2. `EndpointTable.tsx` rewrite (renders as a stacked list of `SpecimenCard`s — the file name is preserved for git, but it's no longer a `<table>`)
3. `Inventory.tsx` rewrite

### step 7 — Landscape graph (differentiator)

1. `GraphControls.tsx`
2. `GraphLegend.tsx`
3. `StratigraphicGraph.tsx` (the main work — SVG layout, d3-zoom)
4. `Landscape.tsx` rewrite (composes the graph + controls + legend)

### step 8 — Blast radius mode

1. `BlastRadiusOverlay.tsx`
2. Wire `Landscape.tsx` to switch overlay based on `uiStore.graphMode`.

### step 9 — final polish

1. Verify all states from `states.md` for every screen.
2. Verify all motion from `motion.md` runs at the right durations.
3. Verify `prefers-reduced-motion` is honored.
4. Verify keyboard navigation and ARIA live regions.

---

## 4. component-by-component implementation notes

### globals.css — required imports & resets

```css
@import "../../../design/tokens.css";
@import "@fontsource/ibm-plex-mono/400.css";
@import "@fontsource/ibm-plex-mono/500.css";
@import "@fontsource/ibm-plex-mono/600.css";
@import "@fontsource/ibm-plex-mono/700.css";
@import "@fontsource/ibm-plex-mono/400-italic.css";
@import "@fontsource/ibm-plex-sans/400.css";
@import "@fontsource/ibm-plex-sans/400-italic.css";

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html, body, #root {
    height: 100%;
    background: var(--tar);
    color: var(--bone);
    font-family: var(--font-mono);   /* MONO IS THE DEFAULT */
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    font-weight: 400;
    font-variant-ligatures: none;     /* kill Plex Mono ligatures */
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  main {
    background-color: var(--tar);
    background-image: radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0);
    background-size: 8px 8px;
  }

  *, *::before, *::after {
    border-color: var(--hairline);
  }

  :focus-visible {
    outline: none;
    box-shadow: var(--focus-ring-offset);
  }

  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: var(--tar); }
  ::-webkit-scrollbar-thumb { background: var(--hairline-strong); border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--trench); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### tailwind.config.ts — minimal scaffold

```ts
import type { Config } from "tailwindcss";
import strataTheme from "../design/tailwind.tokens.js";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: strataTheme.theme,
};

export default config;
```

(`strataTheme.theme.extend` is used by Tailwind via the `theme` key. If the spread above doesn't work cleanly in TS, manually inline the contents of `tailwind.tokens.js` into the `theme` object — but prefer the import so future token changes propagate without re-edits.)

### SpecimenFrame — controllable dashed borders

The component renders an absolutely-positioned SVG `<rect>` as the panel's border, with `stroke-dasharray` driven by props. Children are layered above.

```tsx
type DecayStyle = "solid" | "deprecated" | "orphaned" | "critical";

function SpecimenFrame({
  decay = "solid",
  tilt = 0,
  scanline = false,
  stipple = false,
  children,
  className,
}: { decay?: DecayStyle; tilt?: number; scanline?: boolean; stipple?: boolean; children: React.ReactNode; className?: string }) {
  const strokeMap = {
    solid:      { color: "var(--hairline)",          dash: "" },
    deprecated: { color: "var(--decay-deprecated)",  dash: "8 6" },
    orphaned:   { color: "var(--decay-orphaned)",    dash: "2 4" },
    critical:   { color: "var(--decay-critical)",    dash: "" },
  };
  const { color, dash } = strokeMap[decay];

  return (
    <div
      className={cn("relative bg-stratum", className)}
      style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full pointer-events-none"
        preserveAspectRatio="none"
      >
        <rect
          x="0.5" y="0.5"
          width="calc(100% - 1px)" height="calc(100% - 1px)"
          fill="none"
          stroke={color}
          strokeWidth="1"
          strokeDasharray={dash}
        />
      </svg>
      {scanline && <div className="overlay-scanline absolute inset-0 pointer-events-none" />}
      {stipple && <div className="overlay-stipple absolute inset-0 pointer-events-none" />}
      <div className="relative">{children}</div>
    </div>
  );
}
```

(Note: SVG `<rect>` with percentage width/height needs care — adjust to `width="100%"` minus stroke; or render the SVG with `viewBox` matching the container's bounds via a `ResizeObserver`. The simplest reliable approach: a `<div>` with `border` for the solid + critical cases, and the SVG path approach only for the dashed cases.)

### DepthMeter — the stratigraphic counter

Drives the discovery counter, the four stratum bands, the Δ line, the `depth-sweep` animation on the active stratum. Reads from `liveStore.progress`, `liveStore.liveStats`, and `useQuery(["summary"])`. See `command-center.md` for layout.

Mapping `scan_progress.progress` (0-100) to a current depth (year):

```ts
function progressToDepth(progress: number): { stratumIndex: number; year: number; status: "queued" | "active" | "complete" } {
  // 0-25%   → stratum 0 (2024–2026), present → 2024
  // 25-50%  → stratum 1 (2018–2023), 2023 → 2018
  // 50-75%  → stratum 2 (2011–2017), 2017 → 2011
  // 75-100% → stratum 3 (pre-2010), 2010 → 2008
  // ...
}
```

The four `<StratumBar>` instances each receive `{ stratumIndex, currentDepth, status }` and render accordingly.

### ThreatNarrative — the typewriter

Use `useEffect` to walk the `threat_narrative` string char-by-char, appending to a state buffer. Random jitter per tick:

```ts
useEffect(() => {
  if (!narrative) return;
  let i = 0;
  let cancelled = false;
  function tick() {
    if (cancelled) return;
    setDisplayed(narrative.slice(0, i + 1));
    i++;
    if (i < narrative.length) {
      const jitter = (Math.random() * 12) - 6; // ±6ms
      setTimeout(tick, 22 + jitter);
    } else {
      setIsStreaming(false);
    }
  }
  setIsStreaming(true);
  setDisplayed("");
  tick();
  return () => { cancelled = true; };
}, [narrative]);
```

Render the caret `<span className="caret-blink"`>▮</span>` only when `isStreaming` is true.

### StratigraphicGraph — fixed-position SVG layout

Pseudo-code outline:

```tsx
function StratigraphicGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const LANES = ["auth", "core", "payments", "upi", "imps", "neft", "rtgs", "kyc", "aml", "cards", "internal", "legacy"];
  const STRATA = [
    { range: [2024, 2026], label: "2024" },
    { range: [2020, 2023], label: "2020" },
    { range: [2017, 2019], label: "2017" },
    { range: [2014, 2016], label: "2014" },
    { range: [2011, 2013], label: "2011" },
    { range: [1990, 2010], label: "pre-2010" },
  ];

  const positioned = useMemo(() => nodes.map(n => {
    const laneIdx = LANES.indexOf(n.metadata.service_lane as string);
    const x = LANE_X[laneIdx] + jitter(n.id);
    const y = yearToY(n.metadata.birth_year as number);
    return { ...n, x, y };
  }), [nodes]);

  // d3-zoom on a top-level <g> for pan/zoom.
  // Each node rendered as <NodeShape n={node} />.
  // Edges rendered as <path d={cubicCurve(source, target)} />.
}
```

The `service_lane` and `birth_year` for each `GraphNode` come from `node.metadata`. **Update the backend type signature `GraphNode.metadata` to include these fields explicitly** (already `Record<string, unknown>` per the model, so no schema break is needed — but the backend mock data / fixture must populate them).

If the backend doesn't yet provide `service_lane`, derive it from the endpoint's `service` field (e.g., `upi-gateway` → `upi`, `core-banking-internal` → `core`). The frontend can keep a heuristic mapping until the backend formalizes it.

---

## 5. wow-moments — implement these with care

These four moments are the demo-critical ones. The judge will photograph these.

### wow #1 — the stratigraphic depth meter (CommandCenter strip α)

This is the screen the judge sees first. The depth meter must:

- Show the counter as an instrument readout `n = 281` (not `281`).
- Show the four stratum bands with year labels.
- During a scan, animate the active stratum's bar with the `depth-sweep` motion.
- On complete, all four bands settle to 100% with the `complete · N zombies` readout where zombies > 0.
- Replace the previous generic progress bar entirely.

If only one of the four wow-moments is fully implemented for the demo, make it this one.

### wow #2 — the field-notes typewriter (Drawer)

When the drawer opens, the narrative streams character-by-character at 22ms ± 6ms, framed by box-drawing chars (`┌─ field notes / zh-NNNN ─`), with a blinking `▮` caret in `blueprint`. The body is in **Plex Sans**, the frame is in **Plex Mono** — a deliberate type-voice shift that says *"this part is the AI reasoning, the rest is the instrument"*.

### wow #3 — the specimen catalog as decayed cards (Command Center top-risk + Inventory)

The top-risk list and the Inventory render endpoints as horizontal specimen cards that **physically look damaged** based on classification: dashed borders for deprecated, broken-stipple for orphaned, scanline + tilted for critical. The single highest-risk card on the Command Center uses the stronger `-1.2°` tilt. This makes "zombie" a visual fact, not just a label.

### wow #4 — the stratigraphic cross-section graph (Landscape)

Replaces the lazy force-directed cloud with a fixed `(service, birth-year)` cross-section where zombies are literally buried in the deeper strata. Crossing edges are the high-signal dependencies. On blast-radius mode, fault lines propagate outward and crack through the strata. The legend confesses the encoding.

---

## 6. fixture content update

The fixture file (`src/api/fixtures.ts`) currently mirrors the data model but uses sterile / generic endpoint paths. Replace with banking-authentic content. The top-risk fixture **must** include these six specimens (also listed in `command-center.md`):

| specimen | endpoint | classification | tier | score | service | team | birth |
|---|---|---|---|---|---|---|---|
| zh-0142 | `GET /legacy/upi/collect-v1` | orphaned | critical | 92 | upi-gateway | payments-legacy | 2014 |
| zh-0817 | `GET /internal/core/account-balance` | orphaned | critical | 87 | core-banking-internal | (none) | 2009 |
| zh-2049 | `POST /legacy/kyc/aadhaar-verify-v2` | orphaned | high | 78 | kyc-services | onboarding-legacy | 2016 |
| zh-1188 | `PUT /internal/aml/screen` | deprecated | medium | 64 | aml-services | risk | 2018 |
| zh-0509 | `POST /legacy/imps/p2p-transfer` | orphaned | high | 72 | imps-rails | payments-legacy | 2015 |
| zh-3471 | `DELETE /legacy/auth/session-token` | orphaned | high | 70 | auth-edge | identity | 2012 |

Plus ~275 additional specimens to populate the inventory and graph at credible scale — a mix of:

- `active` specimens for current systems: `POST /v2/upi/collect`, `POST /v1/imps/transfer`, `POST /v1/neft/initiate`, `POST /v1/rtgs/transfer`, `POST /v1/kyc/aadhaar/verify`, `POST /v1/aml/screen`, `GET /v1/cards/balance`, `POST /v1/cards/payment`, `GET /v1/accounts/{id}`, `POST /v1/auth/oauth2/token`, etc.
- `deprecated` specimens for transitional endpoints: `/v1/upi/collect-deprecated`, `/v2/kyc/aadhaar-old`, `/v1/aml/screen-batch-v1`, etc.
- `orphaned` (zombie) specimens for legacy: `/legacy/...`, `/internal/...`, `/v1/cron/eod-batch`, `/v1/admin/raw-query`, `/v1/debug/log-dump`, etc.

For each, generate a `threat_narrative` of 120-220 words referencing real banking patterns (UPI handler vulnerabilities, KYC PII exposure, IMPS batch-mode attacks, NPCI rail compromise paths) — see `docs/ps-understanding-2.md` for vocabulary.

For graph metadata, populate `node.metadata.service_lane` (one of the 12 lanes) and `node.metadata.birth_year` (1990-2026) for every endpoint node. The frontend's `StratigraphicGraph` reads these directly.

---

## 7. verification checklist

A frontend implementation is "done" when **every** item below passes. Run through this in order — earlier items are prerequisites for later ones.

### substrate

- [ ] `npm install` succeeded with `@fontsource/ibm-plex-mono`, `@fontsource/ibm-plex-sans`, `d3-zoom`, `d3-selection`. `@fontsource/inter` and `@fontsource/jetbrains-mono` are NOT in `package.json` anymore.
- [ ] `npm run typecheck` passes with zero errors.
- [ ] `npm run build` passes.
- [ ] The browser dev server runs and the app loads.
- [ ] The body has `font-family: var(--font-mono)` (IBM Plex Mono) as the default. Inspect the body in DevTools.
- [ ] `<main>` shows the dotted grid backdrop. Inspect — the 8px dots should be faintly visible.
- [ ] No element on any screen uses Inter, JetBrains Mono, or any other typeface than Plex Mono / Plex Sans.

### tokens

- [ ] `tailwind.config.ts` references the new color names (`tar`, `stratum`, `bone`, `active`, `deprecated`, `orphaned`, `critical`, `blueprint`) and the old names (`status-active`, `accent-interactive`, etc.) do not exist in the compiled CSS.
- [ ] WCAG contrast verified: open a screen with text on `tar` and run an axe scan. All text passes AA.
- [ ] All four `prefers-reduced-motion` overrides work — set it via DevTools and verify animations don't run.

### shell

- [ ] Nav rail uses Unicode glyphs (`▼ ◇ ▣ ▷`), not Lucide icons. Hover shows the tooltip.
- [ ] Top bar shows the page-title + sediment subtitle (the route's name with a `· depth scan`-like qualifier).
- [ ] Top bar's search input has the `path · ` leading prefix in `sediment` color.
- [ ] The primary `run discovery scan` button is lowercase, bordered in `blueprint`, with no fill in idle. Hovering fills with `blueprint-wash`. Pressing `R` triggers it.
- [ ] Connection indicator shows the colored dot + URL + status + last-event-age, in mono.

### Command Center

- [ ] Three strips with no margin between them.
- [ ] Strip α: depth meter with the `n =` counter (not `281` bare), `Δ = +34 unknown endpoints recovered`, four stratum bands with year labels, the active stratum has the `depth-sweep` animation during a scan.
- [ ] Strip β: four metric cards. Orphaned card has the broken-stipple dashed border. Critical card has the scanline overlay + −1.2° tilt + solid critical border. Active and deprecated cards are crisp.
- [ ] Strip γ left: 6 specimen cards stacked with shared borders (no gap between cards). The first card (highest risk) uses the stronger −1.2° tilt; subsequent critical cards use the standard −0.6° tilt.
- [ ] Strip γ right: scan feed has the `┌─ depth scan / {ts} ─` header. Line prefixes are `├╴` (info), `╳╴` (critical), `└╴` (most recent). New lines fade in at 120ms.
- [ ] The scan feed auto-scrolls; manual scroll-up shows the `↓ jump to latest` button.
- [ ] On scan-complete: counter tweens (800ms), metric cards counter-climb (800ms), delta lines fade in after 120ms delay, toast appears bottom-right for 4s.

### Endpoint drawer

- [ ] Drawer slides in from right at 520px width, 260ms `ease-instrument`.
- [ ] Header has a 3px-wide left edge in the matching decay style (dashed for orphaned, solid bruise for critical).
- [ ] Critical specimens: the entire header gets the `.overlay-scanline`.
- [ ] Posture arc is 88px diameter, three-quarter sweep, tier color, with the tabular score inside.
- [ ] Five factor bars: each shows weight (`weight 0.25`), value (`8.2 / 10` with `/ 10` in `sediment`), and the one-line detail.
- [ ] Classification reasoning renders as `├╴` / `└╴` / `╳╴` tree lines, final line is `classification = {value} · confidence {N.NN}`.
- [ ] Field notes block: box-drawing header `┌─ field notes / zh-NNNN ─`, left-side `│` rail, body in IBM Plex Sans 14, streaming at 22ms ± 6ms per char, trailing `▮` caret in `blueprint` that blinks and disappears on complete.
- [ ] Signals grid: two-column key/value, with `n = N ± M` for calls(30d), `Δ = −94.0%` for trend, recharts sparkline for 90d traffic with no axes/tooltip.
- [ ] Recommended action: `◆ {tier} → {action}` line + primary button + `show blast radius ▣` secondary.
- [ ] `Esc` closes drawer; focus returns to triggering element.

### Inventory

- [ ] Filter rail has four labeled rows (classification, tier, source, sort) of chips with counts in `n=NNN` pattern.
- [ ] Catalog renders specimen cards stacked with shared borders.
- [ ] Orphaned rows have the broken-stipple dashed border; critical rows have the scanline overlay and the −0.2° (reduced) tilt.
- [ ] Row click opens the drawer.
- [ ] Pagination shows `page X / Y   ◀  ▶`.
- [ ] "showing n = N of M" readout uses the instrument pattern.

### Landscape graph

- [ ] Graph uses a fixed `(service-lane, birth-year)` layout — verified by inspecting the SVG and confirming node positions don't change on re-render (no force-directed jitter).
- [ ] X axis: 12 service lanes with mono labels. `legacy` lane label rendered in `deprecated` color.
- [ ] Y axis: 6+ stratum bands with year labels and dotted boundary lines.
- [ ] Endpoint nodes: size by traffic, stroke style by classification (solid/dashed/broken-dashed), critical-tier nodes have a `╳` mark at center.
- [ ] The deeper strata get progressively dimmer (the dust overlay).
- [ ] Intro animation: nodes fall into their strata with a chronological stagger (newest first) over 900ms.
- [ ] Hover shows the specimen-id label; click enters focus mode with blueprint-highlighted edges and dimmed others.
- [ ] Zoom (wheel), pan (drag), `0` (reset), `f` (fit) work.
- [ ] Legend is visible/collapsible.

### Blast-radius mode

- [ ] Activated from the drawer's `show blast radius ▣` button — drawer closes, navigates to `/landscape`, mode is engaged.
- [ ] Origin node pulses (2.4s cycle) with the expanding ring.
- [ ] Fault edges propagate outward in BFS layers, each edge's `stroke-dasharray` animating over 300ms `ease-decay`, 240ms staggered.
- [ ] Reachable nodes adopt `critical` stroke as the fault reaches them.
- [ ] Unreachable nodes/edges drop to 0.12 opacity.
- [ ] Summary panel slides in from below after layer-0 starts. Shows origin specimen, `n ≈ 3.4M records reachable`, downstream systems tree with `╳╴` for write-access lines, `write/delete access in path · YES/NO`.
- [ ] `block now` button calls `POST /api/endpoints/{id}/action`; toast confirms.
- [ ] `Esc` or `exit blast mode` cleanly restores the normal graph view.

### states

- [ ] No spinners anywhere.
- [ ] All skeletons share the unified pulse (`hairline-strong` blocks at 1.2s ease-in-out).
- [ ] Pre-scan empty states show registry-only data with the `(registry only)` caption.
- [ ] During scanning, in-flight numeric values show `n = ··` with an `updating` caption.
- [ ] On disconnect, a banner `▲ connection severed at {ts}. ...` appears in `critical`, data stays visible at 0.85 opacity, exponential backoff reconnects.

### motion

- [ ] All 17 animations from `motion.md` are implemented at the specified durations and easings.
- [ ] `prefers-reduced-motion: reduce` is honored — verified by toggling in DevTools.

### identity

- [ ] No screen has a floating panel with `border-radius >= 4px`.
- [ ] No `box-shadow` exists except the focus ring.
- [ ] No green/amber/red SOC status colors — all status badges use the new active/deprecated/orphaned/critical palette.
- [ ] Every endpoint everywhere has a `zh-NNNN` specimen-id rendered with the `.specimen-id` style.
- [ ] Every number is an instrument readout (`n =`, `Δ =`, `score =`, `t₀ =`, `±`) — there are no bare numeric values in headings or hero positions.
- [ ] Box-drawing characters (`┌ ─ ┐ │ └ ┘ ├ ┤ ╳`) appear in two places per screen, max — the scan feed header and the field-notes header on the drawer; not as decoration.
- [ ] Buttons are lowercase mono (`run discovery scan`, `show blast radius`, `block now`).
- [ ] Color is never the only signal: every status carries a leading shape (●/◆/╳) and a text label.

### banking authenticity

- [ ] Every fixture endpoint uses one of: UPI, IMPS, NEFT, RTGS, KYC, AML, Aadhaar, NPCI, core-banking, cards, auth.
- [ ] All threat narratives reference real banking attack patterns (CVE patterns, OWASP API Top 10, RBI IT-Gov framework, PCI-DSS).
- [ ] No "lorem ipsum", no "Acme Bank", no generic placeholder content.

### final smoke

- [ ] Open the app on a 1440px viewport, no scan run yet. The Command Center reads as an instrument — calm, dense, dotted grid backdrop, registry baseline `n = 247`, three integrated strips.
- [ ] Click `run discovery scan`. The counter climbs, the depth meter sweeps through strata, the feed streams banking endpoints, the four metric cards animate, and orphaned/critical specimens appear with their decay borders. The whole motion sequence takes ~12-18 seconds and reads as a single coherent instrument run.
- [ ] Click the top-risk card `zh-0142`. The drawer slides in, the field-notes typewriter starts streaming. The score arc fills to 92, the factor bars animate, the OWASP and CVE tags render.
- [ ] Click `show blast radius ▣`. The drawer closes, the landscape graph loads with the stratigraphic layout, the fault line propagates outward from `zh-0142` through `core-banking` and `NPCI rails`, the summary panel slides in.
- [ ] Take a screenshot. The screenshot should be describable to a colleague in one sentence: *"the API estate is drawn like a stratigraphic dig site — zombies are buried in the older strata, and the scan drops a depth meter down through the years."*

If that final sentence is true, the migration is done.
