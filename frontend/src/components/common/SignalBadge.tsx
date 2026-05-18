import { cn } from "@/lib/cn";

export type SignalKind = "zombie" | "shadow" | "anomaly" | "review";

interface SignalBadgeProps {
  kind: SignalKind;
  className?: string;
  /** Compact form omits the label, showing just the glyph (for table-row density). */
  compact?: boolean;
}

const SIGNALS: Record<
  SignalKind,
  { glyph: string; label: string; text: string; bg: string; title: string }
> = {
  zombie: {
    glyph: "✖",
    label: "zombie",
    text: "text-critical",
    bg: "bg-critical-wash",
    title: "orphaned with high traffic — kept alive by integrations no one tracks",
  },
  shadow: {
    glyph: "◌",
    label: "shadow",
    text: "text-orphaned",
    bg: "bg-orphaned-wash",
    title: "not in the API registry — deployed outside the inventory of record",
  },
  anomaly: {
    glyph: "∿",
    label: "anomaly",
    text: "text-tier-high",
    bg: "bg-tier-high-wash",
    title: "IsolationForest detected a step-change in 30-day traffic",
  },
  review: {
    glyph: "⊘",
    label: "review",
    text: "text-blueprint",
    bg: "bg-blueprint-wash",
    title: "rule classifier and ML classifier disagree on this endpoint",
  },
};

/**
 * Per identity rule M5 (decay encoded by shape, not color alone), every signal
 * carries a distinct glyph: ✖ for zombie (marked-dead), ◌ for shadow (no record),
 * ∿ for anomaly (behavior shift), ⊘ for review (rule≠ml split).
 */
export function SignalBadge({ kind, className, compact = false }: SignalBadgeProps) {
  const s = SIGNALS[kind];
  return (
    <span
      title={s.title}
      className={cn(
        "inline-flex items-center gap-[4px] h-[18px] px-[6px] rounded-xs",
        "font-mono text-[10px] leading-none font-medium tracking-wide lowercase",
        s.text,
        s.bg,
        className,
      )}
    >
      <span aria-hidden>{s.glyph}</span>
      {compact ? null : <span>{s.label}</span>}
    </span>
  );
}
