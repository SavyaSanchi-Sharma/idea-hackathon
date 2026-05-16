import { cn } from "@/lib/cn";

/**
 * STRATA's signature tag. Lowercased zh-NNNN in mono, sediment-strong, tracked.
 * Renders inline so callers control surrounding gaps.
 */
export function SpecimenId({
  id,
  className,
  tone = "default",
}: {
  id: string;
  className?: string;
  tone?: "default" | "critical" | "bone";
}) {
  const toneClass =
    tone === "critical" ? "text-critical" : tone === "bone" ? "text-bone" : "text-sediment-strong";
  return (
    <span
      className={cn(
        "font-mono lowercase tracking-wide",
        "text-[11px] leading-none",
        toneClass,
        className,
      )}
    >
      {id.toLowerCase()}
    </span>
  );
}
