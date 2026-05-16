import { cn } from "@/lib/cn";
import type { Classification, RiskTier } from "@/types/models";

type ClassificationBadgeProps = {
  variant: "classification";
  value: Classification;
  className?: string;
};

type TierBadgeProps = {
  variant: "tier";
  value: RiskTier;
  className?: string;
};

type Props = ClassificationBadgeProps | TierBadgeProps;

const CLASSIFICATION_TONE: Record<Classification, { text: string; bg: string; dot: string }> = {
  active: { text: "text-active", bg: "bg-active-wash", dot: "bg-active" },
  deprecated: { text: "text-deprecated", bg: "bg-deprecated-wash", dot: "bg-deprecated" },
  orphaned: { text: "text-orphaned", bg: "bg-orphaned-wash", dot: "bg-orphaned" },
};

const TIER_TONE: Record<RiskTier, { text: string; bg: string }> = {
  critical: { text: "text-critical", bg: "bg-critical-wash" },
  high: { text: "text-tier-high", bg: "bg-tier-high-wash" },
  medium: { text: "text-tier-medium", bg: "bg-tier-medium-wash" },
  low: { text: "text-tier-low", bg: "bg-tier-low-wash" },
};

/**
 * Classification badge or risk-tier badge. Each carries a leading shape (●/◆)
 * so status is conveyed by shape AND color, not color alone. Lowercase mono.
 */
export function Badge(props: Props) {
  if (props.variant === "tier") {
    const tone = TIER_TONE[props.value];
    return (
      <span
        className={cn(
          "inline-flex items-center gap-[4px] h-[18px] px-[6px] rounded-xs",
          "font-mono text-[10px] leading-none font-medium tracking-wide lowercase",
          tone.text,
          tone.bg,
          props.className,
        )}
      >
        <span aria-hidden>◆</span>
        <span>{props.value}</span>
      </span>
    );
  }
  const tone = CLASSIFICATION_TONE[props.value];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[4px] h-[18px] px-[6px] rounded-xs",
        "font-mono text-[10px] leading-none font-medium tracking-wide lowercase",
        tone.text,
        tone.bg,
        props.className,
      )}
    >
      <span
        className={cn("inline-block h-[5px] w-[5px] rounded-full", tone.dot)}
        aria-hidden
      />
      <span>{props.value}</span>
    </span>
  );
}

/** Convenience wrappers for callers that don't want the variant prop. */
export function ClassificationBadge({
  value,
  className,
}: {
  value: Classification;
  className?: string;
}) {
  return <Badge variant="classification" value={value} className={className} />;
}

export function RiskBadge({ value, className }: { value: RiskTier; className?: string }) {
  return <Badge variant="tier" value={value} className={className} />;
}
