import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The "n = 281" pattern: label glyph in sediment, value in bone, tabular-nums.
 * Numbers are never bare in STRATA; everything is a labeled readout.
 */
export function InstrumentReadout({
  label,
  value,
  unit,
  valueTone = "bone",
  size = "readout",
  separator = "=",
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  valueTone?: "bone" | "active" | "deprecated" | "orphaned" | "critical" | "blueprint" | "bone-dim";
  size?: "readout" | "body" | "micro" | "label";
  separator?: string;
  className?: string;
}) {
  const tone =
    valueTone === "active"
      ? "text-active"
      : valueTone === "deprecated"
        ? "text-deprecated"
        : valueTone === "orphaned"
          ? "text-orphaned"
          : valueTone === "critical"
            ? "text-critical"
            : valueTone === "blueprint"
              ? "text-blueprint"
              : valueTone === "bone-dim"
                ? "text-bone-dim"
                : "text-bone";

  const sizeClass =
    size === "body"
      ? "text-[13px] leading-[1.55]"
      : size === "micro"
        ? "text-[10px] leading-[1.3]"
        : size === "label"
          ? "text-[11px] leading-[1.35]"
          : "text-[12px] leading-[1.4]";

  return (
    <span
      className={cn(
        "font-mono mono-tab inline-flex items-baseline gap-[6px] font-medium",
        sizeClass,
        className,
      )}
    >
      <span className="text-sediment">
        {label} {separator}
      </span>
      <span className={tone}>{value}</span>
      {unit ? <span className="text-sediment">{unit}</span> : null}
    </span>
  );
}
