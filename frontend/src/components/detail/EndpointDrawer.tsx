import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import type { Endpoint, RecommendedAction } from "@/types/models";
import { useUiStore } from "@/store/uiStore";
import { useEndpointDetail } from "@/hooks/useEndpointDetail";
import { Badge } from "@/components/common/Badge";
import { MethodPill } from "@/components/common/MethodPill";
import { SignalBadge, type SignalKind } from "@/components/common/SignalBadge";
import { SpecimenId } from "@/components/common/SpecimenId";
import { PostureBlock } from "./PostureBlock";
import { ThreatNarrative } from "./ThreatNarrative";
import { SignalsGrid } from "./SignalsGrid";
import { SequenceChart } from "./SequenceChart";
import { ModelVerdict } from "./ModelVerdict";
import { SlmReportsPanel } from "./SlmReportsPanel";
import { postEndpointAction } from "@/api/endpoints";
import { cn } from "@/lib/cn";

const ACTION_LABEL: Record<RecommendedAction, string> = {
  monitor: "place in monitor",
  quarantine: "quarantine specimen",
  block: "block now",
  playbook: "generate playbook",
};

function drawerSignals(ep: Endpoint): SignalKind[] {
  const out: SignalKind[] = [];
  if (ep.is_zombie) out.push("zombie");
  if (ep.is_shadow) out.push("shadow");
  if (ep.anomaly_flag) out.push("anomaly");
  if (ep.needs_review) out.push("review");
  return out;
}

