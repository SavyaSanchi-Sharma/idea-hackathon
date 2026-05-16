# identity — the design language manifesto

This is the single source of truth for ZombieHunter's visual identity. Every other doc in `/design` is a specialization of what is asserted here. When in doubt, return to this page.

---

## the concept — one sentence

**ZombieHunter is a forensic instrument for the bank's API estate: every endpoint is a specimen, every service is a stratum of accumulated infrastructure, and zombies are buried in the deeper layers waiting to be excavated.**

That is the sentence. Every visual decision in this document follows from it.

## the three principles

### 1. it is an instrument, not a dashboard
The screen reads as a scientific or engineering instrument — the calm precision of a Bloomberg terminal, a seismograph, a stratigraphic borehole log, a museum catalog entry. Not a SaaS dashboard. There is no marketing voice. Numbers have units. Identifiers are coded. Borders are 1px hairlines. Corners are sharp.

### 2. age is a visible structural property
Old infrastructure does not just have a different color label — it *looks structurally older*. Deprecated endpoints have dashed borders (paper turning at the edges). Orphaned endpoints have broken stippled borders (the paper is tearing). Critical orphaned specimens are tilted off the grid by ~0.6° (literally falling off the page) and carry a faint scanline overlay (a damaged photographic plate). Decay is in the shape, not just the swatch.

### 3. every screen confesses its method
Discovery isn't a black box. The instrument shows what it is doing in real time: which depth it has scanned to (`depth = 2014`), which strata are still ahead, what was recovered, when it was last seen. The five-factor score breakdown is visible by default, never hidden behind a chevron. Box-drawing characters frame logs and headers so the user sees the *log structure* of the work being done.

---

## the signature motifs

Eight recurring visual elements form the product's identity. The frontend agent must use each one **where it carries meaning** — and absolutely not elsewhere. Over-application turns the identity into a costume; under-application makes the product generic again.

### M1 — the dotted grid backdrop
A faint dotted grid is painted across the canvas via CSS background-image. 8px base spacing; every 4th dot is slightly brighter. Renders ~3.5% brightness over tar; never dominates content.

- **Use:** as the background of `<main>` on every screen. As the background of the API Landscape graph canvas at the heavier `grid-strata` density.
- **Do NOT use:** inside `stratum` panels. Panels sit *on* the grid, the grid does not bleed into them. This is what gives the instrument its drafted-on-paper feel.
- **Implementation:** `class="bg-grid"` (tokens.css) or Tailwind `bg-grid bg-[length:8px_8px]`.

### M2 — box-drawing characters as identity marks
Real Unicode box-drawing (`┌ ─ ┐ │ └ ─ ┘ ╶ ╴ ├ ┤ ┬ ┴ ┼`) is used selectively in:

- The **scan feed** header: `┌─ depth scan / 2026-05-17T14:32:07Z ──────────────────`
- The **section dividers** between the discovery counter and the metric cards: a single `─` line, full width, in `--sediment` color.
- The **prefix of each scan-feed line**: `├╴` for normal events, `└╴` for the most recent, `╳╴` for critical events. This subtly draws a tree of the scan's progress.

- **Do NOT use:** as decoration in headers that already have a panel border. They are an *additional* mark of identity, not a wrapper around every block. Maximum two box-drawing motifs per screen.
- **Implementation:** literal Unicode in JSX strings. Font is mono (Plex Mono). Color is `sediment` for structural marks, `severity-critical` for `╳╴` lines.

### M3 — specimen IDs
Every endpoint has, in addition to its method+path, a **specimen ID** of the form `zh-NNNN` (lowercase, hyphenated, four digits, hashed from the endpoint id). Examples: `zh-0142`, `zh-0817`, `zh-2049`.

- **Where shown:** above the endpoint path in the drawer header. As a small caption in the top-risk list and inventory rows. As the label on graph nodes in the API Landscape.
- **Style:** `font-mono`, `font-size: 11px`, `color: sediment-strong`, `letter-spacing: 0.04em`, lowercase. The class is `.specimen-id`.
- **Why:** turns each endpoint into a cataloged specimen with provenance. A human can quote a specimen ID in a Slack thread the way a paleontologist quotes a fossil number.

