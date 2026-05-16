import { useQuery } from "@tanstack/react-query";
import { getEndpoints, type EndpointsQuery } from "@/api/endpoints";

export function useEndpoints(query: EndpointsQuery = {}) {
  return useQuery({
    queryKey: ["endpoints", query],
    queryFn: () => getEndpoints(query),
    staleTime: 30_000,
  });
}
