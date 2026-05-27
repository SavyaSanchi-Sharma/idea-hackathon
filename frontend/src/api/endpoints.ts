import type {
  ApiGraph,
  BlastRadius,
  Classification,
  DiscoverySource,
  Endpoint,
  EndpointSequence,
  GraphEdge,
  GraphEdgeType,
  GraphNode,
  GraphNodeType,
  HttpMethod,
  ModelMetrics,
  RecommendedAction,
  RiskTier,
  ScanEvent,
  ScanJob,
  ServiceLane,
  SummaryStats,
} from "@/types/models";
import { aiEngineRequest, apiRequest } from "./client";

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

// ─── pipe → frontend adapters ──────────────────────────────────────────────
//
// Pipe (the Rust backend) returns flatter shapes with snake_case fields that
// don't line up 1:1 with the frontend's Endpoint/ApiGraph types (designed
// for the earlier ai_engine FastAPI). These adapters fill the gap so call
// sites stay typed without touching every component.

// Add new lanes to this map as pipe starts emitting new service names. Order
// matters: the first prefix/contains match wins.
const LANE_KEYWORDS: Array<[string, ServiceLane]> = [
  ["upi", "upi"],
  ["imps", "imps"],
  ["neft", "neft"],
  ["rtgs", "rtgs"],
  ["payment", "payments"],
  ["auth", "auth"],
  ["kyc", "kyc"],
  ["aml", "aml"],
  ["card", "cards"],
  ["legacy", "legacy"],
  ["internal", "internal"],
];

function inferServiceLane(service: string | undefined, path: string | undefined): ServiceLane {
  const hay = `${service ?? ""} ${path ?? ""}`.toLowerCase();
  for (const [needle, lane] of LANE_KEYWORDS) {
    if (hay.includes(needle)) return lane;
  }
  return "core";
}

function safeBirthYear(t0: string | null | undefined): number {
  if (!t0) return new Date().getFullYear();
  const d = new Date(t0);
  if (Number.isNaN(d.getTime())) return new Date().getFullYear();
  return d.getUTCFullYear();
}

function specimenIdFor(rawId: string): string {
  // 4-char prefix gives 65k codes — plenty for the demo data; collisions are
  // visual-only since drawer lookups use the full id.
  return `zh-${rawId.slice(0, 4)}`;
}

function zeroFactor() {
  return { score: 0, weight: 0, detail: "" };
}

function zeroScoreFactors() {
  return {
    data_sensitivity: zeroFactor(),
    auth_strength: zeroFactor(),
    staleness: zeroFactor(),
    blast_radius: zeroFactor(),
    cve_owasp_match: zeroFactor(),
  };
}

interface PipeEndpointBase {
  endpoint_id: string;
  method?: string;
  path?: string;
  service?: string;
  owner_team?: string | null;
  in_registry?: boolean;
  rule_state?: string;
  ml_state?: string;
  ml_confidence?: number;
  needs_review?: boolean;
  risk_score?: number;
  risk_band?: string;
  owasp_findings?: string[];
  finding_count?: number;
  rule_is_zombie?: boolean;
  rule_is_shadow?: boolean;
  updated_at?: string;
  // Detail-only extras
  auth_scheme?: string;
  runtime?: string;
  runtime_version?: string;
  schema_count?: number;
  max_cvss?: number;
  cve_ids?: string[];
  last_commit_date?: string | null;
  registry_first_seen?: string | null;
  registry_last_modified?: string | null;
  registry_deleted_at?: string | null;
  deprecated_flag?: boolean;
  owner_present?: boolean;
  prediction?: {
    rule_state?: string;
    ml_state?: string;
    ml_confidence?: number;
    needs_review?: boolean;
    risk_score?: number;
    risk_band?: string;
    owasp_findings?: string[];
    finding_count?: number;
    rule_is_zombie?: boolean;
    rule_is_shadow?: boolean;
    // Pipe sends this as a single string ("no owner, deprecated flag set, ...").
    // Older shapes used string[]. Accept either — the adapter normalizes.
    rule_reason?: string | string[];
  };
}

