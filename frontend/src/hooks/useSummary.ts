import { useQuery } from "@tanstack/react-query";
import { getSummary } from "@/api/endpoints";

export function useSummary() {
  return useQuery({
    queryKey: ["summary"],
    queryFn: getSummary,
    staleTime: 30_000,
  });
}
