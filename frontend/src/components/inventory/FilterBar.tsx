import { FilterChip } from "@/components/common/FilterChip";
import { useUiStore } from "@/store/uiStore";
import { useEndpoints } from "@/hooks/useEndpoints";
import type { Classification, DiscoverySource, RiskTier } from "@/types/models";

type SortOption =
  | "posture_score:desc"
  | "posture_score:asc"
  | "last_seen:desc"
  | "last_seen:asc";

interface FilterBarProps {
  sort: SortOption;
  onSortChange: (s: SortOption) => void;
}

const CLASSIFICATIONS: Array<{ value: Classification | "all"; label: string; tone: "neutral" | "active" | "deprecated" | "orphaned" | "critical" }> = [
  { value: "all", label: "all", tone: "neutral" },
  { value: "active", label: "active", tone: "active" },
  { value: "deprecated", label: "deprecated", tone: "deprecated" },
  { value: "orphaned", label: "orphaned", tone: "orphaned" },
];

const TIERS: Array<{ value: RiskTier | "all"; label: string; tone: "neutral" | "critical" | "deprecated" | "active" }> = [
  { value: "all", label: "all", tone: "neutral" },
  { value: "critical", label: "critical", tone: "critical" },
  { value: "high", label: "high", tone: "deprecated" },
  { value: "medium", label: "medium", tone: "neutral" },
  { value: "low", label: "low", tone: "active" },
];

const SOURCES: Array<{ value: DiscoverySource | "all"; label: string }> = [
  { value: "all", label: "all" },
  { value: "traffic_logs", label: "traffic logs" },
  { value: "registry", label: "registry" },
  { value: "code_scan", label: "code scan" },
];

/**
 * Four labeled rows of filter chips (classification / tier / source / sort).
 * Each row uses the FilterChip atom with the count rendered as n=NNN.
 */
export function FilterBar({ sort, onSortChange }: FilterBarProps) {
  const filters = useUiStore((s) => s.inventoryFilters);
  const setFilters = useUiStore((s) => s.setInventoryFilters);

  // Unfiltered count of all specimens for the "all n=NNN" chip.
  const { data: all } = useEndpoints({ page_size: 500 });
  const byClassification = countBy(all?.items ?? [], (e) => e.classification);
  const byTier = countBy(all?.items ?? [], (e) => e.risk_tier);
  const bySource = countBySource(all?.items ?? []);
  const total = all?.total ?? 0;

  return (
    <section
      aria-label="filters"
      className="border-b border-hairline bg-stratum px-[24px] py-[12px]"
    >
      <FilterRow label="classification">
        {CLASSIFICATIONS.map((c) => (
          <FilterChip
            key={c.value}
            tone={c.tone}
            selected={filters.classification === c.value}
            count={c.value === "all" ? total : byClassification[c.value] ?? 0}
            onClick={() => setFilters({ classification: c.value })}
          >
            {c.label}
          </FilterChip>
        ))}
      </FilterRow>

      <FilterRow label="tier">
        {TIERS.map((t) => (
          <FilterChip
            key={t.value}
            tone={t.tone}
            selected={filters.risk_tier === t.value}
            count={t.value === "all" ? total : byTier[t.value] ?? 0}
            onClick={() => setFilters({ risk_tier: t.value })}
          >
            {t.label}
          </FilterChip>
        ))}
      </FilterRow>

      <FilterRow label="source">
        {SOURCES.map((s) => (
          <FilterChip
            key={s.value}
            tone="blueprint"
            selected={filters.source === s.value}
            count={s.value === "all" ? total : bySource[s.value] ?? 0}
            onClick={() => setFilters({ source: s.value })}
            role="radio"
          >
            {s.label}
          </FilterChip>
        ))}
      </FilterRow>

      <FilterRow label="sort">
        <FilterChip
          tone="blueprint"
          selected={sort === "posture_score:desc"}
          onClick={() => onSortChange("posture_score:desc")}
        >
          posture ▼
        </FilterChip>
        <FilterChip
          tone="blueprint"
          selected={sort === "posture_score:asc"}
          onClick={() => onSortChange("posture_score:asc")}
        >
          posture ▽
        </FilterChip>
        <FilterChip
          tone="blueprint"
          selected={sort === "last_seen:asc"}
          onClick={() => onSortChange("last_seen:asc")}
        >
          t₀ ▽
        </FilterChip>
        <FilterChip
          tone="blueprint"
          selected={sort === "last_seen:desc"}
          onClick={() => onSortChange("last_seen:desc")}
        >
          t₀ ▼
        </FilterChip>
      </FilterRow>
    </section>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-[12px] py-[4px]">
      <span className="w-[110px] shrink-0 font-mono text-[11px] leading-none font-medium text-bone-dim lowercase">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-[8px]">{children}</div>
    </div>
  );
}

function countBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const i of items) {
    const k = key(i);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function countBySource(items: { discovery_sources: DiscoverySource[] }[]) {
  const out: Record<string, number> = {};
  for (const i of items) {
    for (const s of i.discovery_sources) out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

export type { SortOption };
