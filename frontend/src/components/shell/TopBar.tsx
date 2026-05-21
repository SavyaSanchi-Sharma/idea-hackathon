import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { useScan } from "@/hooks/useScan";
import { useLiveStore } from "@/store/liveStore";
import { useUiStore } from "@/store/uiStore";
import { cn } from "@/lib/cn";

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "command center", subtitle: "depth scan" },
  "/inventory": { title: "inventory", subtitle: "specimen catalog" },
  "/landscape": { title: "landscape", subtitle: "stratigraphic cross-section" },
  "/boreholes": { title: "boreholes", subtitle: "live formation probes" },
  "/reports": { title: "reports", subtitle: "compliance · phase 3" },
};

/**
 * 56px sticky top bar. Dual-line title (page + sediment subtitle), `path ·`
 * leading-prefixed search input, lowercase `run discovery scan` primary, and
 * the connection indicator at the right.
 */
export function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const meta =
    TITLES[pathname] ??
    (pathname.startsWith("/boreholes/")
      ? { title: "borehole", subtitle: "live probe · per-site monitor" }
      : { title: "zombiehunter", subtitle: "strata" });
  const { runScan, isStarting } = useScan();
  const scanStatus = useLiveStore((s) => s.scanStatus);
  const progress = useLiveStore((s) => s.progress);
  const isRunning = scanStatus === "running";

  const inputRef = useRef<HTMLInputElement | null>(null);
  const setFilters = useUiStore((s) => s.setInventoryFilters);
  const filters = useUiStore((s) => s.inventoryFilters);
  const [search, setSearch] = useState(filters.search);

  useEffect(() => {
    setSearch(filters.search);
  }, [filters.search]);

  // Global hotkeys: `R` runs a scan, `/` focuses search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "r" || e.key === "R") {
        if (!isRunning && !isStarting) {
          e.preventDefault();
          void runScan();
        }
      } else if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isRunning, isStarting, runScan]);

  function submitSearch(value: string) {
    setFilters({ search: value });
    if (value && pathname !== "/inventory") navigate("/inventory");
  }

  return (
    <header className="sticky top-0 z-topbar h-[56px] shrink-0 border-b border-hairline bg-tar">
      <div className="flex h-full items-center px-[16px] gap-[16px]">
        <div className="flex min-w-[220px] flex-col">
          <h1 className="font-mono text-[19px] leading-[1.25] font-semibold text-bone lowercase">
            {meta.title}
          </h1>
          <span className="font-mono text-[11px] leading-none text-sediment-strong lowercase">
            <span className="text-sediment">·</span> {meta.subtitle}
          </span>
        </div>

        <div className="flex-1 flex justify-center">
          <label
            className={cn(
              "relative flex w-full max-w-[420px] h-[32px] items-center",
              "border border-hairline bg-stratum rounded-xs px-[12px]",
              "transition-colors duration-fast ease-instrument",
              "focus-within:border-blueprint",
            )}
          >
            <span className="font-mono text-[13px] leading-none text-sediment">path ·</span>
            <input
              ref={inputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch(search);
              }}
              onBlur={() => submitSearch(search)}
              placeholder="/v1/upi/..."
              aria-label="search endpoint path"
              className={cn(
                "ml-[8px] flex-1 bg-transparent outline-none border-none",
                "font-mono text-[13px] leading-none text-bone placeholder:text-sediment-strong",
              )}
            />
          </label>
        </div>

        <div className="flex items-center gap-[16px]">
          <button
            type="button"
            onClick={() => runScan()}
            disabled={isStarting || isRunning}
            aria-keyshortcuts="r"
            className={cn(
              "h-[36px] px-[16px] rounded-xs",
              "border border-blueprint bg-tar text-blueprint",
              "font-mono text-[13px] leading-none font-medium lowercase tracking-normal",
              "hover:bg-blueprint-wash",
              "transition-colors duration-fast ease-instrument",
              "disabled:cursor-progress",
            )}
          >
            {isRunning ? (
              <>
                scanning · {progress.toFixed(1)}%
                <span className="ml-[6px] caret-blink" aria-hidden>▮</span>
              </>
            ) : (
              <>
                run discovery scan
                {isRunning ? null : (
                  <span className="ml-[6px] text-sediment" aria-hidden>
                    [R]
                  </span>
                )}
              </>
            )}
          </button>
          <ConnectionIndicator />
        </div>
      </div>
    </header>
  );
}
