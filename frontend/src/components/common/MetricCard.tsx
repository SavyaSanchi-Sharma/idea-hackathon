import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { SpecimenFrame, type DecayStyle } from "./SpecimenFrame";

export type MetricVariant = "active" | "deprecated" | "orphaned" | "critical";

interface MetricCardProps {
  label: string;
  value: number;
  total: number;
  delta?: number;
  variant: MetricVariant;
  isLoading?: boolean;
  isHero?: boolean;
  className?: string;
}

const TONE: Record<
  MetricVariant,
  {
    text: string;
    fillBg: string;
    decay: DecayStyle;
    scanline: boolean;
    stipple: boolean;
    deltaSign: string;
  }
> = {
  active: {
    text: "text-bone",
    fillBg: "bg-active",
    decay: "solid",
    scanline: false,
    stipple: false,
    deltaSign: "▲",
  },
  deprecated: {
    text: "text-deprecated",
    fillBg: "bg-deprecated",
    decay: "solid",
    scanline: false,
    stipple: false,
    deltaSign: "▲",
  },
  orphaned: {
    text: "text-orphaned",
    fillBg: "bg-orphaned",
    decay: "orphaned",
    scanline: false,
    stipple: true,
    deltaSign: "▲",
  },
  critical: {
    text: "text-critical",
    fillBg: "bg-critical",
    decay: "critical",
    scanline: true,
    stipple: false,
    deltaSign: "▲",
  },
};

/**
 * The population readout card used in the Command Center's strip β.
 * Variants drive the decay treatment — orphaned gets stipple, critical gets
 * scanline + tilt. Active/deprecated stay crisp.
 */
export function MetricCard({
  label,
  value,
  total,
  delta = 0,
  variant,
  isLoading,
  isHero,
  className,
}: MetricCardProps) {
  const tone = TONE[variant];
  const share = total > 0 ? (value / total) * 100 : 0;
  const tilt = variant === "critical" && isHero ? -1.2 : 0;

  const [shown, setShown] = useState(value);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = shown;
    const to = value;
    const dur = 800;
    function tick(t: number) {
      const p = Math.min(1, (t - start) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(from + (to - from) * ease));
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: tween only on incoming value
  }, [value]);

  return (
    <SpecimenFrame
      decay={tone.decay}
      tilt={tilt}
      scanline={tone.scanline}
      stipple={tone.stipple}
      className={cn("min-h-[132px] px-[16px] py-[14px]", className)}
    >
      <div className="flex flex-col gap-[10px]">
        <header className="font-mono text-[11px] leading-none font-medium tracking-wide text-bone-dim lowercase">
          population <span className="text-sediment">·</span> {label}
        </header>

        <div className="flex items-baseline gap-[8px]">
          <span className="font-mono text-[14px] leading-none font-medium text-sediment">n =</span>
          <span
            className={cn(
              "font-mono mono-tab leading-none font-bold",
              "text-[36px]",
              tone.text,
            )}
          >
            {isLoading ? "··" : shown}
          </span>
        </div>

        {!isLoading ? (
          <div className="flex items-baseline gap-[6px] min-h-[14px]">
            {delta !== 0 ? (
              <>
                <span className={cn("font-mono text-[11px] leading-none font-medium mono-tab", tone.text)}>
                  {delta > 0 ? "▲" : "▼"} {delta > 0 ? "+" : ""}
                  {delta}
                </span>
                <span className="font-mono text-[11px] leading-none text-sediment-strong">
                  vs registry baseline
                </span>
              </>
            ) : (
              <span className="font-mono text-[11px] leading-none text-sediment-strong">no change</span>
            )}
          </div>
        ) : (
          <span className="font-mono text-[11px] leading-none text-sediment-strong">updating</span>
        )}

        {!isLoading ? (
          <div className="flex items-center gap-[10px] mt-[4px]">
            <div className="relative h-[4px] flex-1 bg-stratum-raised">
              <div
                className={cn("h-full", tone.fillBg)}
                style={{
                  width: `${Math.max(0, Math.min(100, share))}%`,
                  transition: "width 800ms cubic-bezier(0.22,1,0.36,1)",
                }}
              />
            </div>
            <span className={cn("font-mono mono-tab text-[11px] leading-none font-medium", tone.text)}>
              {share.toFixed(1)}%
            </span>
          </div>
        ) : null}

        {!isLoading ? (
          <div className="font-mono text-[10px] leading-[1.3] text-sediment-strong">
            share of total
          </div>
        ) : null}
      </div>
    </SpecimenFrame>
  );
}
