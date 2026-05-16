# typography — the voice of the instrument

One typeface family does ~95% of the work: **IBM Plex Mono**. One narrow exception exists: the threat-narrative paragraph in the endpoint drawer is set in **IBM Plex Sans** because long-form prose at body size in mono fatigues the eye. Both are SIL OFL-licensed and available via `@fontsource/ibm-plex-mono` and `@fontsource/ibm-plex-sans`.

> Why IBM Plex and not JetBrains Mono / Inter / Geist? Three reasons. **(1)** Plex carries a deliberate institutional/banking-mainframe heritage — IBM mainframes literally still run the back end of every major Indian PSB. **(2)** Plex Mono has unusually graceful italics and a true small-cap-shaped specimen, both of which we exploit. **(3)** Avoiding JetBrains Mono and Inter is a deliberate vote against the developer-tool starter pack — that combination is the visual signature of every "another dashboard" we are not.

---

## fonts to import

In `src/styles/globals.css`:

```css
@import "@fontsource/ibm-plex-mono/400.css";
@import "@fontsource/ibm-plex-mono/500.css";
@import "@fontsource/ibm-plex-mono/600.css";
@import "@fontsource/ibm-plex-mono/700.css";
@import "@fontsource/ibm-plex-mono/400-italic.css";
@import "@fontsource/ibm-plex-sans/400.css";
@import "@fontsource/ibm-plex-sans/400-italic.css";
```

Total wire weight: ~110 KB woff2. Acceptable. Remove `@fontsource/inter` and `@fontsource/jetbrains-mono`.

---

## the type scale

All sizes specified in `tokens.css`. Tailwind names match Tailwind's `text-*` recipes.

| name | Tailwind | px / lh / weight | use |
|---|---|---|---|
| counter | `text-counter` | 72 / 1 / 700 | discovery counter strip ONLY |
| page-title | `text-page-title` | 19 / 1.25 / 600 | top bar screen title, drawer header path |
| section-title | `text-section-title` | 14 / 1.4 / 600 | panel headers ("classification", "field notes") |
| body | `text-body` | 13 / 1.55 / 400 | default everything |
| narrative | `text-narrative` | 14 / 1.65 / 400 | **Plex Sans** — threat-narrative paragraph only |
| readout | `text-readout` | 12 / 1.4 / 500 | instrument readouts (`n = 281`) |
| label | `text-label` | 11 / 1.35 / 500 | input labels, panel sub-labels |
| specimen-id | `text-specimen-id` | 11 / 1 / 400 | `zh-NNNN` tags |
| micro | `text-micro` | 10 / 1.3 / 400 | timestamps, axis labels, footnotes |
| depth-marker | `text-depth-marker` | 10 / 1 / 400 | graph Y-axis year labels |

Weights used: **400** (regular), **500** (medium — readouts/labels), **600** (semibold — section titles), **700** (bold — the counter). No 300, no 800, no 900.

---

## the family rule

Two cases. That's it.

### 1. mono everywhere (default)

Set `font-family: var(--font-mono)` on `<body>`. Every screen, every component, every label is mono by default. This is the product's voice. **Mono is the default; you do not need to apply a class to get it.**

### 2. sans for the threat narrative (single exception)

In `components/detail/ThreatNarrative.tsx`, the streaming paragraph body uses **Plex Sans 14/1.65 italic-as-emphasis-only**. The surrounding `┌─ field notes / zh-NNNN ─┐` frame and the box-drawing chars are still mono. The transition between the two is part of the effect — it tells the reader "this part is the synthesized analysis, the rest is the instrument."

Italic Plex Sans is reserved for short emphasis inside the narrative (e.g., *"…the endpoint has not been deployed since…"*). It must never appear in mono contexts.

---

## special-purpose text styles

These are codified as utility classes in `tokens.css` and as components in `src/components/common/`.

### specimen-id

```
zh-0142
```

