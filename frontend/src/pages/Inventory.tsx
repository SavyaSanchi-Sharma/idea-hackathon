import { useState } from "react";
import { FilterBar, type SortOption } from "@/components/inventory/FilterBar";
import { EndpointTable } from "@/components/inventory/EndpointTable";

export default function Inventory() {
  const [sort, setSort] = useState<SortOption>("posture_score:desc");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <FilterBar sort={sort} onSortChange={setSort} />
      <EndpointTable sort={sort} />
    </div>
  );
}
