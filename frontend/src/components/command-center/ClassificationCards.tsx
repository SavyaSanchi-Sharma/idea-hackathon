import { MetricCard } from "@/components/common/MetricCard";
import { useLiveStore } from "@/store/liveStore";
import { useSummary } from "@/hooks/useSummary";

/**
 * Strip β — four population-readout cards. The orphaned card gets stipple,
 * the critical card gets scanline + −1.2° tilt (hero variant). Active and
 * deprecated stay crisp.
 */
export function ClassificationCards() {
  const { data: summary } = useSummary();
  const liveStats = useLiveStore((s) => s.liveStats);
  const scanStatus = useLiveStore((s) => s.scanStatus);

  const isPreScan = scanStatus === "idle" && !liveStats;
  const isScanning = scanStatus === "running";

  const totalDiscovered =
    liveStats?.total_discovered ?? summary?.total_discovered ?? summary?.registry_baseline ?? 247;
  const active = liveStats?.active ?? summary?.active ?? 198;
  const deprecated = liveStats?.deprecated ?? summary?.deprecated ?? 0;
  const orphaned = liveStats?.orphaned ?? summary?.orphaned ?? 0;
  const critical = liveStats?.critical ?? summary?.critical ?? 0;

  const baseline = summary?.registry_baseline ?? 247;
  const activeDelta = active - baseline;
  const deprecatedDelta = Math.max(0, deprecated - 38);
  const orphanedDelta = orphaned;
  const criticalDelta = critical;

  return (
    <section
      aria-label="population readout"
      className="border-b border-hairline bg-tar px-[24px] py-[16px]"
    >
      <div className="grid grid-cols-1 gap-[16px] md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="active"
          value={active}
          total={totalDiscovered}
          delta={isPreScan ? 0 : activeDelta}
          variant="active"
          isLoading={isScanning && !liveStats}
        />
        <MetricCard
          label="deprecated"
          value={deprecated}
          total={totalDiscovered}
          delta={isPreScan ? 0 : deprecatedDelta}
          variant="deprecated"
          isLoading={isScanning && !liveStats}
        />
        <MetricCard
          label="orphaned"
          value={orphaned}
          total={totalDiscovered}
          delta={isPreScan ? 0 : orphanedDelta}
          variant="orphaned"
          isLoading={isScanning && !liveStats}
        />
        <MetricCard
          label="critical"
          value={critical}
          total={totalDiscovered}
          delta={isPreScan ? 0 : criticalDelta}
          variant="critical"
          isHero
          isLoading={isScanning && !liveStats}
        />
      </div>
    </section>
  );
}
