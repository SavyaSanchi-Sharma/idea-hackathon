import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import type { Endpoint } from "@/types/models";
import { Badge } from "./Badge";
import { InstrumentReadout } from "./InstrumentReadout";
import { MethodPill } from "./MethodPill";
import { SignalBadge, type SignalKind } from "./SignalBadge";
import { SpecimenFrame, type DecayStyle } from "./SpecimenFrame";
import { SpecimenId } from "./SpecimenId";

function signalKinds(ep: Endpoint): SignalKind[] {
  const out: SignalKind[] = [];
  if (ep.is_zombie) out.push("zombie");
  if (ep.is_shadow) out.push("shadow");
  if (ep.anomaly_flag) out.push("anomaly");
  if (ep.needs_review) out.push("review");
  return out;
}

export type SpecimenCardLayout = "stacked" | "row";

function decayFor(classification: Endpoint["classification"], tier: Endpoint["risk_tier"]): DecayStyle {
  if (classification === "orphaned" && tier === "critical") return "critical";
  if (classification === "orphaned") return "orphaned";
  if (classification === "deprecated") return "deprecated";
  return "solid";
}

function postureTone(classification: Endpoint["classification"], tier: Endpoint["risk_tier"]) {
  if (classification === "orphaned" && tier === "critical") return "critical" as const;
  if (classification === "orphaned") return "orphaned" as const;
  if (classification === "deprecated") return "deprecated" as const;
  return "bone" as const;
}

function ageYears(birthYear: number): number {
  return Math.max(0, new Date().getFullYear() - birthYear);
}

interface SpecimenCardProps {
  endpoint: Endpoint;
  layout?: SpecimenCardLayout;
  /** Use the stronger -1.2deg tilt for the single hero card on the dashboard. */
  hero?: boolean;
  /** Reduced -0.2deg tilt for stacked inventory rows. */
  reducedTilt?: boolean;
  showRegistryOnly?: boolean;
  onOpen?: (id: string) => void;
  className?: string;
}

/**
 * The fundamental container in STRATA. Every endpoint everywhere is rendered
 * as one of these — top-risk list, inventory rows, drawer header preview.
 * Decay is encoded structurally (border style + scanline + tilt), not just
 * by color, per identity.md M5.
 */
export function SpecimenCard({
  endpoint,
  layout = "stacked",
  hero = false,
  reducedTilt = false,
  showRegistryOnly = false,
  onOpen,
  className,
}: SpecimenCardProps) {
  const decay = decayFor(endpoint.classification, endpoint.risk_tier);
  const tone = postureTone(endpoint.classification, endpoint.risk_tier);

  let tilt = 0;
  if (decay === "critical") {
    tilt = hero ? -1.2 : reducedTilt ? -0.2 : -0.6;
  }

  const interactive = !!onOpen;
  const handleKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen?.(endpoint.id);
    }
  };

  return (
    <SpecimenFrame
      asLi
      decay={decay}
      tilt={tilt}
      scanline={decay === "critical"}
      stipple={decay === "orphaned"}
      drift={decay === "critical" && hero}
      className={cn(
        "px-[16px] py-[12px]",
        layout === "row" ? "py-[10px]" : "min-h-[88px]",
        interactive && "cursor-pointer hover:bg-stratum-raised transition-colors duration-fast",
        className,
      )}
      contentClassName="block"
    >
      <div
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : -1}
        onClick={interactive ? () => onOpen?.(endpoint.id) : undefined}
        onKeyDown={handleKey}
        className="block focus:outline-none"
      >
        {layout === "stacked" ? (
          <StackedBody
            endpoint={endpoint}
            tone={tone}
            showRegistryOnly={showRegistryOnly}
          />
        ) : (
          <RowBody endpoint={endpoint} tone={tone} reducedTilt={reducedTilt} />
        )}
      </div>
    </SpecimenFrame>
  );
}

