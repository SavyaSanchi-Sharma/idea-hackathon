import { useQuery } from "@tanstack/react-query";
import { getGraph } from "@/api/endpoints";
import type { Classification } from "@/types/models";

export function useGraph(filters: { classification?: Classification; type?: string } = {}) {
  return useQuery({
    queryKey: ["graph", filters],
    queryFn: () => getGraph(filters),
    staleTime: 60_000,
    refetchInterval: 4_000,
  });
}