function adaptEndpoint(raw: PipeEndpointBase): Endpoint {
  // Detail responses nest classification under `prediction`; list responses
  // put it at the top level. Pull from both so this adapter works for either.
  const p = raw.prediction ?? {};
  const ruleState = (raw.rule_state ?? p.rule_state ?? "active") as Classification;
  const mlState = (raw.ml_state ?? p.ml_state ?? ruleState) as Classification;
  const classification = ruleState;
  const riskBand = (raw.risk_band ?? p.risk_band ?? "low") as RiskTier;
  const riskScore = raw.risk_score ?? p.risk_score ?? 0;
  const owaspFindings = raw.owasp_findings ?? p.owasp_findings ?? [];
  const findingCount = raw.finding_count ?? p.finding_count ?? owaspFindings.length;
  const isZombie = raw.rule_is_zombie ?? p.rule_is_zombie ?? false;
  const isShadow = raw.rule_is_shadow ?? p.rule_is_shadow ?? false;
  const needsReview = raw.needs_review ?? p.needs_review ?? false;
  const mlConfidence = raw.ml_confidence ?? p.ml_confidence;
  // rule_reason may arrive as a single string or as a list; normalize to string[].
  // Split single comma-separated strings so the drawer renders one bullet per fact.
  let reasons: string[] = [];
  if (Array.isArray(p.rule_reason)) {
    reasons = p.rule_reason.filter((s): s is string => typeof s === "string" && s.length > 0);
  } else if (typeof p.rule_reason === "string" && p.rule_reason.length > 0) {
    reasons = p.rule_reason.split(/,\s*/).filter((s) => s.length > 0);
  }

  const t0 = raw.registry_first_seen ?? raw.updated_at ?? new Date().toISOString();
  const cveIds = raw.cve_ids ?? [];
  const maxCvss = raw.max_cvss ?? 0;

  return {
    id: raw.endpoint_id,
    specimen_id: specimenIdFor(raw.endpoint_id),
    birth_year: safeBirthYear(raw.registry_first_seen ?? raw.last_commit_date ?? raw.updated_at),
    t0,
    service_lane: inferServiceLane(raw.service, raw.path),
    method: (raw.method ?? "GET") as HttpMethod,
    path: raw.path ?? "",
    service: raw.service ?? "",
    classification,
    classification_reasons: reasons.length > 0 ? reasons : ["classification inferred from rule engine"],
    posture_score: Math.round(riskScore),
    score_factors: zeroScoreFactors(),
    risk_tier: riskBand,
    discovery_sources: raw.in_registry ? ["registry", "traffic_logs"] : ["traffic_logs"],
    in_registry: raw.in_registry ?? false,
    owner: { team: raw.owner_team ?? null, last_author: null },
    traffic: {
      calls_30d: 0,
      last_seen: raw.updated_at ?? t0,
      trend_pct: 0,
      sparkline: [],
    },
    auth: {
      type: raw.auth_scheme ?? "unknown",
      rate_limited: false,
      mfa: false,
    },
    data_classes: [],
    last_commit: raw.last_commit_date ?? null,
    last_deploy: null,
    cve_matches: cveIds.map((id) => ({ id, score: maxCvss, summary: "" })),
    owasp_tags: owaspFindings,
    threat_narrative: "",
    recommended_action: "monitor" as RecommendedAction,
    blast_radius_nodes: [],
    rule_state: ruleState,
    ml_state: mlState,
    ml_confidence: mlConfidence,
    needs_review: needsReview,
    is_zombie: isZombie,
    is_shadow: isShadow,
    finding_count: findingCount,
  };
}

interface PipeGraphNode {
  id: string;
  kind: string;
  label: string;
  props?: Record<string, unknown>;
}
interface PipeGraphEdge {
  src?: string;
  dst?: string;
  source?: string;
  target?: string;
  kind?: string;
  type?: string;
}
interface PipeGraph {
  nodes: PipeGraphNode[];
  edges: PipeGraphEdge[];
}

function adaptGraphNode(n: PipeGraphNode): GraphNode {
  const props = n.props ?? {};
  const service = typeof props.service === "string" ? props.service : undefined;
  const path = typeof props.path === "string" ? props.path : undefined;
  const firstSeen =
    typeof props.registry_first_seen === "string"
      ? props.registry_first_seen
      : typeof props.last_commit_date === "string"
        ? props.last_commit_date
        : undefined;
  return {
    id: n.id,
    type: (n.kind as GraphNodeType) ?? "service",
    label: n.label,
    metadata: {
      ...props,
      service_lane: inferServiceLane(service, path),
      birth_year: safeBirthYear(firstSeen),
    },
  };
}

