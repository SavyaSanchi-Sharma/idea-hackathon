import { cn } from "@/lib/cn";

interface FactorBarProps {
  label: string;
  score: number;
  weight: number;
  detail: string;
  className?: string;
}

function bandFor(score: number): { color: string; text: string } {
  if (score >= 9) return { color: "var(--critical)", text: "text-critical" };
  if (score >= 7) return { color: "var(--tier-high)", text: "text-tier-high" };
  if (score >= 4) return { color: "var(--tier-medium)", text: "text-tier-medium" };
  return { color: "var(--active)", text: "text-active" };
}

/**
 * 0-10 horizontal bar. Color band by value (active → critical). Tick marks
 * at every integer. Weight readout sits opposite the label.
 */
export function FactorBar({ label, score, weight, detail, className }: FactorBarProps) {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const band = bandFor(score);

  return (
    <div className={cn("flex flex-col gap-[6px]", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[12px] leading-none font-medium text-bone lowercase">
          {label}
        </span>
        <span className="font-mono text-[11px] leading-none text-bone-dim mono-tab">
          <span className="text-sediment">weight </span>
          {weight.toFixed(2)}
        </span>
      </div>
      <div className="relative h-[8px] w-full bg-stratum-raised border-y border-hairline">
        <div
          className="absolute left-0 top-0 h-full"
          style={{
            width: `${pct}%`,
            background: band.color,
            transition: "width 600ms cubic-bezier(0.22,1,0.36,1)",
          }}
        />
        <div className="absolute inset-0 flex">
          {Array.from({ length: 11 }, (_, i) => (
            <div
              key={i}
              className="flex-1 border-l first:border-l-0"
              style={{ borderColor: "var(--sediment)", opacity: 0.5 }}
              aria-hidden
            />
          ))}
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] leading-[1.35] text-bone-dim truncate max-w-[80%]">
          {detail}
        </p>
        <span className={cn("font-mono mono-tab text-[12px] leading-none font-medium", band.text)}>
          {score.toFixed(1)}
          <span className="text-sediment"> / 10</span>
        </span>
      </div>
    </div>
  );
}
