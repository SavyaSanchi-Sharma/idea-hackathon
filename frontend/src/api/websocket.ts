import type { Endpoint, ScanEvent, ScanJob, ScanStats } from "@/types/models";
import { buildScanSimulation } from "./fixtures";

export type WsMessage =
  | { type: "scan_progress"; payload: { scan_id: string; progress: number; stats: ScanStats } }
  | { type: "scan_event"; payload: ScanEvent }
  | { type: "endpoint_update"; payload: Endpoint }
  | { type: "scan_complete"; payload: ScanJob };

export type WsStatus = "connecting" | "open" | "closed" | "fixture";

export interface WsClient {
  status(): WsStatus;
  onMessage(handler: (msg: WsMessage) => void): () => void;
  onStatus(handler: (status: WsStatus) => void): () => void;
  connect(): void;
  close(): void;
  // Pumps the canned scan simulation through the same onMessage handlers
  // so the UI behavior is identical to a real WS stream.
  emitSimulatedScan(scanId: string): void;
}

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws";
const USE_FIXTURE = import.meta.env.VITE_USE_FIXTURE === "true";
const BACKOFF_BASE_MS = 800;
const BACKOFF_MAX_MS = 8_000;

function isWsMessage(value: unknown): value is WsMessage {
  if (!value || typeof value !== "object") return false;
  const t = (value as { type?: unknown }).type;
  return (
    t === "scan_progress" ||
    t === "scan_event" ||
    t === "endpoint_update" ||
    t === "scan_complete"
  );
}

export function createWsClient(): WsClient {
  let socket: WebSocket | null = null;
  let status: WsStatus = USE_FIXTURE ? "fixture" : "closed";
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closedByCaller = false;

  const messageHandlers = new Set<(msg: WsMessage) => void>();
  const statusHandlers = new Set<(status: WsStatus) => void>();

  function setStatus(next: WsStatus) {
    if (status === next) return;
    status = next;
    for (const h of statusHandlers) h(next);
  }

  function emit(msg: WsMessage) {
    for (const h of messageHandlers) h(msg);
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
      socket = new WebSocket(WS_URL);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[ws] constructor failed", err);
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
        const parsed: unknown = JSON.parse(typeof event.data === "string" ? event.data : "");
        if (isWsMessage(parsed)) emit(parsed);
      } catch {
        // ignore malformed frames
      }
    };

    socket.onerror = () => {
      // onclose will follow; reconnect is handled there
    };

    socket.onclose = () => {
      setStatus("closed");
      socket = null;
      scheduleReconnect();
    };
  }

  function connect() {
    if (USE_FIXTURE) {
      setStatus("fixture");
      return;
    }
    closedByCaller = false;
    open();
  }

  function close() {
    closedByCaller = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    socket?.close();
    socket = null;
    setStatus("closed");
  }

  function emitSimulatedScan(scanId: string) {
    const sequence = buildScanSimulation(scanId);
    const interval = 320; // ms between frames — ~10s total
    sequence.forEach((msg, idx) => {
      setTimeout(() => emit(msg), idx * interval);
    });
  }

  return {
    status: () => status,
    onMessage(handler) {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    onStatus(handler) {
      statusHandlers.add(handler);
      handler(status);
      return () => statusHandlers.delete(handler);
    },
    connect,
    close,
    emitSimulatedScan,
  };
}

// Single shared client for the app lifetime
let singleton: WsClient | null = null;
export function getWsClient(): WsClient {
  if (!singleton) singleton = createWsClient();
  return singleton;
}
