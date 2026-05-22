import type {
  ApiGraph,
  BlastRadius,
  Classification,
  DiscoverySource,
  Endpoint,
  EndpointSequence,
  ModelMetrics,
  RecommendedAction,
  RiskTier,
  ScanEvent,
  ScanJob,
  SummaryStats,
} from "@/types/models";
import { apiRequest } from "./client";

export interface EndpointsQuery {
  classification?: Classification | "all";
  risk_tier?: RiskTier | "all";
  source?: DiscoverySource | "all";
  search?: string;
  sort?: string;
  page?: number;
  page_size?: number;
  needs_review?: boolean;
  is_zombie?: boolean;
  is_shadow?: boolean;
  anomaly_flag?: boolean;
}

export interface EndpointsResponse {
  items: Endpoint[];
  total: number;
  page: number;
}

export const getHealth = () => apiRequest<{ status: string }>("/health");

export const getSummary = () => apiRequest<SummaryStats>("/api/stats/summary");

export const startScan = () =>
  apiRequest<{ scan_id: string }>("/api/scan/start", { method: "POST" });

export const getScan = (id: string) =>
  apiRequest<ScanJob>(`/api/scan/${encodeURIComponent(id)}`);

export const getScanEvents = (id: string) =>
  apiRequest<ScanEvent[]>(`/api/scan/${encodeURIComponent(id)}/events`);

export const getEndpoints = (query: EndpointsQuery = {}) =>
  apiRequest<EndpointsResponse>("/api/endpoints", {
    query: {
      classification: query.classification,
      risk_tier: query.risk_tier,
      source: query.source,
      search: query.search,
      sort: query.sort,
      page: query.page,
      page_size: query.page_size,
      needs_review: query.needs_review ? true : undefined,
      is_zombie: query.is_zombie ? true : undefined,
      is_shadow: query.is_shadow ? true : undefined,
      anomaly_flag: query.anomaly_flag ? true : undefined,
    },
  });

export const getReviewQueue = (page = 1, pageSize = 50) =>
  apiRequest<EndpointsResponse>("/api/review-queue", {
    query: { page, page_size: pageSize },
  });

export const getModelMetrics = () =>
  apiRequest<ModelMetrics>("/api/models/metrics");

export const getEndpointSequence = (id: string) =>
  apiRequest<EndpointSequence>(`/api/endpoints/${encodeURIComponent(id)}/sequence`);

export const getEndpoint = (id: string) =>
  apiRequest<Endpoint>(`/api/endpoints/${encodeURIComponent(id)}`);

export const getGraph = (query: { classification?: Classification; type?: string } = {}) =>
  apiRequest<ApiGraph>("/api/graph", { query });

export const getBlastRadius = (endpointId: string) =>
  apiRequest<BlastRadius>(`/api/graph/blast-radius/${encodeURIComponent(endpointId)}`);

export const getRegistry = () =>
  apiRequest<{ items: Endpoint[]; total: number }>("/api/registry");

export const postEndpointAction = (id: string, action: RecommendedAction) =>
  apiRequest<{ ok: true }>(`/api/endpoints/${encodeURIComponent(id)}/action`, {
    method: "POST",
    body: { action },
  });

export interface ReportResponse {
  endpoint_id: string;
  report_kind: "threat_narrative" | "remediation_playbook" | "compliance_summary";
  framework: string;
  output: string;
  generation_ms: number;
  model: string;
}

export interface ReportRow {
  endpoint_id: number[];
  report_kind: string;
  framework: string;
  system_prompt: string;
  user_context: string;
  model_output: string;
  model_name: string;
  generated_at: number;
  generation_ms: number;
}

export const generateNarrative = (id: string) =>
  apiRequest<ReportResponse>(`/api/endpoints/${encodeURIComponent(id)}/narrative`, {
    method: "POST",
  });

export const generatePlaybook = (id: string) =>
  apiRequest<ReportResponse>(`/api/endpoints/${encodeURIComponent(id)}/playbook`, {
    method: "POST",
  });

export type ComplianceFramework = "rbi_2024" | "pci_dss";

export const generateCompliance = (id: string, framework: ComplianceFramework = "rbi_2024") =>
  apiRequest<ReportResponse>(`/api/endpoints/${encodeURIComponent(id)}/compliance`, {
    method: "POST",
    query: { framework },
  });

export const getEndpointReports = (id: string) =>
  apiRequest<ReportRow[]>(`/api/endpoints/${encodeURIComponent(id)}/reports`);
