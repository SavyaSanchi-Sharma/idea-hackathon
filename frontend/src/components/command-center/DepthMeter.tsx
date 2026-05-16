import { useEffect, useRef, useState } from "react";
import { useScan } from "@/hooks/useScan";
import { useLiveStore } from "@/store/liveStore";
import { useSummary } from "@/hooks/useSummary";
import { cn } from "@/lib/cn";

interface Stratum {
  index: number;
  yearLabel: string;
  shortLabel: string;
  rangeLabel: string;
  // boundaries within the scan progress (0-100)
  startPct: number;
  endPct: number;
  // representative depth-year for the "depth = NNNN" readout
  currentDepth: (pctWithin: number) => string;
  zombieCountKey: "stratum1" | "stratum2" | "stratum3" | "stratum4";
}

const STRATA: Stratum[] = [
  {
    index: 1,
    yearLabel: "2026 ─── 2024",
    shortLabel: "stratum 1",
    rangeLabel: "2024–2026",
    startPct: 0,
    endPct: 25,
    currentDepth: (p) => `${2026 - Math.round((p / 100) * 2)}`,
    zombieCountKey: "stratum1",
  },
  {
    index: 2,
    yearLabel: "2023 ─── 2018",
    shortLabel: "stratum 2",
    rangeLabel: "2018–2023",
    startPct: 25,
    endPct: 50,
    currentDepth: (p) => `${2023 - Math.round((p / 100) * 5)}`,
    zombieCountKey: "stratum2",
  },
  {
    index: 3,
    yearLabel: "2017 ─── 2011",
    shortLabel: "stratum 3",
    rangeLabel: "2011–2017",
    startPct: 50,
    endPct: 75,
    currentDepth: (p) => `${2017 - Math.round((p / 100) * 6)}`,
    zombieCountKey: "stratum3",
  },
  {
    index: 4,
    yearLabel: "2010 ─── pre",
    shortLabel: "stratum 4",
    rangeLabel: "pre-2010",
    startPct: 75,
    endPct: 100,
    currentDepth: () => `pre-2010`,
    zombieCountKey: "stratum4",
  },
];

/**
 * Strip α — the stratigraphic depth meter. Counter + 4 stratum bands with
 * year labels and per-stratum sweep animation on the active band.
 */
