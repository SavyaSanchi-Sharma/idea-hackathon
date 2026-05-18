import { useMemo, useState } from "react";
import { SpecimenCard } from "@/components/common/SpecimenCard";
import { useEndpoints } from "@/hooks/useEndpoints";
import { useUiStore } from "@/store/uiStore";
import type { SortOption } from "./FilterBar";
import { cn } from "@/lib/cn";

interface EndpointTableProps {
  sort: SortOption;
}

/**
 * The "specimen catalog" — a stacked list of horizontal SpecimenCards.
 * NOT a table. Filter rail lives above it.
 */
export function EndpointTable({ sort }: EndpointTableProps) {
  const filters = useUiStore((s) => s.inventoryFilters);
  const openEndpoint = useUiStore((s) => s.openEndpoint);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data, isLoading } = useEndpoints({
    classification: filters.classification,
    risk_tier: filters.risk_tier,
    source: filters.source,
    search: filters.search,
    sort,
    page,
    page_size: pageSize,
    needs_review: filters.signal === "needs_review" || undefined,
    is_zombie: filters.signal === "is_zombie" || undefined,
    is_shadow: filters.signal === "is_shadow" || undefined,
    anomaly_flag: filters.signal === "anomaly" || undefined,
  });

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / pageSize));
  }, [data]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.classification !== "all") parts.push(`classification = ${filters.classification}`);
    if (filters.risk_tier !== "all") parts.push(`tier = ${filters.risk_tier}`);
    if (filters.source !== "all") parts.push(`source = ${filters.source}`);
    if (filters.signal !== "all") parts.push(`signal = ${filters.signal.replace("is_", "")}`);
    if (filters.search) parts.push(`path ~ ${filters.search}`);
    return parts.length > 0 ? `filter: ${parts.join(", ")}` : "no filters applied";
  }, [filters]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* count line */}
      <div
        className="flex items-center justify-between bg-tar px-[24px] py-[8px] border-b border-hairline"
        aria-live="polite"
      >
        <div className="font-mono text-[12px] leading-none mono-tab">
          <span className="text-sediment">showing  n = </span>
          <span className="text-bone">{data?.items.length ?? 0}</span>
          <span className="text-sediment"> of {data?.total ?? 0}</span>
          <span className="px-[12px] text-sediment">·</span>
          <span className="text-bone-dim">{filterSummary}</span>
        </div>
        <div className="flex items-center gap-[12px] font-mono text-[12px] leading-none mono-tab">
          <span className="text-sediment">page  </span>
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

      {/* catalog */}
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
            no specimens match current filters.
          </div>
        ) : (
          <ol role="list" className="flex flex-col">
            {data?.items.map((ep) => (
              <SpecimenCard
                key={ep.id}
                endpoint={ep}
                layout="row"
                reducedTilt
                onOpen={openEndpoint}
                className="border-t-0"
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
