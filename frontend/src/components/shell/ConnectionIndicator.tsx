import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useWebSocketStatus } from "@/hooks/useWebSocket";
import { useLiveStore } from "@/store/liveStore";

const TONE: Record<
  ReturnType<typeof useWebSocketStatus>,
  { dot: string; text: string; label: string }
> = {
  open: { dot: "bg-active", text: "text-active", label: "live" },
  connecting: { dot: "bg-deprecated", text: "text-deprecated", label: "connecting" },
  closed: { dot: "bg-critical", text: "text-critical", label: "disconnected" },
};

/**
 * Right side of the top bar. Renders ●  ws://… · status · last event 0.4s ago.
 * Pulses the dot on disconnect.
 */
export function ConnectionIndicator() {
  const status = useWebSocketStatus();
  const tone = TONE[status];
  const lastEventTs = useLiveStore((s) => s.feed.at(-1)?.ts);
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const age = lastEventTs ? ageString(lastEventTs) : null;
  const url = (import.meta.env.VITE_WS_URL as string | undefined) ?? "ws://localhost:8000/ws";

  return (
    <div className="flex items-center gap-[8px] font-mono text-[11px] leading-none">
      <span
        className={cn(
          "inline-block h-[5px] w-[5px] rounded-full",
          tone.dot,
          status === "closed" && "disconnect-pulse",
        )}
        aria-hidden
      />
      <span className="text-sediment-strong">{url}</span>
      <span className="text-sediment">·</span>
      <span className={cn("font-medium", tone.text)}>{tone.label}</span>
      {age ? (
        <>
          <span className="text-sediment">·</span>
          <span className="text-bone-dim mono-tab">
            <span className="text-sediment">last event </span>
            {age}
          </span>
        </>
      ) : null}
    </div>
  );
}

function ageString(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 1000) return `${ms}ms ago`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}
