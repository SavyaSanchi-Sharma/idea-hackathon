import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLiveStore } from "@/store/liveStore";
import { cn } from "@/lib/cn";
import type { ScanEvent } from "@/types/models";

const SEVERITY_TEXT: Record<ScanEvent["severity"], string> = {
  info: "text-bone-dim",
  warning: "text-deprecated",
  critical: "text-critical",
};

const SEVERITY_PREFIX_COLOR: Record<ScanEvent["severity"], string> = {
  info: "text-sediment",
  warning: "text-deprecated",
  critical: "text-critical",
};

/**
 * Strip γ-right. Excavation log — field-notes style entries framed by the
 * `┌─ depth scan / {ts} ─` box-drawing header. Prefix line tree: ├╴ / └╴ / ╳╴.
 */
export function ScanFeed() {
  const feed = useLiveStore((s) => s.feed);
  const scanStatus = useLiveStore((s) => s.scanStatus);
  const progress = useLiveStore((s) => s.progress);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (autoScroll) {
      el.scrollTop = el.scrollHeight;
      setUnread(0);
    } else {
      setUnread((u) => u + 1);
    }
  }, [feed.length, autoScroll]);

  function onScroll() {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    setAutoScroll(atBottom);
    if (atBottom) setUnread(0);
  }

  function jumpToLatest() {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAutoScroll(true);
    setUnread(0);
  }

  const headerTs =
    feed[0]?.ts.slice(0, 19) + "Z" || new Date().toISOString().slice(0, 19) + "Z";
  const statusLabel =
    scanStatus === "idle"
      ? "idle"
      : scanStatus === "running"
        ? "running"
        : scanStatus === "complete"
          ? "complete"
          : "failed";

  return (
    <section
      aria-label="excavation log"
      className="flex h-full min-h-0 flex-col bg-tar border-l border-hairline"
    >
      <header className="px-[16px] pt-[10px] pb-[6px] border-b border-hairline">
        <div className="flex items-center gap-[6px] font-mono text-[12px] leading-none truncate">
          <span className="frame-line">┌─</span>
          <span className="text-bone-dim font-medium">depth scan / {headerTs}</span>
          <span className="frame-line flex-1 truncate" aria-hidden>
            {"─".repeat(120)}
          </span>
        </div>
        <div className="mt-[6px] flex items-center gap-[12px] font-mono text-[11px] leading-none mono-tab">
          <span>
            <span className="text-sediment">status = </span>
            <span className={scanStatus === "running" ? "text-blueprint" : "text-bone"}>
              {statusLabel}
            </span>
          </span>
          <span className="text-sediment">·</span>
          <span>
            <span className="text-sediment">progress = </span>
            <span className="text-bone">{progress.toFixed(1)}%</span>
          </span>
        </div>
      </header>

      <div
        ref={containerRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        className="relative flex-1 overflow-y-auto px-[16px] py-[8px]"
      >
        {feed.length === 0 ? (
          <div className="font-mono text-[12px] leading-[1.4] text-bone-dim">
            <span className="frame-line">└╴ </span>
            <span className="text-sediment-strong">—   </span>
            {scanStatus === "idle"
              ? "waiting for scan…   feed will populate on /api/scan/start"
              : "stream open. listening for discovery events."}
            <span className="ml-[4px] caret-blink" aria-hidden>▮</span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {feed.map((event, idx) => {
              const isLast = idx === feed.length - 1;
              const prefix =
                event.severity === "critical" ? "╳╴" : isLast ? "└╴" : "├╴";
              return (
                <motion.div
                  key={`${event.ts}-${idx}`}
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "flex items-baseline gap-[8px] font-mono text-[12px] leading-[1.4] mono-tab",
                    SEVERITY_TEXT[event.severity],
                  )}
                >
                  <span className={cn("shrink-0", SEVERITY_PREFIX_COLOR[event.severity])}>
                    {prefix}
                  </span>
                  <span className="text-sediment-strong shrink-0">
                    {timeOf(event.ts)}
                  </span>
                  <span className="text-bone-dim shrink-0 w-[72px]">
                    {event.phase.padEnd(8)}
                  </span>
                  {event.endpoint_id ? (
                    <span className="text-sediment-strong shrink-0">
                      {specimenFromId(event.endpoint_id)}
                    </span>
                  ) : null}
                  <span className="truncate">{event.message}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {!autoScroll && unread > 0 ? (
          <button
            type="button"
            onClick={jumpToLatest}
            className={cn(
              "absolute bottom-[16px] right-[16px]",
              "border border-blueprint bg-tar text-blueprint",
              "font-mono text-[11px] leading-none px-[10px] py-[6px] rounded-xs",
              "hover:bg-blueprint-wash",
            )}
          >
            ↓ jump to latest <span className="text-sediment">·</span> n = {unread}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}
function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}
function specimenFromId(id: string): string {
  // The fixture's deterministic specimen ids match the seed mapping; we
  // approximate here for the live feed where only endpoint_id is known.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `zh-${(h % 9000 + 1000).toString().padStart(4, "0")}`;
}
