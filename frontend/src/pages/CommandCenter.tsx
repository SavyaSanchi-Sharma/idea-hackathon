import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DepthMeter } from "@/components/command-center/DepthMeter";
import { ClassificationCards } from "@/components/command-center/ClassificationCards";
import { TopRiskList } from "@/components/command-center/TopRiskList";
import { ScanFeed } from "@/components/command-center/ScanFeed";
import { useLiveStore } from "@/store/liveStore";
import { cn } from "@/lib/cn";

/**
 * Three full-bleed strips with no margin between them. The instrument is a
 * single continuous readout — depth meter, population, working surface.
 */
export default function CommandCenter() {
  const scanStatus = useLiveStore((s) => s.scanStatus);
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);

  // Surface a one-off toast on scan completion, and refresh the endpoints
  // cache so the top-risk list settles to its final order.
  useEffect(() => {
    if (scanStatus !== "complete") return;
    queryClient.invalidateQueries({ queryKey: ["endpoints"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
  }, [scanStatus, queryClient]);

  const liveStats = useLiveStore((s) => s.liveStats);
  useEffect(() => {
    if (scanStatus === "complete" && liveStats) {
      const n = liveStats.total_discovered;
      const z = liveStats.orphaned;
      setToast(`scan complete · n = ${n} specimens · ${z} zombies recovered`);
      const id = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(id);
    }
    return;
  }, [scanStatus, liveStats]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DepthMeter />
      <ClassificationCards />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[3fr_2fr]">
        <TopRiskList />
        <ScanFeed />
      </div>
      {toast ? (
        <div
          role="status"
          aria-live="assertive"
          className={cn(
            "fixed bottom-[16px] right-[16px] z-toast",
            "border border-hairline bg-stratum-raised px-[12px] py-[10px]",
            "font-mono text-[12px] leading-[1.4] text-bone",
            "max-w-[360px]",
          )}
        >
          <span className="text-active mr-[6px]" aria-hidden>
            ✓
          </span>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
