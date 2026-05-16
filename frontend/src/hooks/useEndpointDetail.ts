import { useQuery } from "@tanstack/react-query";
import { getEndpoint } from "@/api/endpoints";

export function useEndpointDetail(id: string | null) {
  return useQuery({
    queryKey: ["endpoint", id],
    queryFn: () => getEndpoint(id as string),
    enabled: !!id,
    staleTime: 60_000,
  });
}