function adaptGraphEdge(e: PipeGraphEdge): GraphEdge {
  return {
    source: e.source ?? e.src ?? "",
    target: e.target ?? e.dst ?? "",
    type: ((e.type ?? e.kind) as GraphEdgeType) ?? "calls",
  };
}

function adaptGraph(raw: PipeGraph): ApiGraph {
  return {
    nodes: (raw.nodes ?? []).map(adaptGraphNode),
    edges: (raw.edges ?? []).map(adaptGraphEdge).filter((e) => e.source && e.target),
  };
}

interface PipeBlastRadius extends PipeGraph {
  origin_id?: string;
  affected_records?: number;
  affected_systems?: string[];
  has_write_access?: boolean;
}

function adaptBlastRadius(raw: PipeBlastRadius, fallbackOriginId: string): BlastRadius {
  const g = adaptGraph(raw);
  return {
    origin_id: raw.origin_id ?? fallbackOriginId,
    nodes: g.nodes,
    edges: g.edges,
    affected_records: raw.affected_records ?? 0,
    affected_systems: raw.affected_systems ?? [],
    has_write_access: raw.has_write_access ?? false,
  };
}

// ─── pipe (Rust) routes ────────────────────────────────────────────────────

export const getHealth = () => apiRequest<{ status: string }>("/health");

export const getSummary = () => apiRequest<SummaryStats>("/api/stats/summary");

export const startScan = () =>
  apiRequest<{ scan_id: string }>("/api/scan/start", { method: "POST" });

export const getScan = (id: string) =>
  apiRequest<ScanJob>(`/api/scan/${encodeURIComponent(id)}`);

export const getScanEvents = (id: string) =>
  apiRequest<ScanEvent[]>(`/api/scan/${encodeURIComponent(id)}/events`);

export const getEndpoints = async (query: EndpointsQuery = {}): Promise<EndpointsResponse> => {
  const raw = await apiRequest<{ items: PipeEndpointBase[]; total: number; page: number }>(
    "/api/endpoints",
    {
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
    },
  );
  return {
    items: raw.items.map(adaptEndpoint),
    total: raw.total,
    page: raw.page,
  };
};

// Endpoint IDs come in two shapes:
//   - 32-char hex   → pipe (Rust): adapt the flat response
//   - `ep_NNNN` / anything else → ai_engine (FastAPI): already in frontend shape
// Borehole "horizons" are produced by ai_engine's live ingest plane and use the
// ep_NNNN form, so routing by ID format keeps the drawer working for both.
const PIPE_ID_RE = /^[0-9a-f]{32}$/i;

export const getEndpoint = async (id: string): Promise<Endpoint> => {
  if (PIPE_ID_RE.test(id)) {
    const raw = await apiRequest<PipeEndpointBase>(`/api/endpoints/${encodeURIComponent(id)}`);
    return adaptEndpoint(raw);
  }
  // ai_engine already returns the full Endpoint shape — no adapter needed.
  return aiEngineRequest<Endpoint>(`/api/endpoints/${encodeURIComponent(id)}`);
};

export const getGraph = async (
  query: { classification?: Classification; type?: string } = {},
): Promise<ApiGraph> => {
  const raw = await apiRequest<PipeGraph>("/api/graph", { query });
  return adaptGraph(raw);
};

export const getBlastRadius = async (endpointId: string): Promise<BlastRadius> => {
  const raw = await apiRequest<PipeBlastRadius>(
    `/api/graph/blast-radius/${encodeURIComponent(endpointId)}`,
  );
  return adaptBlastRadius(raw, endpointId);
};

// ─── ai_engine (FastAPI) routes — pipe doesn't implement these ─────────────

export const getReviewQueue = (page = 1, pageSize = 50) =>
  aiEngineRequest<EndpointsResponse>("/api/review-queue", {
    query: { page, page_size: pageSize },
  });

export const getModelMetrics = () =>
  aiEngineRequest<ModelMetrics>("/api/models/metrics");

export const getEndpointSequence = (id: string) =>
  aiEngineRequest<EndpointSequence>(`/api/endpoints/${encodeURIComponent(id)}/sequence`);

export const getRegistry = () =>
  aiEngineRequest<{ items: Endpoint[]; total: number }>("/api/registry");

export const postEndpointAction = (id: string, action: RecommendedAction) =>
  aiEngineRequest<{ ok: true }>(`/api/endpoints/${encodeURIComponent(id)}/action`, {
    method: "POST",
    body: { action },
  });

// ─── SLM reports (pipe) ────────────────────────────────────────────────────

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
