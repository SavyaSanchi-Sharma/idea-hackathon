import { useEffect, useState } from "react";
import { getWsClient, type WsMessage, type WsStatus } from "@/api/websocket";
import { useLiveStore } from "@/store/liveStore";

export function useWebSocketStatus(): WsStatus {
  const [status, setStatus] = useState<WsStatus>(() => getWsClient().status());
  useEffect(() => {
    const off = getWsClient().onStatus(setStatus);
    return () => {
      off();
    };
  }, []);
  return status;
}

// Wires the singleton WS client into the live store. Mount once at the app root.
export function useWebSocketBridge(): void {
  const setProgress = useLiveStore((s) => s.setProgress);
  const appendEvent = useLiveStore((s) => s.appendEvent);
  const completeScan = useLiveStore((s) => s.completeScan);

  useEffect(() => {
    const client = getWsClient();
    client.connect();
    const off = client.onMessage((msg: WsMessage) => {
      switch (msg.type) {
        case "scan_progress":
          setProgress(msg.payload.progress, msg.payload.stats);
          break;
        case "scan_event":
          appendEvent(msg.payload);
          break;
        case "scan_complete":
          completeScan();
          break;
        case "endpoint_update":
          // server-state invalidation hook — TanStack Query owns the cache,
          // listeners attached at the page level handle this.
          break;
      }
    });
    return () => {
      off();
    };
  }, [setProgress, appendEvent, completeScan]);
}
