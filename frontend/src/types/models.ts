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

export interface RawSignals {
  auth_fail_rate_7d: number;
  p95_latency_ms: number;
  call_count_7d: number;
  schema_count: number;
  runtime: string;
  runtime_version: string;
  cve_id: string | null;
  max_cvss: number;
  last_seen_days: number;
  last_deploy_days: number;
}

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
  /** Deterministic rule verdict — registry's view (auditable, exact). */
  rule_state?: Classification;
  /** ML classifier verdict — telemetry's view (may diverge from rule_state). */
  ml_state?: Classification;
  /** Softmax of the winning ml_state class, 0..1. */
  ml_confidence?: number;
  /** True when rule_state ≠ ml_state — this is the "discovery" signal. */
  needs_review?: boolean;
  /** Sub-classifications under "orphaned" — zombie = high-traffic, shadow = not-in-registry. */
  is_zombie?: boolean;
  is_shadow?: boolean;
  /** IsolationForest output on the 30-day sequence. */
  anomaly_flag?: boolean;
  anomaly_score?: number | null;
  /** Number of OWASP API categories triggered for this row. */
  finding_count?: number;
  /** Raw per-row telemetry that drives the regressor and rule. */
  signals?: RawSignals;
}

export interface ModelMetrics {
  classifier?: {
    accuracy: number;
    macro_f1: number;
    confusion_matrix: number[][];
    per_class: Record<string, Record<string, number>>;
  };
  regressor?: {
    r2: number;
    mae: number;
    rmse: number;
    residual_mean: number;
    residual_std: number;
    band_mae: Record<string, number>;
  };
  anomaly?: {
    precision: number;
    recall: number;
    f1: number;
    roc_auc: number;
    confusion_matrix: number[][];
  };
}

export interface SequencePoint {
  day: number;
  call_count: number;
  auth_fail_rate: number;
  p95_latency_ms: number;
}

export interface EndpointSequence {
  endpoint_id: string;
  anomaly_flag: boolean;
  anomaly_score: number | null;
  points: SequencePoint[];
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
