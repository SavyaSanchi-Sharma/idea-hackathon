/**
 * `useSiteFeed(siteId)` — owns the WebSocket lifecycle for one borehole, plus
 * a hydrated REST snapshot at mount so the UI doesn't sit empty during the
 * first WS frame round-trip.
 *
 * Returns:
 *   - status: "connecting" | "open" | "closed"
 *   - endpoints: Endpoint[] (sorted by posture_score desc; live-updated via WS)
 *   - logs: WireLogEvent[] (capped at MAX_LOGS, newest last)
 *   - hydrated: true once the initial snapshot+history load resolved
 *
 * Per-site, not singleton: opening another site closes the previous WS.
 */
import { useEffect, useRef, useState } from "react";
import {
  getSiteLogs,
  listSiteEndpoints,
  openSiteFeed,
  type SiteWsHandle,
  type SiteWsMessage,
  type SiteWsStatus,
  type WireLogEvent,
} from "@/api/sitesApi";
import type { Endpoint } from "@/types/models";

const MAX_LOGS = 600;

export interface UseSiteFeedResult {
  status: SiteWsStatus;
  endpoints: Endpoint[];
  logs: WireLogEvent[];
  hydrated: boolean;
  ingestError: string | null;
}

export function useSiteFeed(siteId: string | undefined): UseSiteFeedResult {
  const [status, setStatus] = useState<SiteWsStatus>("closed");
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [logs, setLogs] = useState<WireLogEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  const handleRef = useRef<SiteWsHandle | null>(null);
  const seqSeenRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!siteId) return;

    let alive = true;
    setEndpoints([]);
    setLogs([]);
    setHydrated(false);
    setIngestError(null);
    seqSeenRef.current = new Set();

    // 1. Pull initial snapshot via REST so the UI is populated before the
    //    first WS frame arrives (and even if the LLM/WS is slow).
    Promise.all([listSiteEndpoints(siteId), getSiteLogs(siteId, 200)])
      .then(([epResp, logResp]) => {
        if (!alive) return;
        setEndpoints(sortByRisk(epResp.items));
        // assign synthetic descending sequence to historical lines so they
        // sort before any subsequent WS events
        const historical: WireLogEvent[] = logResp.items.map((line, i) => ({
          seq: -1 * (logResp.items.length - i),
          ts: line.ts,
          method: line.method,
          path: line.path,
          status: line.status,
          latency_ms: line.latency_ms,
          auth_present: line.auth_present,
          raw: line.raw,
          parsed: line.parsed,
        }));
        setLogs(historical);
        setHydrated(true);
      })
      .catch(() => {
        if (alive) setHydrated(true);
      });

    // 2. Open per-site WebSocket
    handleRef.current = openSiteFeed(
      siteId,
      (msg: SiteWsMessage) => {
        if (!alive) return;
        switch (msg.type) {
          case "snapshot":
            setEndpoints(sortByRisk(msg.endpoints));
            break;
          case "endpoint_update":
            setEndpoints((cur) => upsertEndpoint(cur, msg.endpoint));
            break;
          case "log_events_batch": {
            const fresh = msg.events.filter((e) => {
              if (seqSeenRef.current.has(e.seq)) return false;
              seqSeenRef.current.add(e.seq);
              return true;
            });
            if (fresh.length === 0) break;
            setLogs((cur) => {
              const next = cur.concat(fresh);
              return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
            });
            break;
          }
          case "ingest_error":
            setIngestError(msg.error);
            break;
          case "inference_error":
            // non-fatal, swallow but log in dev
            if (import.meta.env.DEV) console.warn("[ws] inference error", msg);
            break;
        }
      },
      (s) => {
        if (alive) setStatus(s);
      },
    );

    return () => {
      alive = false;
      handleRef.current?.close();
      handleRef.current = null;
    };
  }, [siteId]);

  return { status, endpoints, logs, hydrated, ingestError };
}

function sortByRisk(eps: Endpoint[]): Endpoint[] {
  return [...eps].sort((a, b) => b.posture_score - a.posture_score);
}

function upsertEndpoint(cur: Endpoint[], ep: Endpoint): Endpoint[] {
  const next = cur.filter((e) => e.id !== ep.id);
  next.push(ep);
  return sortByRisk(next);
}