export function EndpointDrawer() {
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const selectedId = useUiStore((s) => s.selectedEndpointId);
  const closeDrawer = useUiStore((s) => s.closeDrawer);
  const setGraphMode = useUiStore((s) => s.setGraphMode);
  const navigate = useNavigate();

  const { data: ep, isLoading, error } = useEndpointDetail(selectedId);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => closeBtnRef.current?.focus(), 260);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    if (!drawerOpen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [drawerOpen]);

  const onShowBlastRadius = () => {
    if (!ep) return;
    setGraphMode("blast_radius", ep.id);
    closeDrawer();
    navigate("/landscape");
  };

  return (
    <AnimatePresence>
      {drawerOpen && (
        <>
          <motion.div
            key="scrim"
            // z-[35] sits between topbar (20) and drawer (40) so the scrim dims
            // the page behind the drawer without dimming the drawer itself.
            className="fixed inset-0 z-[35]"
            style={{ background: "rgba(7, 9, 11, 0.7)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            onClick={closeDrawer}
            aria-hidden
          />
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="fixed right-0 top-0 z-drawer h-screen w-[520px] max-w-full border-l border-hairline-strong bg-stratum overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            {isLoading ? (
              <LoadingShell onClose={closeDrawer} closeRef={closeBtnRef} />
            ) : error || !ep ? (
              <ErrorShell
                onClose={closeDrawer}
                closeRef={closeBtnRef}
                endpointId={selectedId}
                error={error}
              />
            ) : (
              <DrawerBody
                endpoint={ep}
                onClose={closeDrawer}
                onShowBlastRadius={onShowBlastRadius}
                closeRef={closeBtnRef}
              />
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function LoadingShell({
  onClose,
  closeRef,
}: {
  onClose: () => void;
  closeRef: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-[24px] py-[16px] border-b border-hairline">
        <span className="font-mono text-[11px] text-bone-dim">retrieving specimen…</span>
        <CloseButton ref={closeRef} onClose={onClose} />
      </header>
      <div className="px-[24px] py-[16px] flex flex-col gap-[12px]">
        <div className="h-[160px] w-full skeleton-pulse" aria-hidden />
        <div className="h-[120px] w-full skeleton-pulse" aria-hidden />
        <div className="h-[200px] w-full skeleton-pulse" aria-hidden />
      </div>
    </div>
  );
}

function ErrorShell({
  onClose,
  closeRef,
  endpointId,
  error,
}: {
  onClose: () => void;
  closeRef: React.RefObject<HTMLButtonElement>;
  endpointId: string | null;
  error: unknown;
}) {
  const message =
    error instanceof Error ? error.message : "no detail returned (likely 404 from the backend)";
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-[24px] py-[16px] border-b border-hairline">
        <span className="font-mono text-[11px] text-critical lowercase">specimen unreadable</span>
        <CloseButton ref={closeRef} onClose={onClose} />
      </header>
      <div className="px-[24px] py-[16px] flex flex-col gap-[10px]">
        <p className="font-mono text-[13px] text-bone lowercase">
          could not retrieve detail for this endpoint.
        </p>
        {endpointId ? (
          <p className="font-mono text-[11px] text-sediment break-all">
            <span className="text-sediment-strong">id · </span>
            {endpointId}
          </p>
        ) : null}
        <p className="font-mono text-[11px] text-bone-dim leading-relaxed">
          <span className="text-sediment-strong">reason · </span>
          {message}
        </p>
        <p className="font-mono text-[10px] text-sediment-strong mt-[10px]">
          if the id starts with <code className="text-bone">ep_</code> it belongs to ai_engine (boreholes); hex ids belong to pipe.
        </p>
      </div>
    </div>
  );
}

function DrawerBody({
  endpoint,
  onClose,
  onShowBlastRadius,
  closeRef,
}: {
  endpoint: Endpoint;
  onClose: () => void;
  onShowBlastRadius: () => void;
  closeRef: React.RefObject<HTMLButtonElement>;
}) {
  const isCritical = endpoint.classification === "orphaned" && endpoint.risk_tier === "critical";
  const isOrphaned = endpoint.classification === "orphaned" && !isCritical;
  const isDeprecated = endpoint.classification === "deprecated";

  const decayEdge = isCritical
    ? "bg-critical"
    : isOrphaned
      ? "bg-orphaned"
      : isDeprecated
        ? "bg-deprecated"
        : "bg-active";

  const tierTone =
    endpoint.risk_tier === "critical"
      ? "text-critical"
      : endpoint.risk_tier === "high"
        ? "text-tier-high"
        : endpoint.risk_tier === "medium"
          ? "text-tier-medium"
          : "text-tier-low";

  const action = endpoint.recommended_action;
  const actionBorder = isCritical || endpoint.risk_tier === "critical" ? "border-critical text-critical hover:bg-critical-wash" : endpoint.risk_tier === "high" ? "border-deprecated text-deprecated hover:bg-deprecated-wash" : "border-blueprint text-blueprint hover:bg-blueprint-wash";

  async function onPrimaryAction() {
    try {
      await postEndpointAction(endpoint.id, action);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[action] post failed", err);
    }
  }

  return (
    <div className="flex flex-col">
      {/* HEADER */}
      <header
        className={cn(
          "relative px-[24px] py-[16px] border-b border-hairline bg-stratum-raised",
          isCritical && "overflow-hidden",
        )}
      >
        {isCritical ? (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none mix-blend-screen"
            style={{ backgroundImage: "var(--scanline-overlay)" }}
          />
        ) : null}
        <div
          aria-hidden
          className={cn("absolute left-0 top-0 bottom-0 w-[3px]", decayEdge)}
          style={isOrphaned ? { background: "repeating-linear-gradient(180deg, var(--orphaned) 0px, var(--orphaned) 2px, transparent 2px, transparent 6px)" } : undefined}
        />

        <div className="relative flex items-start justify-between gap-[12px]">
          <div className="flex flex-col gap-[12px] min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-[8px]">
              <SpecimenId id={endpoint.specimen_id} />
              <Badge variant="classification" value={endpoint.classification} />
              <Badge variant="tier" value={endpoint.risk_tier} />
              {drawerSignals(endpoint).map((k) => (
                <SignalBadge key={k} kind={k} />
              ))}
            </div>
            <div className="flex items-center gap-[12px] min-w-0">
              <MethodPill method={endpoint.method} />
              <h2
                id="drawer-title"
                className="font-mono text-[19px] leading-[1.25] font-semibold text-bone break-all"
              >
                {endpoint.path}
              </h2>
            </div>
            <div className="font-mono text-[11px] leading-none text-bone-dim mono-tab">
              <span className="text-sediment">service · </span>
              {endpoint.service}
              <span className="px-[12px] text-sediment">·</span>
              <span className="text-sediment">team · </span>
              {endpoint.owner.team ?? "?"}
              <span className="px-[12px] text-sediment">·</span>
              <span className="text-sediment">t₀ = </span>
              {endpoint.t0.slice(0, 10)}
            </div>
          </div>
          <CloseButton ref={closeRef} onClose={onClose} />
        </div>
      </header>

      {/* POSTURE */}
      <PostureBlock endpoint={endpoint} />

      {/* MODEL VERDICT — rule vs ml side-by-side */}
      <ModelVerdict endpoint={endpoint} />

      {/* CLASSIFICATION REASONING */}
      <section className="px-[24px] py-[16px] border-b border-hairline">
        <h3 className="mb-[10px] font-mono text-[14px] leading-[1.4] font-semibold text-bone lowercase">
          classification reasoning
        </h3>
        <ul className="flex flex-col gap-[4px]">
          {endpoint.classification_reasons.map((reason, i, arr) => {
            const isLast = i === arr.length - 1;
            const critical = /cve|owasp|critical|orphan|breach/i.test(reason);
            const prefix = critical ? "╳╴" : isLast && !critical ? "├╴" : "├╴";
            return (
              <li
                key={i}
                className="flex items-baseline gap-[8px] font-mono text-[12px] leading-[1.4]"
              >
                <span
                  className={cn(
                    critical ? "text-critical" : "text-sediment",
                  )}
                >
                  {prefix}
                </span>
                <span className="text-bone-dim">{reason}</span>
              </li>
            );
          })}
          <li className="flex items-baseline gap-[8px] font-mono text-[12px] leading-[1.4]">
            <span className="text-sediment">└╴</span>
            <span className="text-bone">
              <span className="text-sediment">classification = </span>
              {endpoint.classification}
              <span className="px-[6px] text-sediment">·</span>
              <span className="text-sediment">confidence </span>
              <span className="mono-tab">
                {((endpoint.posture_score / 100) * 0.98 + 0.02).toFixed(2)}
              </span>
            </span>
          </li>
        </ul>
      </section>

      {/* FIELD NOTES */}
      <ThreatNarrative text={endpoint.threat_narrative} specimenId={endpoint.specimen_id} />

      {/* SLM-GENERATED REPORTS */}
      <section className="px-[24px] py-[16px]">
        <SlmReportsPanel endpointId={endpoint.id} />
      </section>

      {/* SIGNALS */}
      <SignalsGrid endpoint={endpoint} />

      {/* 30-DAY TELEMETRY — the actual input to the anomaly model */}
      <SequenceChart
        endpointId={endpoint.id}
        anomalyFlag={endpoint.anomaly_flag}
        anomalyScore={endpoint.anomaly_score}
      />

      {/* RECOMMENDED ACTION */}
      <section className="px-[24px] py-[16px]">
        <h3 className="mb-[10px] font-mono text-[14px] leading-[1.4] font-semibold text-bone lowercase">
          recommended action
        </h3>
        <p className="font-mono text-[14px] leading-none mb-[12px]">
          <span className={tierTone}>◆ {endpoint.risk_tier}</span>
          <span className="px-[8px] text-sediment">→</span>
          <span className="text-bone">{ACTION_LABEL[action].split(" ")[0]}</span>
        </p>
        <div className="flex items-center gap-[12px]">
          <button
            type="button"
            onClick={onPrimaryAction}
            className={cn(
              "h-[32px] px-[14px] border bg-tar rounded-xs font-mono text-[13px] leading-none font-medium lowercase",
              actionBorder,
            )}
          >
            {ACTION_LABEL[action]}
          </button>
          <button
            type="button"
            onClick={onShowBlastRadius}
            className={cn(
              "h-[32px] px-[14px] rounded-xs",
              "border border-hairline-strong text-bone-dim bg-tar",
              "font-mono text-[13px] leading-none font-medium lowercase",
              "hover:text-bone hover:border-bone-dim",
            )}
          >
            show blast radius <span aria-hidden>▣</span>
          </button>
        </div>
        <p className="mt-[10px] font-mono text-[10px] leading-[1.3] text-sediment-strong">
          secondary actions: quarantine · generate playbook · file RBI incident report
        </p>
      </section>
    </div>
  );
}

const CloseButton = function CloseButton({
  onClose,
  ref,
}: {
  onClose: () => void;
  ref: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClose}
      aria-label="close drawer"
      className={cn(
        "shrink-0 h-[32px] w-[32px] flex items-center justify-center",
        "font-mono text-[14px] text-bone-dim hover:text-bone hover:bg-stratum-raised rounded-xs",
      )}
    >
      ×
    </button>
  );
};
