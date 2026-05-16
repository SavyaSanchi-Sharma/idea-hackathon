/**
 * ZombieHunter AI — Tailwind theme.extend snippet ("STRATA")
 *
 * The frontend's tailwind.config.ts replaces its current theme.extend with this
 * object verbatim. All values resolve to CSS custom properties defined in
 * design/tokens.css — so changing a token there cascades everywhere with no
 * rebuild.
 *
 * Naming follows the forensic vocabulary (tar/stratum/bone/sediment/blueprint).
 * If a name doesn't carry meaning, it isn't a token.
 */

module.exports = {
  theme: {
    // Override (not extend) screens — we want explicit names, not Tailwind defaults.
    screens: {
      sm:   "640px",
      md:   "900px",
      lg:   "1200px",
      xl:   "1440px",
      "2xl":"1760px",
    },

    extend: {
      colors: {
        // Canvas & surfaces — forensic vocabulary
        tar:               "var(--tar)",
        stratum:           "var(--stratum)",
        "stratum-raised":  "var(--stratum-raised)",
        "stratum-trench":  "var(--stratum-trench)",

        // Edges
        hairline:          "var(--hairline)",
        "hairline-strong": "var(--hairline-strong)",
        trench:            "var(--trench)",
        fissure:           "var(--fissure)",

        // Text
        bone:              "var(--bone)",
        "bone-dim":        "var(--bone-dim)",
        sediment:          "var(--sediment)",
        "sediment-strong": "var(--sediment-strong)",

        // Classification (replaces status-active / status-deprecated / status-orphaned)
        active:            "var(--active)",
        deprecated:        "var(--deprecated)",
        orphaned:          "var(--orphaned)",
        critical:          "var(--critical)",

        "active-wash":     "var(--active-wash)",
        "deprecated-wash": "var(--deprecated-wash)",
        "orphaned-wash":   "var(--orphaned-wash)",
        "critical-wash":   "var(--critical-wash)",

        // Risk tiers
        "tier-critical":   "var(--tier-critical)",
        "tier-high":       "var(--tier-high)",
        "tier-medium":     "var(--tier-medium)",
        "tier-low":        "var(--tier-low)",
        "tier-critical-wash": "var(--tier-critical-wash)",
        "tier-high-wash":     "var(--tier-high-wash)",
        "tier-medium-wash":   "var(--tier-medium-wash)",
        "tier-low-wash":      "var(--tier-low-wash)",

        // Accent
        blueprint:         "var(--blueprint)",
        "blueprint-deep":  "var(--blueprint-deep)",
        "blueprint-wash":  "var(--blueprint-wash)",

        // Severity (scan feed)
        "severity-info":     "var(--severity-info)",
        "severity-warning":  "var(--severity-warning)",
        "severity-critical": "var(--severity-critical)",

        // HTTP method
        "method-get":      "var(--method-get)",
        "method-post":     "var(--method-post)",
        "method-put":      "var(--method-put)",
        "method-delete":   "var(--method-delete)",
        "method-patch":    "var(--method-patch)",
        "method-get-wash":    "var(--method-get-wash)",
        "method-post-wash":   "var(--method-post-wash)",
        "method-put-wash":    "var(--method-put-wash)",
        "method-delete-wash": "var(--method-delete-wash)",
        "method-patch-wash":  "var(--method-patch-wash)",

        // Decay edges (so border-decay-* classes can be Tailwind-arbitrary too)
        "decay-deprecated": "var(--decay-edge-deprecated)",
        "decay-orphaned":   "var(--decay-edge-orphaned)",
        "decay-critical":   "var(--decay-edge-critical)",
      },

      fontFamily: {
        // Mono is the PRIMARY family — that is the whole point.
        // sans is reserved for the threat-narrative paragraph ONLY.
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["IBM Plex Sans", "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },

      fontSize: {
        counter:        ["72px", { lineHeight: "1",    fontWeight: "700" }],
        "page-title":   ["19px", { lineHeight: "1.25", fontWeight: "600" }],
        "section-title":["14px", { lineHeight: "1.4",  fontWeight: "600" }],
        body:           ["13px", { lineHeight: "1.55", fontWeight: "400" }],
        narrative:      ["14px", { lineHeight: "1.65", fontWeight: "400" }],
        label:          ["11px", { lineHeight: "1.35", fontWeight: "500" }],
        micro:          ["10px", { lineHeight: "1.3",  fontWeight: "400" }],
        readout:        ["12px", { lineHeight: "1.4",  fontWeight: "500" }],
        "specimen-id":  ["11px", { lineHeight: "1",    fontWeight: "400" }],
        "depth-marker": ["10px", { lineHeight: "1",    fontWeight: "400" }],
      },

      fontWeight: {
        regular:  "400",
        medium:   "500",
        semibold: "600",
        bold:     "700",
      },

      letterSpacing: {
        tight:   "-0.01em",
        normal:  "0",
        readout: "0.02em",
        wide:    "0.04em",
      },

      spacing: {
        // 4px base — keep numeric scale familiar to Tailwind users
        "0":  "0px",
        "1":  "4px",
        "2":  "8px",
        "3":  "12px",
        "4":  "16px",
        "5":  "20px",
        "6":  "24px",
        "8":  "32px",
        "10": "40px",
        "12": "48px",
        "16": "64px",
        // Layout
        "rail":   "64px",
        "topbar": "56px",
        "drawer": "520px",
      },

      borderRadius: {
        none: "0px",
        xs:   "2px",
        sm:   "3px",
        // NOTE: md/lg removed deliberately. Panels are sharp.
      },

      borderWidth: {
        DEFAULT: "1px",
        "2":     "2px",
      },

      borderColor: {
        DEFAULT: "var(--hairline)",
      },

      // No box-shadow scale beyond the focus ring. We don't elevate with shadow.
      boxShadow: {
        none:        "none",
        focus:       "0 0 0 2px var(--blueprint)",
        "focus-tar": "0 0 0 1px var(--tar), 0 0 0 3px var(--blueprint)",
      },

      transitionTimingFunction: {
        instrument: "cubic-bezier(0.22, 1, 0.36, 1)",
        mechanical: "cubic-bezier(0.4, 0, 0.6, 1)",
        decay:      "cubic-bezier(0.65, 0, 0.35, 1)",
      },

      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "320ms",
        drawer:    "260ms",
        counter:   "2200ms",
        wave:      "1600ms",
        settle:    "900ms",
      },

      zIndex: {
        grid:    "0",
        base:    "1",
        nav:     "10",
        topbar:  "20",
        drawer:  "40",
        overlay: "50",
        toast:   "60",
      },

      backgroundImage: {
        // The dotted grid backdrop — applied to <main> and to graph canvases.
        grid:
          "radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0)",
        // Heavier grid for the strata graph (every 4th dot stronger)
        "grid-strata":
          "radial-gradient(circle at 1px 1px, var(--grid-dot-strong) 1px, transparent 0)," +
          "radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0)",
        // Scanline (rarely used as bg directly; usually via .overlay-scanline)
        scanline:
          "repeating-linear-gradient(0deg," +
          " rgba(232, 225, 208, 0.025) 0px, rgba(232, 225, 208, 0.025) 1px," +
          " transparent 1px, transparent 3px)",
      },

      backgroundSize: {
        grid:        "8px 8px",
        "grid-axis": "32px 32px",
      },

      keyframes: {
        // Counter climb is handled in JS (framer-motion) — no keyframe.
        // Teletype caret blink for the field-notes typewriter.
        "caret-blink": {
          "0%, 49%":   { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
        // Fault-line wave — used for blast-radius propagation visuals.
        "fault-pulse": {
          "0%":   { opacity: "0",   transform: "scaleX(0)" },
          "30%":  { opacity: "0.6" },
          "100%": { opacity: "0",   transform: "scaleX(1)" },
        },
        // Faint horizontal scan sweep on the discovery depth bar.
        "depth-sweep": {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        // The decay drift — a very subtle 2px sway, applied to orphaned cards.
        "decay-drift": {
          "0%,100%": { transform: "translateY(0) rotate(var(--decay-tilt))" },
          "50%":     { transform: "translateY(-1px) rotate(calc(var(--decay-tilt) - 0.1deg))" },
        },
      },

      animation: {
        "caret-blink": "caret-blink 1.1s steps(1, end) infinite",
        "depth-sweep": "depth-sweep 1.6s linear infinite",
        "decay-drift": "decay-drift 7s ease-in-out infinite",
      },
    },
  },
};
