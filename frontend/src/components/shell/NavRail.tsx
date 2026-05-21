import { NavLink } from "react-router-dom";
import { cn } from "@/lib/cn";

interface NavItem {
  to: string;
  glyph: string;
  label: string;
  subtitle: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", glyph: "▼", label: "command center", subtitle: "depth scan" },
  { to: "/inventory", glyph: "◇", label: "inventory", subtitle: "specimen catalog" },
  { to: "/review", glyph: "⊘", label: "review queue", subtitle: "rule ≠ ml disagreement" },
  { to: "/landscape", glyph: "▣", label: "landscape", subtitle: "stratigraphic cross-section" },
  { to: "/boreholes", glyph: "◉", label: "boreholes", subtitle: "live formation probes" },
  { to: "/reports", glyph: "▷", label: "reports", subtitle: "compliance · phase 3" },
];

/**
 * 64px-wide rail. Unicode glyphs (NOT lucide icons) per identity.md. Brand
 * mark `ZH` at the top in a bordered square; tooltip on hover.
 */
export function NavRail() {
  return (
    <aside
      className="z-nav flex h-screen w-[64px] shrink-0 flex-col items-center border-r border-hairline bg-tar"
      aria-label="primary navigation"
    >
      <div className="flex h-[56px] w-full items-center justify-center border-b border-hairline">
        <span
          className={cn(
            "inline-flex h-[32px] w-[32px] items-center justify-center",
            "border border-hairline-strong bg-stratum",
            "font-mono text-[14px] font-bold text-bone tracking-wide",
          )}
          title="zombiehunter · strata"
        >
          ZH
        </span>
      </div>

      <nav className="flex flex-1 flex-col items-stretch w-full">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "group relative flex h-[56px] w-full items-center justify-center",
                "text-[18px] font-mono text-bone-dim",
                "transition-colors duration-fast ease-instrument",
                "hover:bg-stratum hover:text-bone",
                isActive && "bg-stratum text-bone",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute left-0 top-[8px] bottom-[8px] w-[2px] bg-blueprint"
                  />
                ) : null}
                <span aria-hidden>{item.glyph}</span>
                <span
                  role="tooltip"
                  className={cn(
                    "absolute left-[64px] z-50 ml-[8px] hidden whitespace-nowrap",
                    "border border-hairline bg-stratum-raised px-[10px] py-[6px]",
                    "font-mono text-[11px] leading-tight text-bone",
                    "group-hover:block",
                  )}
                >
                  <span className="block font-medium lowercase">{item.label}</span>
                  <span className="block text-[10px] text-sediment-strong lowercase">
                    {item.subtitle}
                  </span>
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="w-full p-[8px]">
        <button
          type="button"
          className={cn(
            "flex h-[28px] w-full items-center justify-center",
            "font-mono text-[14px] text-sediment-strong hover:text-bone-dim",
          )}
          title="settings · phase 3"
        >
          …
        </button>
      </div>
    </aside>
  );
}
