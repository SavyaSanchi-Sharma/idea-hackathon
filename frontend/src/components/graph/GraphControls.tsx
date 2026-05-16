import { FilterChip } from "@/components/common/FilterChip";
import type { Classification } from "@/types/models";

interface GraphControlsProps {
  classification: Classification | "all";
  onClassificationChange: (c: Classification | "all") => void;
  search: string;
  onSearchChange: (s: string) => void;
}

/**
 * Filter rail above the graph: classification chips + a path-search input.
 */
export function GraphControls({
  classification,
  onClassificationChange,
  search,
  onSearchChange,
}: GraphControlsProps) {
  return (
    <section
      aria-label="graph filters"
      className="flex flex-col gap-[8px] border-b border-hairline bg-stratum px-[24px] py-[10px]"
    >
      <div className="flex items-center gap-[12px]">
        <span className="w-[100px] shrink-0 font-mono text-[11px] leading-none font-medium text-bone-dim lowercase">
          classification
        </span>
        <div className="flex flex-wrap items-center gap-[8px]">
          <FilterChip
            tone="neutral"
            selected={classification === "all"}
            onClick={() => onClassificationChange("all")}
          >
            all
          </FilterChip>
          <FilterChip
            tone="active"
            selected={classification === "active"}
            onClick={() => onClassificationChange("active")}
          >
            active
          </FilterChip>
          <FilterChip
            tone="deprecated"
            selected={classification === "deprecated"}
            onClick={() => onClassificationChange("deprecated")}
          >
            deprecated
          </FilterChip>
          <FilterChip
            tone="orphaned"
            selected={classification === "orphaned"}
            onClick={() => onClassificationChange("orphaned")}
          >
            orphaned
          </FilterChip>
        </div>
        <label className="ml-auto relative flex h-[28px] items-center gap-[6px] border border-hairline bg-tar px-[10px] rounded-xs w-[280px] focus-within:border-blueprint">
          <span className="font-mono text-[12px] leading-none text-sediment">path ·</span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="/v1/..."
            aria-label="filter graph by path"
            className="flex-1 bg-transparent outline-none border-none font-mono text-[12px] leading-none text-bone placeholder:text-sediment-strong"
          />
        </label>
      </div>
    </section>
  );
}
