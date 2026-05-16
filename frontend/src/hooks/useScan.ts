import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startScan } from "@/api/endpoints";
import { getWsClient } from "@/api/websocket";
import { useLiveStore } from "@/store/liveStore";

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
      // In fixture mode, drive the simulator through the same WS path.
      if (import.meta.env.VITE_USE_FIXTURE === "true") {
        getWsClient().emitSimulatedScan(scan_id);
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["summary"] });
          queryClient.invalidateQueries({ queryKey: ["endpoints"] });
        }, 320 * 18);
      }
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, startScanInStore, queryClient]);

  return { isStarting, runScan };
}
