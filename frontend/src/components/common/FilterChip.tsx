import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ChipTone = "neutral" | "active" | "deprecated" | "orphaned" | "critical" | "blueprint";

const TONES: Record<
  ChipTone,
  { text: string; selectedText: string; selectedBg: string; selectedAccent: string }
> = {
  neutral: {
    text: "text-bone-dim",
    selectedText: "text-bone",
    selectedBg: "bg-stratum-raised",
    selectedAccent: "bg-bone-dim",
  },
  active: {
    text: "text-bone-dim",
    selectedText: "text-active",
    selectedBg: "bg-active-wash",
    selectedAccent: "bg-active",
  },
  deprecated: {
    text: "text-bone-dim",
    selectedText: "text-deprecated",
    selectedBg: "bg-deprecated-wash",
    selectedAccent: "bg-deprecated",
  },
  orphaned: {
    text: "text-bone-dim",
    selectedText: "text-orphaned",
    selectedBg: "bg-orphaned-wash",
    selectedAccent: "bg-orphaned",
  },
  critical: {
    text: "text-bone-dim",
    selectedText: "text-critical",
    selectedBg: "bg-critical-wash",
    selectedAccent: "bg-critical",
  },
  blueprint: {
    text: "text-bone-dim",
    selectedText: "text-blueprint",
    selectedBg: "bg-blueprint-wash",
    selectedAccent: "bg-blueprint",
  },
};

/**
 * A toggleable chip with a bottom accent bar on selection. The count is
 * rendered inline so it stays in the n=NN instrument-readout cadence.
 */
export function FilterChip({
  children,
  count,
  tone = "neutral",
  selected = false,
  disabled = false,
  role = "button",
  ariaPressed,
  onClick,
}: {
  children: ReactNode;
  count?: number;
  tone?: ChipTone;
  selected?: boolean;
  disabled?: boolean;
  role?: "button" | "checkbox" | "radio";
  ariaPressed?: boolean;
  onClick?: () => void;
}) {
  const t = TONES[tone];
  return (
    <button
      type="button"
      role={role}
      aria-pressed={role === "button" ? ariaPressed : undefined}
      aria-checked={role !== "button" ? selected : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-[6px] h-[22px] px-[10px] rounded-xs",
        "border border-hairline font-mono text-[11px] leading-none font-medium lowercase",
        "transition-colors duration-fast ease-instrument",
        selected ? `${t.selectedText} ${t.selectedBg}` : `${t.text} bg-stratum`,
        selected ? "border-current" : "hover:border-hairline-strong hover:text-bone",
        disabled && "opacity-40 cursor-not-allowed pointer-events-none",
      )}
    >
      <span>{children}</span>
      {typeof count === "number" ? (
        <span className="mono-tab text-sediment-strong">
          <span className="text-sediment">n=</span>
          {count}
        </span>
      ) : null}
      {selected ? (
        <span
          aria-hidden
          className={cn(
            "absolute left-0 right-0 bottom-[-1px] h-[2px]",
            t.selectedAccent,
          )}
        />
      ) : null}
    </button>
  );
}
