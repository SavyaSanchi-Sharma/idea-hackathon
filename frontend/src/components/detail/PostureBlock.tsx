import { ScoreMeter } from "@/components/common/ScoreMeter";
import { FactorBar } from "@/components/common/FactorBar";
import type { Endpoint } from "@/types/models";

const FACTOR_LABELS = {
  data_sensitivity: "data sensitivity",
  auth_strength: "auth strength",
  staleness: "staleness",
  blast_radius: "blast radius",
  cve_owasp_match: "cve / owasp match",
} as const;

const DEFAULT_DETAILS: Record<keyof typeof FACTOR_LABELS, string> = {
  data_sensitivity: "data sensitivity profile",
  auth_strength: "authentication and rate-limit posture",
  staleness: "commit and deploy recency",
  blast_radius: "downstream system reach",
  cve_owasp_match: "vulnerability and owasp api match",
};

interface PostureBlockProps {
  endpoint: Endpoint;
}

/**
 * Left: 88px score arc + caption stack. Right: five FactorBars in spec order.
 * A thin hairline divides arc column from bars column.
 */
export function PostureBlock({ endpoint }: PostureBlockProps) {
  const { score_factors: f, posture_score, risk_tier } = endpoint;
  return (
    <section className="grid grid-cols-[120px_1fr] gap-[16px] px-[24px] py-[16px] border-b border-hairline">
      <div className="flex flex-col items-start gap-[8px]">
        <ScoreMeter score={posture_score} tier={risk_tier} size={88} thickness={4} />
        <div className="flex flex-col gap-[2px] font-mono">
          <span className="text-[11px] leading-[1.3] text-bone-dim font-medium lowercase">
            posture score
          </span>
          <span className="text-[11px] leading-[1.3] text-bone-dim font-medium lowercase">
            tier <span className={`text-tier-${risk_tier === "critical" ? "critical" : risk_tier === "high" ? "high" : risk_tier === "medium" ? "medium" : "low"}`}>◆ {risk_tier}</span>
          </span>
          <span className="text-[10px] leading-[1.3] text-sediment-strong mono-tab">
            last evaluated {new Date().toISOString().slice(11, 19)}Z
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-[16px] border-l border-hairline pl-[16px]">
        {(Object.keys(FACTOR_LABELS) as Array<keyof typeof FACTOR_LABELS>).map((k) => (
          <FactorBar
            key={k}
            label={FACTOR_LABELS[k]}
            score={f[k].score}
            weight={f[k].weight}
            detail={f[k].detail || DEFAULT_DETAILS[k]}
          />
        ))}
      </div>
    </section>
  );
}
