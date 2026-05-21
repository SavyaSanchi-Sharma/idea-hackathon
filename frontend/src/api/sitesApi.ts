/**
 * Borehole (Live Ingest) API surface.
 *
 * REST mirrors the existing `endpoints.ts` style: thin typed wrappers over
 * `apiRequest`. WS is per-site, NOT the singleton — each borehole owns its
 * own socket so opening/closing one detail page doesn't disturb others.
 */
import type { Endpoint, ServiceLane } from "@/types/models";
import { apiRequest } from "./client";

// ─── shapes ────────────────────────────────────────────────────────────────

export type SourceType = "docker" | "file_replay";

export interface DockerSourceConfig {
  container: string;
  tail?: number;
}
export interface FileReplaySourceConfig {
  path: string;
  replay_speed?: number | null;
  loop?: boolean;
}

export interface SiteCreatePayload {
  name: string;
  source_type: SourceType;
  source_config: DockerSourceConfig | FileReplaySourceConfig;
  service_lane: ServiceLane | "general";
  runtime: string;
  runtime_version: string;
}

export interface SiteStats {
  lines_ingested: number;
  lines_dropped: number;
  parser_format: "json" | "nginx" | "unknown" | string;
  endpoints_discovered: number;
  started_at: number;
  ws_subscribers: number;
}

export interface Site {
  id: string;
  name: string;
  source_type: SourceType;
  source_config: DockerSourceConfig | FileReplaySourceConfig;
  service_lane: ServiceLane | "general";
  runtime: string;
  runtime_version: string;
  created_at: number;
  status: "active" | "stopped" | "error" | string;
  stats: SiteStats;
}

export interface SiteListResponse {
  items: Site[];
  total: number;
}

export interface SiteEndpointsResponse {
  items: Endpoint[];
  total: number;
  warming_up?: boolean;
}

export interface BoringLogEvent {
  ts: number;
  method: string | null;
  path: string | null;
  status: number | null;
  latency_ms: number | null;
  auth_present: boolean | null;
  raw: string;
  parsed: boolean;
}

export interface SiteLogsResponse {
  items: BoringLogEvent[];
  total: number;
}

export interface ChatRequestBody {
  q: string;
  window_seconds?: number;
  max_lines?: number;
  max_endpoints?: number;
}

export interface ChatLogSnapshotLine {
  index: number;
  ts: number | null;
  method: string | null;
  path: string | null;
  status: number | null;
  latency_ms: number | null;
  raw: string;
  parsed: boolean;
}

export interface ChatResponse {
  answer: string;
  cited_lines: number[];
  log_snapshot: ChatLogSnapshotLine[];
  endpoints_used: Array<{
    id: string;
    method: string;
    path: string;
    classification: string;
    risk_tier: string;
    posture_score: number;
    owasp_tags: string[];
  }>;
  model: string;
  usage: { prompt_tokens: number | null; completion_tokens: number | null };
}

export interface ChatHealthResponse {
  llm: { configured: boolean; model: string; host: string };
}

// ─── REST ──────────────────────────────────────────────────────────────────

export const listSites = () => apiRequest<SiteListResponse>("/api/sites");

export const getSite = (id: string) =>
  apiRequest<Site>(`/api/sites/${encodeURIComponent(id)}`);

export const createSite = (body: SiteCreatePayload) =>
  apiRequest<Site>("/api/sites", { method: "POST", body });

