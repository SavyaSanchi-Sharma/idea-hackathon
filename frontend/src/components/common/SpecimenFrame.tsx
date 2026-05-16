import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type DecayStyle = "solid" | "deprecated" | "orphaned" | "critical";

const STROKE: Record<DecayStyle, { color: string; dash: string }> = {
  solid: { color: "var(--hairline)", dash: "" },
  deprecated: { color: "var(--decay-edge-deprecated)", dash: "8 6" },
  orphaned: { color: "var(--decay-edge-orphaned)", dash: "2 4" },
  critical: { color: "var(--decay-edge-critical)", dash: "" },
};

/**
 * A panel wrapper whose border is rendered as an SVG <rect> so dashed/stipple
 * patterns are precisely controllable (CSS `border-style: dashed` is browser-
 * defined). Critical specimens also get the scanline overlay and an optional
 * tilt rotation. Used by SpecimenCard and MetricCard.
 */
export function SpecimenFrame({
  decay = "solid",
  tilt = 0,
  scanline = false,
  stipple = false,
  drift = false,
  strokeWidth = 1,
  children,
  className,
  contentClassName,
  asLi = false,
}: {
  decay?: DecayStyle;
  tilt?: number;
  scanline?: boolean;
  stipple?: boolean;
  drift?: boolean;
  strokeWidth?: number;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  asLi?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { color, dash } = STROKE[decay];

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(node);
    setSize({ w: node.offsetWidth, h: node.offsetHeight });
    return () => ro.disconnect();
  }, []);

  const transform = drift ? undefined : tilt ? `rotate(${tilt}deg)` : undefined;
  const animation = drift ? "decay-drift 7s ease-in-out infinite" : undefined;
  const transformOrigin = tilt < -0.6 ? "30% 50%" : "50% 50%";

  const Tag = asLi ? "li" : "div";

  return (
    <Tag
      ref={ref as React.RefObject<HTMLLIElement & HTMLDivElement>}
      className={cn("relative bg-stratum", className)}
      style={{ transform, transformOrigin, animation }}
    >
      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full pointer-events-none"
        width={size.w || undefined}
        height={size.h || undefined}
      >
        <rect
          x={0.5}
          y={0.5}
          width={Math.max(0, size.w - 1)}
          height={Math.max(0, size.h - 1)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={dash || undefined}
        />
      </svg>
      {scanline ? (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none mix-blend-screen"
          style={{ backgroundImage: "var(--scanline-overlay)" }}
        />
      ) : null}
      {stipple ? (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none mix-blend-screen"
          style={{
            backgroundImage: "var(--stipple-overlay)",
            backgroundSize: "var(--stipple-size)",
            opacity: 0.6,
          }}
        />
      ) : null}
      <div className={cn("relative", contentClassName)}>{children}</div>
    </Tag>
  );
}
