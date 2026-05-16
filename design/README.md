# ZombieHunter AI — Design System ("STRATA")

> The bank's API estate is a forensic dig site. Every endpoint is a specimen, every service is a stratum of accumulated infrastructure, and zombies are buried in the deeper layers waiting to be excavated. This design system makes that the literal visual language of the product — through a single typographic voice (IBM Plex Mono), a bone-on-tar palette (warm cream on near-black, sepia for the aged, bone-yellow for the orphaned, bruise-red for the cracked), structural decay encoded in panel borders (dashed for deprecated, broken-stipple for orphaned, tilted-and-scanlined for critical), and a stratigraphic cross-section that replaces the lazy force-directed graph other security tools default to. The three principles are: **(1) it is an instrument, not a dashboard; (2) age is a visible structural property; (3) every screen confesses its method.**

---

## the files in this directory

| file | purpose |
|---|---|
| `identity.md` | **Read this first.** The design-language manifesto: the concept in one sentence, three principles, eight signature motifs (grid, box chars, specimen IDs, instrument readouts, decay edges, depth meter, field-notes typewriter, stratigraphic graph), and explicit anti-patterns. |
| `tokens.css` | Every design token as CSS custom properties — palette, grid backdrop, decay tokens, motion, typography, layout constants. The single source of truth. |
| `tailwind.tokens.js` | `theme.extend` snippet the frontend drops into `tailwind.config.ts`. All values resolve to the CSS custom properties above. |
| `typography.md` | The type system: IBM Plex Mono (primary, everywhere) and IBM Plex Sans (one place only — the threat-narrative paragraph). Scale, weights, italics, special text styles. |
| `components.md` | Redlines for every atom: classification badge, risk badge, method pill, specimen card, posture-score arc, factor bar, scan-feed line, graph node, depth meter. Includes ASCII mockups + dimensions + every state. |
| `command-center.md` | Full redline of the Command Center screen (the screen built first). Includes ASCII layout, all dimensions, all states (pre-scan / scanning / complete / error), banking-authentic fixture content. |
| `endpoint-detail.md` | The right-side specimen drawer: header, posture block with five-factor breakdown, classification reasoning, field-notes typewriter, signals grid, recommended action. |
| `inventory.md` | The exhaustive endpoint list — designed as a specimen catalog, not a SaaS table. Filter bar, row layout, sort, pagination. |
| `landscape-graph.md` | The stratigraphic cross-section. Replaces the force-directed graph. Spec for axes, lanes, node plotting, edge routing, legend. |
| `blast-radius.md` | The fault-line propagation mode for the landscape graph. Red fissure animation, overlay summary panel. |
| `states.md` | Loading / empty / scanning / complete / disconnected for every screen. |
| `motion.md` | Every animation: counter climb, depth-sweep, teletype, fault-line propagation, decay drift. Exact durations and easings. |
| `FRONTEND_MIGRATION_BRIEF.md` | The prescription for the frontend agent: which existing files to delete, rewrite, keep; the concrete code changes per screen; the verification checklist. |

## read order

For a new collaborator or the frontend agent:

1. `identity.md` — the manifesto.
2. `tokens.css` + `tailwind.tokens.js` — the values.
3. `typography.md` + `components.md` — the atoms.
4. `command-center.md` — the first screen to implement.
5. `endpoint-detail.md`, `inventory.md` — MVP screens 2 and 3.
6. `landscape-graph.md`, `blast-radius.md` — the differentiators.
7. `states.md`, `motion.md` — cross-cutting concerns.
8. `FRONTEND_MIGRATION_BRIEF.md` — the execution plan.
