import { useCallback, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getScan, getScanEvents, startScan } from "@/api/endpoints";
import { useLiveStore } from "@/store/liveStore";

// Only one scan poller may run at a time — kill any prior loop when a new
// scan starts so events from a previous run don't bleed into the live feed.
let activePoller: ReturnType<typeof setInterval> | null = null;

function stopActivePoller() {
  if (activePoller) {
    clearInterval(activePoller);
    activePoller = null;
  }
}

function pumpScan(scanId: string, queryClient: QueryClient) {
  stopActivePoller();
  let seen = 0;
  activePoller = setInterval(async () => {
    try {
      const [scan, events] = await Promise.all([
        getScan(scanId),
        getScanEvents(scanId),
      ]);
      // Bail if the user has since started a different scan.
      const current = useLiveStore.getState().scanId;
      if (current !== scanId) {
        stopActivePoller();
        return;
      }
      const store = useLiveStore.getState();
      store.setProgress(scan.progress, scan.stats);
      if (events.length > seen) {
        for (const ev of events.slice(seen)) store.appendEvent(ev);
        seen = events.length;
      }
      if (scan.status === "complete") {
        store.completeScan();
        stopActivePoller();
        queryClient.invalidateQueries({ queryKey: ["summary"] });
        queryClient.invalidateQueries({ queryKey: ["endpoints"] });
        queryClient.invalidateQueries({ queryKey: ["graph"] });
        queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[scan] poll failed", err);
      stopActivePoller();
    }
  }, 280);
}

export function useScan(): {
  isStarting: boolean;
  runScan: () => Promise<void>;
} {
  const [isStarting, setIsStarting] = useState(false);
  const startScanInStore = useLiveStore((s) => s.startScan);
  const queryClient = useQueryClient();

  const runScan = useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const { scan_id } = await startScan();
      startScanInStore(scan_id);
      pumpScan(scan_id, queryClient);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[scan] start failed", err);
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, startScanInStore, queryClient]);

  return { isStarting, runScan };
}