### M4 — instrument readouts (numbers carry units)
Numbers are never bare. They are framed as instrument readings:

| bare (forbidden) | readout (correct) |
|---|---|
| `281` | `n = 281` |
| `92` | `score = 92 / 100` |
| `-94%` | `Δ = −94.0%` |
| `42` | `42 specimens` |
| `2018-03-14` | `t₀ = 2018-03-14   ·   ~7y ago` |
| `3.4 MB` | `payload ≈ 3.4 MB` |
| `97` | `n ≈ 97 ± 4` (when a confidence interval applies) |
| `78%` | `78.0% ± 1.2%` (when known) |

- **Where:** the discovery counter strip, the classification metric cards, the factor bars in the drawer, every traffic/CVE figure.
- **Do NOT use** the readout style inside the threat-narrative paragraph — it interrupts prose. Narrative sentences may use numbers normally.
- **Implementation:** the leading symbol (`n`, `Δ`, `score`, `t₀`) is in `sediment` color; the value is in `bone` color. Use `font-variant-numeric: tabular-nums` so digits align.

### M5 — decay edges
The classification of an endpoint is encoded both in **color** and in the **shape of its border**.

| state | border | extra |
|---|---|---|
| `active` | 1px solid `hairline` | crisp, full opacity |
| `deprecated` | 1px dashed `decay-deprecated` (`#B8854A`); dash pattern `8 6` | opacity 0.92 |
| `orphaned` | 1px dashed `decay-orphaned` (`#C8B068`); dash pattern `2 4` (short, broken) | opacity 0.85, `overlay-stipple` |
| `critical` orphaned | 1px solid `decay-critical` (`#C24545`); panel rotated `--decay-tilt` (−0.6°); `overlay-scanline` | the single highest-risk card on the dashboard uses `--decay-tilt-strong` (−1.2°) |

- **Where:** specimen cards in the top-risk list; specimen cards in inventory; the endpoint drawer header (when classification ≠ active).
- **Do NOT decay** entire screens. The metric cards, scan feed panel, top nav, and depth meter are always crisp regardless of dashboard state. Decay only affects *the things that are themselves decayed*.

### M6 — the depth meter (not a progress bar)
The discovery scan's progress is rendered as a **stratigraphic depth meter**, not a flat progress bar.

- A 48px-tall strip across the top of the Command Center, sub-divided into four labeled strata: `2024-2026` / `2018-2023` / `2011-2017` / `pre-2010`.
- A vertical `▼` indicator drops downward through the strata as the scan progresses, with a thin horizontal line marking the current depth.
- The strata's labels are mono-readouts: `depth = 2014`. Active depth is in `blueprint`; passed depths fade to `sediment-strong`.
- A subtle horizontal sweep animation (`animation: depth-sweep 1.6s linear infinite`) inside the active stratum band signals "scanning".

This is the single biggest "wow" move on the Command Center. The frontend agent must implement this, not a generic progress bar.

### M7 — the field-notes typewriter
The threat-narrative paragraph in the endpoint drawer types out character-by-character (~22ms/char with ±6ms jitter) like a teletype log entry, preceded by a header line drawn with box characters:

```
┌─ field notes / zh-0142 ──────────────────────────────────
│
│  This endpoint last received traffic in March 2018…
│  ▮
└──────────────────────────────────────────────────────────
```

- The `▮` is a blinking block-cursor (`animation: caret-blink`). It disappears when the narrative has finished streaming.
- Font for the narrative body: **IBM Plex Sans 14/1.65** — the only place in the product where sans-serif is allowed.
- This sells the AI-explainability story: the analyst can *watch* the system reason.

### M8 — the stratigraphic cross-section graph
The API Landscape is **not a force-directed graph**. It is a cross-section through the bank's accumulated infrastructure, plotted in two axes:

