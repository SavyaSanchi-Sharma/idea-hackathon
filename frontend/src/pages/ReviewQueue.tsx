import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReviewQueue } from "@/api/endpoints";
import { Badge } from "@/components/common/Badge";
import { MethodPill } from "@/components/common/MethodPill";
import { SignalBadge } from "@/components/common/SignalBadge";
import { SpecimenId } from "@/components/common/SpecimenId";
import { useUiStore } from "@/store/uiStore";
import type { Classification, Endpoint } from "@/types/models";
import { cn } from "@/lib/cn";

const PAGE_SIZE = 25;

/**
 * The "discovery" queue — endpoints where the deterministic rule (registry's
 * view of the world) and the ML classifier (telemetry's view) disagree.
 *
 * This is the central pitch of the dual-classifier setup: agreement is
 * plumbing, disagreement is the signal. Each row shows BOTH verdicts side by
 * side so an analyst can decide which one to trust on a case-by-case basis.
 */
export default function ReviewQueue() {
  const [page, setPage] = useState(1);
  const openEndpoint = useUiStore((s) => s.openEndpoint);

  const { data, isLoading } = useQuery({
    queryKey: ["review-queue", page],
    queryFn: () => getReviewQueue(page, PAGE_SIZE),
    staleTime: 30_000,
  });

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  }, [data]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-hairline bg-stratum px-[24px] py-[16px]">
        <div className="flex items-baseline justify-between gap-[12px]">
          <div>
            <h1 className="font-mono text-[19px] leading-[1.25] font-semibold text-bone lowercase">
              review queue
            </h1>
            <p className="mt-[4px] font-mono text-[12px] leading-[1.45] text-bone-dim max-w-[760px]">
              specimens where the deterministic{" "}
              <span className="text-bone">rule</span> classifier (registry's view) disagrees
              with the <span className="text-bone">ml</span> classifier (telemetry's view).
              agreement is plumbing — these {data?.total ?? "—"} rows are the discovery signal.
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-[11px] leading-none text-sediment-strong lowercase">
              n =
            </div>
            <div className="mt-[4px] font-mono text-[28px] leading-none font-semibold text-bone mono-tab">
              {data?.total ?? "—"}
            </div>
          </div>
        </div>
      </header>

      <div
        className="flex items-center justify-between bg-tar px-[24px] py-[8px] border-b border-hairline"
        aria-live="polite"
      >
        <div className="font-mono text-[12px] leading-none mono-tab">
          <span className="text-sediment">showing n = </span>
          <span className="text-bone">{data?.items.length ?? 0}</span>
          <span className="text-sediment"> of {data?.total ?? 0}</span>
        </div>
        <div className="flex items-center gap-[12px] font-mono text-[12px] leading-none mono-tab">
          <span className="text-sediment">page </span>
          <span className="text-bone">{page}</span>
          <span className="text-sediment"> / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className={cn(
              "h-[20px] w-[20px] flex items-center justify-center text-bone-dim hover:text-bone",
              page === 1 && "opacity-40 cursor-not-allowed",
            )}
            aria-label="previous page"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className={cn(
              "h-[20px] w-[20px] flex items-center justify-center text-bone-dim hover:text-bone",
              page >= totalPages && "opacity-40 cursor-not-allowed",
            )}
            aria-label="next page"
          >
            ▶
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-tar">
        {isLoading ? (
          <ol role="list">
            {Array.from({ length: 8 }).map((_, i) => (
              <li
                key={i}
                className="h-[76px] border-b border-hairline bg-stratum skeleton-pulse"
                aria-hidden
              />
            ))}
          </ol>
        ) : data?.items.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center font-mono text-[13px] text-bone-dim">
            no specimens in review queue — rule and ml classifier agree on everything.
          </div>
        ) : (
          <ol role="list" className="flex flex-col">
            {data?.items.map((ep) => (
              <ReviewRow key={ep.id} endpoint={ep} onOpen={openEndpoint} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function ReviewRow({
  endpoint,
  onOpen,
}: {
  endpoint: Endpoint;
  onOpen: (id: string) => void;
}) {
  const rule = endpoint.rule_state ?? endpoint.classification;
  const ml = endpoint.ml_state ?? endpoint.classification;
  const confidence = endpoint.ml_confidence ?? 0;
  const ruleColor = classificationColor(rule);
  const mlColor = classificationColor(ml);
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={() => onOpen(endpoint.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(endpoint.id);
        }
      }}
      className="flex flex-col gap-[8px] border-b border-hairline bg-stratum px-[16px] py-[12px] cursor-pointer hover:bg-stratum-raised transition-colors duration-fast"
    >
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
        <Badge variant="tier" value={endpoint.risk_tier} />
      </div>

      {/* The verdict diff — the marquee element of this page */}
      <div className="flex flex-wrap items-center gap-[8px] pl-[72px] font-mono text-[12px] leading-none">
        <span className="text-sediment">rule</span>
        <span className={cn("px-[6px] py-[2px] rounded-xs", ruleColor.bg, ruleColor.text)}>
          {rule}
        </span>
        <span className="text-sediment-strong">≠</span>
        <span className="text-sediment">ml</span>
        <span className={cn("px-[6px] py-[2px] rounded-xs", mlColor.bg, mlColor.text)}>
          {ml}
        </span>
        <span className="px-[8px] text-sediment">·</span>
        <span className="text-sediment">ml-conf</span>
        <span className="mono-tab text-bone">{confidence.toFixed(2)}</span>
        <span className="px-[8px] text-sediment">·</span>
        <SignalBadge kind="review" />
        {endpoint.is_zombie ? <SignalBadge kind="zombie" /> : null}
        {endpoint.is_shadow ? <SignalBadge kind="shadow" /> : null}
        {endpoint.anomaly_flag ? <SignalBadge kind="anomaly" /> : null}
      </div>

      <div className="pl-[72px] font-mono text-[11px] leading-[1.4] text-bone-dim">
        <span className="text-sediment">reason · </span>
        {endpoint.classification_reasons[0] ?? "—"}
      </div>
    </li>
  );
}

function classificationColor(c: Classification): { text: string; bg: string } {
  if (c === "active") return { text: "text-active", bg: "bg-active-wash" };
  if (c === "deprecated") return { text: "text-deprecated", bg: "bg-deprecated-wash" };
  return { text: "text-orphaned", bg: "bg-orphaned-wash" };
}
