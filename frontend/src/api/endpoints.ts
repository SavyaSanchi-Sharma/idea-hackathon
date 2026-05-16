import type {
  ApiGraph,
  BlastRadius,
  Classification,
  DiscoverySource,
  Endpoint,
  RecommendedAction,
  RiskTier,
  ScanEvent,
  ScanJob,
  SummaryStats,
} from "@/types/models";
import { apiRequest, withFixtureFallback } from "./client";
import {
  FIXTURE_BLAST_RADIUS,
  FIXTURE_ENDPOINTS,
  FIXTURE_GRAPH,
  FIXTURE_SUMMARY,
} from "./fixtures";

export interface EndpointsQuery {
  classification?: Classification | "all";
  risk_tier?: RiskTier | "all";
  source?: DiscoverySource | "all";
  search?: string;
  sort?: string;
  page?: number;
  page_size?: number;
}

export interface EndpointsResponse {
  items: Endpoint[];
  total: number;
  page: number;
}

function filterFixture(query: EndpointsQuery): EndpointsResponse {
  let items = [...FIXTURE_ENDPOINTS];
  if (query.classification && query.classification !== "all") {
    items = items.filter((e) => e.classification === query.classification);
  }
  if (query.risk_tier && query.risk_tier !== "all") {
    items = items.filter((e) => e.risk_tier === query.risk_tier);
  }
  if (query.source && query.source !== "all") {
    items = items.filter((e) => e.discovery_sources.includes(query.source as DiscoverySource));
  }
  if (query.search) {
    const needle = query.search.toLowerCase();
    items = items.filter(
      (e) =>
        e.path.toLowerCase().includes(needle) ||
        e.service.toLowerCase().includes(needle) ||
        e.id.toLowerCase().includes(needle),
    );
  }
  if (query.sort) {
    const [field, dir] = query.sort.split(":");
    const mul = dir === "desc" ? -1 : 1;
    items.sort((a, b) => {
      if (field === "posture_score") return mul * (a.posture_score - b.posture_score);
      if (field === "last_seen") return mul * a.traffic.last_seen.localeCompare(b.traffic.last_seen);
      return 0;
    });
  }
  const total = items.length;
  const page = query.page ?? 1;
  const pageSize = query.page_size ?? 50;
  const paged = items.slice((page - 1) * pageSize, page * pageSize);
  return { items: paged, total, page };
}

export const getHealth = () => apiRequest<{ status: string }>("/health");

export const getSummary = () =>
  withFixtureFallback<SummaryStats>(
    () => apiRequest("/api/stats/summary"),
    () => FIXTURE_SUMMARY,
  );

export const startScan = () =>
  withFixtureFallback<{ scan_id: string }>(
    () => apiRequest("/api/scan/start", { method: "POST" }),
    () => ({ scan_id: `scan_${Date.now().toString(36)}` }),
  );

export const getScan = (id: string) =>
  withFixtureFallback<ScanJob>(
    () => apiRequest(`/api/scan/${encodeURIComponent(id)}`),
    () => ({
      id,
      status: "running",
      started_at: new Date().toISOString(),
      completed_at: null,
      progress: 0,
      stats: {
        total_discovered: FIXTURE_SUMMARY.registry_baseline,
        active: FIXTURE_SUMMARY.active,
        deprecated: 0,
        orphaned: 0,
        critical: 0,
        unknown_vs_registry: 0,
      },
    }),
  );

export const getScanEvents = (id: string) =>
  withFixtureFallback<ScanEvent[]>(
    () => apiRequest(`/api/scan/${encodeURIComponent(id)}/events`),
    () => [],
  );

export const getEndpoints = (query: EndpointsQuery = {}) =>
  withFixtureFallback<EndpointsResponse>(
    () =>
      apiRequest("/api/endpoints", {
        query: {
          classification: query.classification,
          risk_tier: query.risk_tier,
          source: query.source,
          search: query.search,
          sort: query.sort,
          page: query.page,
          page_size: query.page_size,
        },
      }),
    () => filterFixture(query),
  );

export const getEndpoint = (id: string) =>
  withFixtureFallback<Endpoint>(
    () => apiRequest(`/api/endpoints/${encodeURIComponent(id)}`),
    () => {
      const match = FIXTURE_ENDPOINTS.find((e) => e.id === id);
      if (!match) throw new Error(`endpoint ${id} not found in fixture`);
      return match;
    },
  );

export const getGraph = (query: { classification?: Classification; type?: string } = {}) =>
  withFixtureFallback<ApiGraph>(
    () => apiRequest("/api/graph", { query }),
    () => FIXTURE_GRAPH,
  );

export const getBlastRadius = (endpointId: string) =>
  withFixtureFallback<BlastRadius>(
    () => apiRequest(`/api/graph/blast-radius/${encodeURIComponent(endpointId)}`),
    () => FIXTURE_BLAST_RADIUS(endpointId),
  );

export const getRegistry = () =>
  withFixtureFallback<{ items: Endpoint[]; total: number }>(
    () => apiRequest("/api/registry"),
    () => {
      const items = FIXTURE_ENDPOINTS.filter((e) => e.in_registry);
      return { items, total: items.length };
    },
  );

export const postEndpointAction = (id: string, action: RecommendedAction) =>
  withFixtureFallback<{ ok: true }>(
    () =>
      apiRequest(`/api/endpoints/${encodeURIComponent(id)}/action`, {
        method: "POST",
        body: { action },
      }),
    () => ({ ok: true }),
  );