- Font: `font-mono`
- Size: 11px / 1 / 400
- Color: `sediment-strong` (`#75706A`)
- Letter-spacing: `0.04em`
- Case: lowercase (transformed via CSS, since the JSON id may be uppercase)
- Class: `.specimen-id`
- Usage: above the path in the drawer header; as a caption in top-risk and inventory rows; as the node label on the API Landscape.

### instrument readout

```
n = 281    Δ = −12.0%    score = 92 / 100
```

- Font: `font-mono`
- Size: 12px / 1.4 / 500
- The label glyph (`n`, `Δ`, `score`, `t₀`, `±`) is rendered in `sediment` (`#5A554F`); the value is in `bone` (`#E8E1D0`). Two `<span>`s.
- `font-variant-numeric: tabular-nums` so digits align.
- Class: `.mono-tabular` plus inline color spans.
- Usage: classification metric cards; factor bar weights; counter strip delta; signals grid values.

### field-notes prose

```
This endpoint last received traffic in March 2018, three months
before its original author's last commit to the repository.
```

- Font: `font-sans` (Plex Sans)
- Size: 14px / 1.65 / 400
- Color: `bone`
- No transform. No tracking adjustment.
- Italic emphasis (Plex Sans 400 italic) reserved for short clauses inside.
- Trailing caret: `▮` block char, animated `animation: caret-blink`, color `blueprint`. Removed when streaming completes.
- Component: `<ThreatNarrative />`. The streaming uses `useEffect` to append one char every 22ms ±6ms jitter.

### box-drawing frame

```
┌─ field notes / zh-0142 ──────────────────────────────────
└──────────────────────────────────────────────────────────
```

- Font: `font-mono` (the chars must be monospaced or they break)
- Size: 12px / 1.4 / 400
- Color: `sediment` for the structural chars (`┌ ─ ┐ │ └ ┘ ├ ┤`)
- The label inside the frame (`field notes / zh-0142`) is in `bone-dim`, 12px, 500 weight.
- Maximum **two** box-drawing motifs per screen (rule from `identity.md` M2). On Command Center: the scan feed header is the one. On the drawer: the field-notes header is the one.

### method pill text

```
 GET   POST   PUT   DELETE   PATCH 
```

- Font: `font-mono`
- Size: 10px / 1 / 600
- Letter-spacing: `0.04em`
- Lowercase forbidden — these are HTTP verbs, render exactly as the spec defines (uppercase). This is the ONE place uppercase appears.
- Color: the method color (e.g., `method-get` = `blueprint`).
- Background: 10% wash of the method color.
- Padding: `0 6px`, height `18px`.
- Border-radius: `xs` (2px).

### lowercase command text

ZombieHunter's actions speak in lowercase mono. This is the product's voice (see `identity.md`).

```
run discovery scan        show blast radius
quarantine specimen       generate compliance report
```

- Font: `font-mono`
- Size: 13px / 1 / 500
- Color: depends on button variant (primary: `blueprint` text on `tar` with 1px `blueprint` border; secondary: `bone-dim` on `stratum`).
- No `text-transform: uppercase`. Ever.

---

## what's forbidden

- **Inter** anywhere. The frontend's existing `@fontsource/inter` imports are removed.
- **JetBrains Mono** anywhere. Same — removed.
- **Mixed sans and mono in the same paragraph.** The Plex Sans narrative paragraph is the only sans block; everything around it is mono.
- **Font weight 300 ("light").** Reads as marketing.
- **Letter-spacing wider than `0.04em`** outside specimen-id and method-pill contexts.
- **All-caps text** outside HTTP method pills.
- **`text-transform: uppercase` on buttons or labels.** We use lowercase mono.
- **Decorative ligatures.** `font-variant-ligatures: none` on the body. Plex Mono has stylistic ligatures (`==`, `=>`) that read as developer-tool aesthetic; we disable them.
