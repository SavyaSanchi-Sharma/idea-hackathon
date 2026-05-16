import { useEndpoints } from "@/hooks/useEndpoints";
import { useUiStore } from "@/store/uiStore";
import { useLiveStore } from "@/store/liveStore";
import { SpecimenCard } from "@/components/common/SpecimenCard";
import { cn } from "@/lib/cn";

/**
 * Strip γ-left. Six specimen cards stacked with shared borders (no gap). The
 * highest-risk card uses the strong −1.2° tilt. The list shows registry-static
 * risk pre-scan, with a "(registry only)" caption per spec.
 */
export function TopRiskList() {
  const { data, isLoading } = useEndpoints({ sort: "posture_score:desc", page_size: 6 });
  const openEndpoint = useUiStore((s) => s.openEndpoint);
  const scanStatus = useLiveStore((s) => s.scanStatus);
  const totalEndpoints = data?.total ?? 0;

  const isPreScan = scanStatus === "idle";

  return (
    <section
      aria-label="top-risk specimens"
      className="flex h-full min-h-0 flex-col bg-tar"
    >
      <header className="flex items-center justify-between px-[16px] h-[36px] border-b border-hairline">
        <h2 className="font-mono text-[14px] leading-none font-semibold text-bone lowercase">
          top-risk specimens
          {isPreScan ? (
            <span className="ml-[8px] text-[10px] text-sediment-strong">
              · registry static analysis
            </span>
          ) : null}
        </h2>
        <span className="font-mono mono-tab text-[12px] leading-none font-medium">
          <span className="text-sediment">n = </span>
          <span className="text-bone">{Math.min(6, data?.items.length ?? 0)}</span>
          <span className="text-sediment"> of {totalEndpoints}</span>
        </span>
      </header>

      <ol
        role="list"
        className="relative flex flex-1 flex-col overflow-y-auto"
      >
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="h-[88px] border-b border-hairline">
                <div className="h-full w-full skeleton-pulse" aria-hidden />
              </li>
            ))
          : data?.items.slice(0, 6).map((ep, idx) => (
              <SpecimenCard
                key={ep.id}
                endpoint={ep}
                layout="stacked"
                hero={idx === 0 && ep.risk_tier === "critical"}
                onOpen={openEndpoint}
                showRegistryOnly={isPreScan}
                className={cn(
                  idx === 0 ? "border-t-0" : "border-t-0",
                  "z-base",
                )}
              />
            ))}
      </ol>
    </section>
  );
}