- **X axis** (horizontal): **service domain** — `auth`, `core`, `payments`, `upi`, `imps`, `neft`, `rtgs`, `kyc`, `aml`, `cards`, `internal`, `legacy`. Roughly 12 vertical lanes.
- **Y axis** (vertical): **time** — present at top (`2026`), going down to `pre-2010` at the bottom. The deeper you go, the older the endpoint.
- **Nodes**: each endpoint is plotted at `(its service lane, its birth year)`. Size by 30-day call volume (small ≈ 4px, large ≈ 16px). Stroke and fill by classification. Specimen ID labels appear on hover and on selected nodes.
- **Edges**: thin (1px) curves connecting `calls` and `depends_on` relationships, drawn with low opacity. Edges that cross multiple strata are visually significant — they are paths from modern systems down into legacy strata.
- **Blast radius mode**: when activated, a `fissure` (red structural break) is drawn from the origin endpoint outward through every reachable node. It crosses strata as a fault line crosses geological layers.

This is the most distinctive screen in the product. The frontend agent must NOT use `react-force-graph-2d` for this. Use D3 or an SVG layout that fixes node positions to `(service, year)`. See `landscape-graph.md` for the redline.

---

## anti-patterns — what this design FORBIDS

The frontend agent must reject any pattern below. These are the moves that turn the product into AI slop.

| forbidden | reason |
|---|---|
| `Inter`, `Geist Sans`, or `JetBrains Mono` as the primary typeface | All three are the developer-tool starter pack. We use IBM Plex Mono / Plex Sans. |
| Mixed sans+mono in the same panel | Voice break. Plex Mono is the voice. Plex Sans appears in exactly one place (the threat-narrative paragraph). |
| SOC green / amber / red status pills | This is the universal SOC convention. We use cyan-white / sepia / bone-yellow / bruise-red. |
| Floating panels with soft shadows or border-radius `≥6px` | Panels are sharp. The drop-shadow scale was deleted. The only shadow is the focus ring. |
| Subtle gradients, glows, or radial accents | Forbidden. The instrument is drafted, not painted. |
| Force-directed graph for the API Landscape | This is the lazy default. We use a fixed stratigraphic layout. |
| Hero numbers without units | Every number is an instrument readout. `281` is forbidden; `n = 281` is correct. |
| Status conveyed by color alone | WCAG. Every status carries a text label or an icon AND a color AND a border style. |
| Decorative animation, parallax, looping background motion | Motion is purposeful only. The only ambient loops are: the caret blink, the depth-sweep on the active stratum, and the decay-drift on critical specimens. |
| "Sentence case" CTAs | We use lowercase mono for system actions: `run discovery scan`, `show blast radius`, `quarantine`. The product speaks in lowercase. |
| `border-radius` ≥ 4px on a card | Panels are square. Only inline elements (badges, pills, buttons, inputs) get 2-3px radius. |
| Emoji or skeuomorphic icons | Lucide line icons only. Never filled. Never decorative. |
| Branded teal "techy" accent | Replaced by the muted ferrocyanide blueprint blue (`#7AA0D8`). |

---

## the product's voice

ZombieHunter speaks in **lowercase, terse, mono**. It does not editorialize.

- Buttons: `run discovery scan`, `show blast radius`, `open specimen`, `generate compliance report`.
- Empty states: `no scan recorded. depth meter at registry baseline.`, `awaiting first specimen.`
- Errors: `connection severed at 14:32:07. last known depth = 2014. retrying ×2.`
- Toast/confirmation: `specimen zh-0142 quarantined. rate limit lowered to 8/min.`
- Tooltips: `n = number of specimens. registry baseline excludes shadow & zombie endpoints.`

The voice is **deliberately understated**. Banking CISOs are wary of breathless tools. Confidence is shown by precision, not enthusiasm.

---

## what makes a judge remember this in 10 seconds

After a 10-second look at the Command Center, the judge should be able to describe the product as:

> *"It's the one where the API estate is drawn like a stratigraphic dig site — zombies are buried in the older strata, and the scan drops a depth meter down through the years."*

That sentence is the test. Every design decision below should be re-checked against it. If a decision doesn't reinforce that sentence, it doesn't belong.
