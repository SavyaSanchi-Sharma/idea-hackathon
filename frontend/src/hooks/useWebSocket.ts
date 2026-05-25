import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();

  useEffect(() => {
    const client = getWsClient();
    client.connect();
    const off = client.onMessage((msg: WsMessage) => {
      switch (msg.type) {
        case "scan_progress":
        case "ScanProgress":
          setProgress(msg.payload.progress, msg.payload.stats);
          break;
        case "scan_event":
        case "ScanEvent":
          appendEvent(msg.payload);
          break;
        case "scan_complete":
        case "ScanComplete":
          completeScan();
          queryClient.invalidateQueries({ queryKey: ["summary"] });
          queryClient.invalidateQueries({ queryKey: ["endpoints"] });
          queryClient.invalidateQueries({ queryKey: ["graph"] });
          break;
        case "endpoint_update":
        case "EndpointUpdates":
          // server-state invalidation hook — TanStack Query owns the cache,
          // listeners attached at the page level handle this.
          break;
        case "ReportReady":
          // Pipe finished an SLM report. Refresh the cached-reports list and
          // the endpoint detail so the new row shows up without a manual reload.
          queryClient.invalidateQueries({
            queryKey: ["reports", msg.payload.endpoint_id],
          });
          queryClient.invalidateQueries({
            queryKey: ["endpoint", msg.payload.endpoint_id],
          });
          break;
      }
    });
    return () => {
      off();
    };
  }, [setProgress, appendEvent, completeScan, queryClient]);
}
