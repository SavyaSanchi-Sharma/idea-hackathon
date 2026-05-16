import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Renders a box-drawing-character framed block:
 *   ┌─ label ─────────────────────  trailing-right
 *   │  children
 *   └────────────────────────────────
 *
 * The right side is intentionally not closed (matches a real field-notes book).
 * Used at most twice per screen per identity.md M2.
 */
export function BoxFrame({
  label,
  trailingRight,
  children,
  withBottom = true,
  withLeftRail = false,
  className,
  bodyClassName,
}: {
  label: ReactNode;
  trailingRight?: ReactNode;
  children: ReactNode;
  withBottom?: boolean;
  withLeftRail?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("font-mono text-[12px] leading-[1.4]", className)}>
      <div className="flex items-center gap-[6px]">
        <span className="frame-line" aria-hidden>
          ┌─
        </span>
        <span className="text-bone-dim font-medium">{label}</span>
        <span className="frame-line flex-1 truncate" aria-hidden>
          {"─".repeat(120)}
        </span>
        {trailingRight ? <span className="text-bone-dim shrink-0">{trailingRight}</span> : null}
      </div>
      <div
        className={cn(
          withLeftRail ? "border-l border-sediment pl-[16px]" : undefined,
          "py-[8px]",
          bodyClassName,
        )}
      >
        {children}
      </div>
      {withBottom ? (
        <div className="frame-line truncate" aria-hidden>
          └{"─".repeat(140)}
        </div>
      ) : null}
    </div>
  );
}