export function DepthMeter() {
  const scanStatus = useLiveStore((s) => s.scanStatus);
  const progress = useLiveStore((s) => s.progress);
  const liveStats = useLiveStore((s) => s.liveStats);
  const { data: summary } = useSummary();
  const { isStarting, runScan } = useScan();

  const baseline = summary?.registry_baseline ?? 247;
  const liveDiscovered =
    liveStats?.total_discovered ?? (scanStatus === "complete" ? summary?.total_discovered ?? baseline : baseline);
  const liveOrphaned = liveStats?.orphaned ?? (scanStatus === "complete" ? summary?.orphaned ?? 0 : 0);

  // Stratum zombie counts are inferred — front-end is fixture-only here. The
  // back-end could emit per-stratum stats explicitly.
  const stratumZombies: Record<Stratum["zombieCountKey"], number> = {
    stratum1: 0,
    stratum2: Math.round(liveOrphaned * 0.2),
    stratum3: Math.round(liveOrphaned * 0.5),
    stratum4: Math.max(0, liveOrphaned - Math.round(liveOrphaned * 0.7)),
  };

  const tweenedCounter = useTween(liveDiscovered, scanStatus === "running" ? 800 : 1200);
  const lastScanTs = summary?.last_scan_at ? summary.last_scan_at.slice(0, 19) + "Z" : "—";

  return (
    <section
      aria-label="discovery depth scan"
      className={cn(
        "relative w-full bg-stratum",
        "border-t border-b border-hairline",
        "px-[24px] py-[12px]",
      )}
      style={{ minHeight: 132 }}
    >
      {/* Top: counter + delta */}
      <div className="flex items-baseline justify-between gap-[24px]">
        <div className="flex items-baseline gap-[16px]">
          <h2 className="font-mono text-[14px] leading-[1.4] font-semibold text-bone lowercase">
            discovery depth scan
          </h2>
        </div>
        <div className="flex items-baseline gap-[32px]">
          {scanStatus === "idle" ? (
            <button
              type="button"
              onClick={() => runScan()}
              disabled={isStarting}
              className={cn(
                "font-mono text-[12px] leading-none text-bone-dim",
                "px-[12px] py-[6px] border border-blueprint text-blueprint rounded-xs",
                "hover:bg-blueprint-wash",
              )}
            >
              awaiting first specimen.   ▶ run discovery scan
            </button>
          ) : (
            <span className="flex items-baseline gap-[12px]">
              <span className="font-mono text-[14px] leading-none font-medium text-sediment">n =</span>
              <span
                className="font-mono mono-tab text-[64px] leading-[0.9] font-bold text-bone"
                aria-live="polite"
              >
                {tweenedCounter}
              </span>
            </span>
          )}
          <span className="flex items-baseline gap-[6px] font-mono text-[12px] leading-none mono-tab">
            <span className="text-sediment">registry baseline =</span>
            <span className="text-bone-dim">{baseline}</span>
          </span>
        </div>
      </div>

      <div className="mt-[6px] flex items-baseline justify-end font-mono text-[12px] mono-tab">
        <span className="text-sediment">Δ =</span>
        <span
          className={cn(
            "ml-[6px] font-medium",
            scanStatus === "complete" ? "text-critical" : "text-bone-dim",
          )}
        >
          {scanStatus === "idle"
            ? "0"
            : `+${Math.max(0, liveDiscovered - baseline)} unknown endpoints recovered`}
        </span>
        <span className="px-[8px] text-sediment">·</span>
        <span className="text-sediment-strong">
          {scanStatus === "running"
            ? "recovering…"
            : scanStatus === "complete"
              ? `last scan ${lastScanTs}`
              : "no scan recorded"}
        </span>
      </div>

      {/* Section divider */}
      <div className="mt-[10px] h-px w-full bg-hairline" aria-hidden />

      {/* Strata grid */}
      <ol role="list" className="mt-[10px] flex flex-col gap-[6px]">
        {STRATA.map((s) => {
          let pctWithin = 0;
          let status: "queued" | "active" | "complete" = "queued";
          if (progress >= s.endPct) {
            status = "complete";
            pctWithin = 100;
          } else if (progress > s.startPct) {
            status = "active";
            pctWithin = Math.max(0, Math.min(100, ((progress - s.startPct) / (s.endPct - s.startPct)) * 100));
          }
          if (scanStatus === "complete") {
            status = "complete";
            pctWithin = 100;
          }
          const zombies = stratumZombies[s.zombieCountKey];
          const statusLabel =
            status === "complete"
              ? zombies > 0
                ? `complete · ${zombies} zombies`
                : "complete"
              : status === "active"
                ? `depth = ${s.currentDepth(pctWithin)}`
                : "queued";

          return (
            <li
              key={s.index}
              aria-label={`${s.shortLabel}, years ${s.rangeLabel}, status ${statusLabel}`}
              className="grid grid-cols-[140px_120px_1fr_140px] items-center gap-[12px]"
            >
              <span className="font-mono text-[10px] leading-none text-sediment-strong tracking-tight">
                {s.yearLabel}
              </span>
              <span className="font-mono text-[11px] leading-none text-bone-dim font-medium">
                {s.shortLabel} <span className="text-sediment">·</span> {s.rangeLabel}
              </span>
              <div className="relative h-[6px] w-full bg-stratum-raised border-y border-hairline overflow-hidden">
                <div
                  className={cn(
                    "absolute left-0 top-0 h-full",
                    status === "complete" ? "bg-blueprint-deep" : "bg-blueprint",
                  )}
                  style={{
                    width: `${pctWithin}%`,
                    transition: "width 600ms cubic-bezier(0.22,1,0.36,1)",
                  }}
                />
                {status === "active" ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute top-0 h-full"
                    style={{
                      width: 32,
                      background:
                        "linear-gradient(90deg, transparent 0%, var(--blueprint) 50%, transparent 100%)",
                      animation: "depth-sweep 1.6s linear infinite",
                    }}
                  />
                ) : null}
              </div>
              <span
                className={cn(
                  "font-mono text-[11px] leading-none mono-tab",
                  status === "complete"
                    ? "text-bone-dim"
                    : status === "active"
                      ? "text-blueprint"
                      : "text-sediment-strong",
                )}
              >
                {statusLabel}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function useTween(target: number, duration = 800): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const start = performance.now();
    const from = fromRef.current;
    const to = target;
    let raf = 0;
    function tick(t: number) {
      const p = Math.min(1, (t - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (to - from) * ease));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
