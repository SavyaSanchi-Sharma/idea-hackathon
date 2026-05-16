export type Classification = "active" | "deprecated" | "orphaned";
export type RiskTier = "critical" | "high" | "medium" | "low";
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export type DiscoverySource = "traffic_logs" | "registry" | "code_scan";
export type RecommendedAction = "monitor" | "quarantine" | "block" | "playbook";

export interface ScoreFactor {
  score: number;
  weight: number;
  detail: string;
}

export interface ScoreFactors {
  data_sensitivity: ScoreFactor;
  auth_strength: ScoreFactor;
  staleness: ScoreFactor;
  blast_radius: ScoreFactor;
  cve_owasp_match: ScoreFactor;
}

export interface CveMatch {
  id: string;
  score: number;
  summary: string;
}

export interface TrafficInfo {
  calls_30d: number;
  last_seen: string;
  trend_pct: number;
  sparkline: number[];
}

export interface OwnerInfo {
  team: string | null;
  last_author: string | null;
}

export interface AuthInfo {
  type: string;
  rate_limited: boolean;
  mfa: boolean;
}

export type ServiceLane =
  | "auth"
  | "core"
  | "payments"
  | "upi"
  | "imps"
  | "neft"
  | "rtgs"
  | "kyc"
  | "aml"
  | "cards"
  | "internal"
  | "legacy";

export interface Endpoint {
  id: string;
  /** STRATA specimen id, lowercased zh-NNNN. */
  specimen_id: string;
  /** Birth year of the endpoint (informational; rounded). */
  birth_year: number;
  /** First-deployed timestamp, ISO. */
  t0: string;
  /** Service lane for the stratigraphic graph. */
  service_lane: ServiceLane;
  method: HttpMethod;
  path: string;
  service: string;
  classification: Classification;
  classification_reasons: string[];
  posture_score: number;
  score_factors: ScoreFactors;
  risk_tier: RiskTier;
  discovery_sources: DiscoverySource[];
  in_registry: boolean;
  owner: OwnerInfo;
  traffic: TrafficInfo;
  auth: AuthInfo;
  data_classes: string[];
  last_commit: string | null;
  last_deploy: string | null;
  cve_matches: CveMatch[];
  owasp_tags: string[];
  threat_narrative: string;
  recommended_action: RecommendedAction;
  blast_radius_nodes: string[];
}

export type GraphNodeType =
  | "endpoint"
  | "service"
  | "database"
  | "gateway"
  | "team"
  | "deployment"
  | "consumer"
  | "auth_system"
  | "risk_finding";

export type GraphEdgeType =
  | "calls"
  | "routes_to"
  | "queries"
  | "owned_by"
  | "depends_on"
  | "exposes";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  classification?: Classification;
  risk_tier?: RiskTier;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: GraphEdgeType;
}

export interface ApiGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface BlastRadius {
  origin_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  affected_records: number;
  affected_systems: string[];
  has_write_access: boolean;
}

export type ScanStatus = "queued" | "running" | "complete" | "failed";

export interface ScanStats {
  total_discovered: number;
  active: number;
  deprecated: number;
  orphaned: number;
  critical: number;
  unknown_vs_registry: number;
}

export interface ScanJob {
  id: string;
  status: ScanStatus;
  started_at: string;
  completed_at: string | null;
  progress: number;
  stats: ScanStats;
}

export type ScanPhase =
  | "ingest"
  | "parse"
  | "graph"
  | "classify"
  | "score"
  | "reason"
  | "complete";

export interface ScanEvent {
  scan_id: string;
  ts: string;
  phase: ScanPhase;
  message: string;
  endpoint_id?: string;
  severity: "info" | "warning" | "critical";
}

export interface SummaryStats {
  registry_baseline: number;
  total_discovered: number;
  active: number;
  deprecated: number;
  orphaned: number;
  critical: number;
  last_scan_at: string | null;
}
