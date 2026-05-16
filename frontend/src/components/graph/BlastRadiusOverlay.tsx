import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { getBlastRadius, getEndpoint } from "@/api/endpoints";
import { useUiStore } from "@/store/uiStore";
import { cn } from "@/lib/cn";

interface BlastRadiusOverlayProps {
  originId: string;
}

/**
 * The summary panel rendered when graphMode === "blast_radius". Shows the
 * origin specimen, estimated records reachable, downstream systems tree, and
 * the action buttons. Slides up from below.
 */
export function BlastRadiusOverlay({ originId }: BlastRadiusOverlayProps) {
  const { data: origin } = useQuery({
    queryKey: ["endpoint", originId],
    queryFn: () => getEndpoint(originId),
  });
  const { data: blast } = useQuery({
    queryKey: ["blast", originId],
    queryFn: () => getBlastRadius(originId),
  });

  const setGraphMode = useUiStore((s) => s.setGraphMode);

  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPulseKey((k) => k + 1), 2400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setGraphMode("normal");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setGraphMode]);

  return (
    <>
      {/* Decorative pulse ring overlay across the whole canvas (sits above the
          plotted graph; doesn't intercept clicks). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        key={pulseKey}
      >
        <motion.div
          initial={{ scale: 0, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 0 }}
          transition={{ duration: 2.4, ease: "easeOut" }}
          className="rounded-full border-2 border-critical"
          style={{ width: 64, height: 64 }}
        />
      </div>

      {/* Summary panel — bottom-left */}
      <motion.aside
        role="region"
        aria-label="blast radius summary"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "absolute left-[16px] bottom-[16px] z-base",
          "border border-critical bg-stratum-raised p-[16px]",
          "w-[360px]",
          "relative overflow-hidden",
        )}
        style={{ backgroundImage: "var(--scanline-overlay)" }}
      >
        <div className="flex items-center gap-[6px] font-mono text-[12px] leading-none mb-[10px]">
          <span className="frame-line">┌─</span>
          <span className="text-bone-dim font-medium">
            blast radius / {origin?.specimen_id?.toLowerCase() ?? originId}
          </span>
          <span className="frame-line flex-1 truncate" aria-hidden>
            {"─".repeat(40)}
          </span>
        </div>

        <div className="flex flex-col gap-[8px] font-mono text-[12px] leading-[1.4]">
          <div>
            <span className="text-sediment">origin     </span>
            <span className="text-bone">
              {origin?.specimen_id?.toLowerCase() ?? "?"}
            </span>
            <span className="text-sediment">  ·  </span>
            <span className="text-bone">
              {origin ? `${origin.method} ${origin.path}` : "—"}
            </span>
          </div>
          <div>
            <span className="text-sediment">estimated  </span>
            <span className="text-sediment">n ≈ </span>
            <span className="text-critical font-medium">
              {compactRecords(blast?.affected_records ?? 0)}
            </span>
            <span className="text-sediment"> records reachable</span>
          </div>

          <div className="mt-[6px]">
            <div className="text-bone-dim font-medium mb-[4px] lowercase">
              downstream systems reached
            </div>
            <ul className="flex flex-col gap-[2px]">
              {(blast?.affected_systems ?? []).map((sys, i, arr) => {
                const isWrite =
                  blast?.has_write_access && /core|aml|ledger|outbox/i.test(sys);
                const prefix = isWrite ? "╳╴" : i === arr.length - 1 ? "└╴" : "├╴";
                return (
                  <li
                    key={sys}
                    className="flex items-baseline gap-[8px]"
                    aria-label={`${sys}, ${isWrite ? "write" : "read"} access`}
                  >
                    <span className={isWrite ? "text-critical" : "text-sediment"}>
                      {prefix}
                    </span>
                    <span className="text-bone">{sys}</span>
                    <span className="text-sediment-strong">
                      ({isWrite ? "write" : "read"})
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-[4px]">
            <span className="text-sediment">write/delete access in path · </span>
            <span className={blast?.has_write_access ? "text-critical" : "text-active"}>
              {blast?.has_write_access ? "YES" : "NO"}
            </span>
          </div>

          <div className="flex items-center gap-[8px] mt-[10px]">
            <button
              type="button"
              className={cn(
                "h-[28px] px-[12px] border border-critical bg-tar rounded-xs",
                "font-mono text-[12px] leading-none font-medium lowercase text-critical",
                "hover:bg-critical-wash",
              )}
            >
              block now
            </button>
            <button
              type="button"
              onClick={() => setGraphMode("normal")}
              className={cn(
                "h-[28px] px-[12px] border border-hairline-strong bg-tar rounded-xs",
                "font-mono text-[12px] leading-none font-medium lowercase text-bone-dim",
                "hover:text-bone",
              )}
            >
              exit blast mode
            </button>
          </div>
        </div>

        <div
          className="frame-line font-mono text-[12px] leading-none truncate mt-[8px]"
          aria-hidden
        >
          └{"─".repeat(40)}
        </div>
      </motion.aside>
    </>
  );
}

function compactRecords(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}