export const deleteSite = (id: string) =>
  apiRequest<{ ok: true; id: string }>(`/api/sites/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const listSiteEndpoints = (id: string) =>
  apiRequest<SiteEndpointsResponse>(`/api/sites/${encodeURIComponent(id)}/endpoints`);

export const getSiteLogs = (id: string, limit = 200) =>
  apiRequest<SiteLogsResponse>(
    `/api/sites/${encodeURIComponent(id)}/logs`,
    { query: { limit } },
  );

export const postChat = (id: string, body: ChatRequestBody) =>
  apiRequest<ChatResponse>(
    `/api/sites/${encodeURIComponent(id)}/chat`,
    { method: "POST", body },
  );

export const getChatHealth = (id: string) =>
  apiRequest<ChatHealthResponse>(`/api/sites/${encodeURIComponent(id)}/chat/health`);

// ─── per-site WebSocket ────────────────────────────────────────────────────

export interface WireLogEvent {
  seq: number;
  ts: number;
  method: string | null;
  path: string | null;
  status: number | null;
  latency_ms: number | null;
  auth_present: boolean | null;
  raw: string;
  parsed: boolean;
}

export type SiteWsMessage =
  | { type: "snapshot"; site_id: string; endpoints: Endpoint[] }
  | { type: "log_events_batch"; site_id: string; events: WireLogEvent[] }
  | { type: "endpoint_update"; site_id: string; endpoint: Endpoint }
  | { type: "ingest_error"; site_id: string; error: string }
  | { type: "inference_error"; site_id: string; endpoint_key: string; error: string };

export type SiteWsStatus = "connecting" | "open" | "closed";

export interface SiteWsHandle {
  status(): SiteWsStatus;
  close(): void;
}

const HTTP_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const BACKOFF_BASE_MS = 800;
const BACKOFF_MAX_MS = 8_000;

function siteWsUrl(siteId: string): string {
  const explicit = import.meta.env.VITE_WS_BASE_URL;
  if (typeof explicit === "string" && explicit.length > 0) {
    return `${explicit.replace(/\/+$/, "")}/ws/sites/${encodeURIComponent(siteId)}`;
  }
  // Derive ws:// (or wss://) from HTTP_BASE so prod deploys behind TLS just work.
  try {
    const u = new URL(HTTP_BASE);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${u.host}/ws/sites/${encodeURIComponent(siteId)}`;
  } catch {
    return `ws://localhost:8000/ws/sites/${encodeURIComponent(siteId)}`;
  }
}

/**
 * Open a fresh WS for one borehole. Auto-reconnects with exponential backoff
 * until `close()` is called. `onStatus` is invoked synchronously on subscribe
 * with the current status so React renders are accurate from the first paint.
 */
export function openSiteFeed(
  siteId: string,
  onMessage: (msg: SiteWsMessage) => void,
  onStatus?: (s: SiteWsStatus) => void,
): SiteWsHandle {
  let socket: WebSocket | null = null;
  let status: SiteWsStatus = "closed";
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closedByCaller = false;

  function setStatus(next: SiteWsStatus) {
    if (status === next) return;
    status = next;
    onStatus?.(next);
  }

  function isMsg(v: unknown): v is SiteWsMessage {
    if (!v || typeof v !== "object") return false;
    const t = (v as { type?: unknown }).type;
    return (
      t === "snapshot" ||
      t === "log_events_batch" ||
      t === "endpoint_update" ||
      t === "ingest_error" ||
      t === "inference_error"
    );
  }

  function scheduleReconnect() {
    if (closedByCaller) return;
    const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_MAX_MS);
    attempt += 1;
    reconnectTimer = setTimeout(open, delay);
  }

  function open() {
    if (closedByCaller) return;
    setStatus("connecting");
    try {
      socket = new WebSocket(siteWsUrl(siteId));
    } catch {
      setStatus("closed");
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      attempt = 0;
      setStatus("open");
    };
    socket.onmessage = (event) => {
      try {
        const parsed: unknown = JSON.parse(
          typeof event.data === "string" ? event.data : "",
        );
        if (isMsg(parsed)) onMessage(parsed);
      } catch {
        // ignore malformed frames
      }
    };
    socket.onerror = () => {
      // onclose follows; reconnect handled there
    };
    socket.onclose = () => {
      setStatus("closed");
      socket = null;
      scheduleReconnect();
    };
  }

  onStatus?.(status);
  open();

  return {
    status: () => status,
    close() {
      closedByCaller = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
      socket = null;
      setStatus("closed");
    },
  };
}
