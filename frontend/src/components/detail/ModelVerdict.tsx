import type { Endpoint } from "@/types/models";
import { cn } from "@/lib/cn";

interface ModelVerdictProps {
  endpoint: Endpoint;
}

/**
 * Shows the two classifier verdicts side-by-side: the deterministic rule
 * (registry's view) and the ML model (telemetry's view), plus the ML
 * confidence. When they disagree, the panel renders with a warning bar so
 * the analyst sees this is a review-queue specimen.
 *
 * Renders nothing if the backend didn't ship the dual-state fields on this
 * payload (older backend, partial response).
 */
export function ModelVerdict({ endpoint }: ModelVerdictProps) {
  const rule = endpoint.rule_state;
  const ml = endpoint.ml_state ?? endpoint.classification;
  const confidence = endpoint.ml_confidence;
  const disagree = !!endpoint.needs_review;

  // Render nothing if backend hasn't shipped the dual-state fields yet.
  if (!rule || !ml || typeof confidence !== "number") return null;

  return (
    <section
      className={cn(
        "px-[24px] py-[16px] border-b border-hairline",
        disagree && "bg-blueprint-wash/30",
      )}
    >
      <div className="mb-[10px] flex items-baseline justify-between">
        <h3 className="font-mono text-[14px] leading-[1.4] font-semibold text-bone lowercase">
          model verdict
        </h3>
        {disagree ? (
          <span className="font-mono text-[10px] leading-none text-blueprint lowercase">
            ⊘ rule ≠ ml · review queue
          </span>
        ) : (
          <span className="font-mono text-[10px] leading-none text-sediment-strong lowercase">
            rule = ml · agreement
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-[12px] font-mono">
        <Cell label="rule (registry)" value={rule} highlight={disagree} />
        <Cell label="ml (telemetry)" value={ml} highlight={disagree} />
        <Cell
          label="ml confidence"
          value={confidence.toFixed(2)}
          mono
          tone={confidence < 0.85 ? "warn" : "ok"}
        />
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  highlight = false,
  mono = false,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
  tone?: "ok" | "warn";
}) {
  const valueColor =
    tone === "warn" ? "text-tier-high" : highlight ? "text-blueprint" : "text-bone";
  return (
    <div className="flex flex-col gap-[4px]">
      <span className="text-[10px] leading-none text-sediment-strong lowercase">
        {label}
      </span>
      <span
        className={cn(
          "text-[18px] leading-none font-semibold lowercase",
          mono && "mono-tab",
          valueColor,
        )}
      >
        {value}
      </span>
    </div>
  );
}
