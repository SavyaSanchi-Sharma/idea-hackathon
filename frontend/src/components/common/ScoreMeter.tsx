import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { RiskTier } from "@/types/models";

const TIER_HEX: Record<RiskTier, string> = {
  critical: "var(--tier-critical)",
  high: "var(--tier-high)",
  medium: "var(--tier-medium)",
  low: "var(--tier-low)",
};

interface ScoreMeterProps {
  score: number;
  tier: RiskTier;
  size?: number;
  thickness?: number;
  showCenter?: boolean;
  className?: string;
}

/**
 * Three-quarter arc (270°) opening at the bottom. 88px in drawer, 56px inline.
 * Renders a quartile-tick track and a tier-colored fill arc with the tabular
 * score in the center.
 */
export function ScoreMeter({
  score,
  tier,
  size = 88,
  thickness = 4,
  showCenter = true,
  className,
}: ScoreMeterProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - thickness * 2) / 2;
  const SWEEP = 270;
  const START = 135;
  const clamped = Math.max(0, Math.min(100, score));

  const fullPath = describeArc(cx, cy, radius, START, START + SWEEP);
  const fillPath = describeArc(cx, cy, radius, START, START + (SWEEP * clamped) / 100);

  const [animatedScore, setAnimatedScore] = useState(clamped);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = animatedScore;
    const to = clamped;
    const dur = 800;
    function tick(t: number) {
      const p = Math.min(1, (t - start) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      setAnimatedScore(from + (to - from) * ease);
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-run on incoming score
  }, [clamped]);

  const stroke = TIER_HEX[tier];

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`posture score ${Math.round(clamped)} out of 100, tier ${tier}`}
    >
      <svg width={size} height={size}>
        <path
          d={fullPath}
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth={thickness}
          strokeLinecap="butt"
        />
        {[25, 50, 75].map((p) => {
          const point = polarToCartesian(cx, cy, radius, START + (SWEEP * p) / 100);
          const inner = polarToCartesian(cx, cy, radius - 4, START + (SWEEP * p) / 100);
          return (
            <line
              key={p}
              x1={point.x}
              y1={point.y}
              x2={inner.x}
              y2={inner.y}
              stroke="var(--sediment)"
              strokeWidth={1}
            />
          );
        })}
        <path
          d={fillPath}
          fill="none"
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="butt"
          style={{ transition: "d 800ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      {showCenter ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono mono-tab font-bold leading-none"
            style={{ color: stroke, fontSize: size * 0.32 }}
          >
            {Math.round(animatedScore)}
          </span>
          <span className="mt-[2px] font-mono text-[10px] leading-none text-sediment">
            / 100
          </span>
        </div>
      ) : null}
    </div>
  );
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  if (Math.abs(endDeg - startDeg) < 0.01) {
    return `M ${end.x} ${end.y}`;
  }
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}