function StackedBody({
  endpoint,
  tone,
  showRegistryOnly,
}: {
  endpoint: Endpoint;
  tone: "bone" | "deprecated" | "orphaned" | "critical";
  showRegistryOnly: boolean;
}) {
  const sigs = signalKinds(endpoint);
  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex items-center justify-between gap-3">
        <SpecimenId id={endpoint.specimen_id} />
        <InstrumentReadout
          label="posture"
          value={endpoint.posture_score}
          unit="/ 100"
          valueTone={tone}
        />
      </div>

      <div className="flex items-center gap-[12px] min-w-0">
        <MethodPill method={endpoint.method} />
        <span
          className="font-mono text-[14px] leading-[1.25] font-semibold text-bone truncate"
          title={endpoint.path}
        >
          {endpoint.path}
        </span>
      </div>

      {sigs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-[6px]">
          {sigs.map((k) => (
            <SignalBadge key={k} kind={k} />
          ))}
        </div>
      ) : null}

      <div className="flex items-baseline justify-between gap-[8px] text-[11px] font-mono text-bone-dim">
        <span className="truncate">
          <span className="text-sediment">service ·</span> {endpoint.service}
          <span className="px-[6px] text-sediment">·</span>
          <span className="text-sediment">team ·</span> {endpoint.owner.team ?? "(none)"}
        </span>
        <div className="flex items-center gap-[8px] shrink-0">
          <span className="mono-tab text-sediment-strong">
            <span className="text-sediment">t₀ = </span>
            {endpoint.t0.slice(0, 10)}
            <span className="text-sediment"> · ~{ageYears(endpoint.birth_year)}y</span>
          </span>
          <Badge variant="classification" value={endpoint.classification} />
        </div>
      </div>
      {showRegistryOnly ? (
        <span className="font-mono text-[10px] leading-none text-sediment-strong">
          (registry only — not yet scanned)
        </span>
      ) : null}
    </div>
  );
}

function RowBody({
  endpoint,
  tone,
}: {
  endpoint: Endpoint;
  tone: "bone" | "deprecated" | "orphaned" | "critical";
  reducedTilt: boolean;
}) {
  const trendSign = endpoint.traffic.trend_pct > 0 ? "+" : "";
  const sigs = signalKinds(endpoint);
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-center gap-[12px] min-w-0">
        <div className="w-[72px] shrink-0">
          <SpecimenId id={endpoint.specimen_id} />
        </div>
        <MethodPill method={endpoint.method} />
        <span
          className="font-mono text-[13px] leading-[1.2] font-semibold text-bone truncate flex-1"
          title={endpoint.path}
        >
          {endpoint.path}
        </span>
        <div className="flex items-center gap-[8px] shrink-0">
          {sigs.map((k) => (
            <SignalBadge key={k} kind={k} compact />
          ))}
          <InstrumentReadout
            label="posture"
            value={endpoint.posture_score}
            valueTone={tone}
            size="readout"
          />
          <Badge variant="tier" value={endpoint.risk_tier} />
          <Badge variant="classification" value={endpoint.classification} />
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-[8px] pl-[72px] font-mono text-[11px] text-bone-dim">
        <span className="truncate">
          {endpoint.service} <span className="text-sediment">·</span>{" "}
          {endpoint.owner.team ?? "(none)"}
        </span>
        <span className="mono-tab shrink-0 text-sediment-strong">
          <span className="text-sediment">t₀ </span>
          {endpoint.t0.slice(0, 10)}
          <span className="text-sediment"> · ~{ageYears(endpoint.birth_year)}y</span>
          <span className="px-[6px] text-sediment">·</span>
          <span className="text-sediment">calls(30d) </span>
          <span className="text-bone">
            n = {compact(endpoint.traffic.calls_30d)}
          </span>
          <span className="px-[6px] text-sediment">·</span>
          <span className="text-sediment">Δ </span>
          <span
            className={
              endpoint.traffic.trend_pct < -20
                ? "text-critical"
                : endpoint.traffic.trend_pct < 0
                  ? "text-deprecated"
                  : "text-active"
            }
          >
            {trendSign}
            {endpoint.traffic.trend_pct.toFixed(1)}%
          </span>
        </span>
      </div>
    </div>
  );
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}
