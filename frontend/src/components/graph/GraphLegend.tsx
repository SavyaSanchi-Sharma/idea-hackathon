import { useState } from "react";
import { cn } from "@/lib/cn";

interface GraphLegendProps {
  mode: "normal" | "blast_radius";
}

/**
 * Always-visible (or collapsible) legend that confesses the encoding. Bottom-
 * right of the canvas. Pure Unicode shapes so it stays crisp at any zoom.
 */
export function GraphLegend({ mode }: GraphLegendProps) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "absolute right-[16px] bottom-[16px] z-base",
          "border border-hairline bg-stratum px-[10px] py-[6px] rounded-xs",
          "font-mono text-[11px] leading-none text-bone-dim hover:text-bone",
        )}
      >
        [ legend ▾ ]
      </button>
    );
  }

  return (
    <aside
      role="region"
      aria-label="graph legend"
      className={cn(
        "absolute right-[16px] bottom-[16px] z-base",
        "border border-hairline bg-stratum p-[12px]",
        "font-mono text-[11px] leading-[1.4] text-bone-dim",
        "min-w-[260px] max-w-[280px]",
      )}
    >
      <div className="flex items-center justify-between mb-[6px] gap-[6px]">
        <span className="frame-line">┌─</span>
        <span className="text-bone-dim font-medium">
          legend{mode === "blast_radius" ? " · blast radius" : ""}
        </span>
        <span className="frame-line flex-1 truncate" aria-hidden>
          {"─".repeat(40)}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-bone-dim hover:text-bone shrink-0"
          aria-label="collapse legend"
        >
          ▾
        </button>
      </div>
      {mode === "normal" ? <NormalLegend /> : <BlastLegend />}
      <div className="frame-line truncate mt-[8px]" aria-hidden>
        └{"─".repeat(40)}
      </div>
    </aside>
  );
}

function NormalLegend() {
  return (
    <div className="flex flex-col gap-[6px]">
      <Row glyph="●" tone="text-active">active · solid stroke</Row>
      <Row glyph="●" tone="text-deprecated">deprecated · dashed</Row>
      <Row glyph="●" tone="text-orphaned">orphaned · broken-dashed</Row>
      <Row glyph="╳" tone="text-critical">critical · solid + mark</Row>
      <div className="h-px bg-hairline my-[4px]" />
      <Row glyph="■" tone="text-bone-dim">service</Row>
      <Row glyph="◆" tone="text-bone-dim">gateway / auth</Row>
      <Row glyph="▭" tone="text-bone-dim">database</Row>
      <div className="h-px bg-hairline my-[4px]" />
      <Row glyph="──" tone="text-bone-dim">calls · routes_to</Row>
      <Row glyph="┄┄" tone="text-bone-dim">cross-stratum edge</Row>
    </div>
  );
}

function BlastLegend() {
  return (
    <div className="flex flex-col gap-[6px]">
      <Row glyph="●━" tone="text-critical">origin specimen · pulsing</Row>
      <Row glyph="●" tone="text-critical">reachable node</Row>
      <Row glyph="◌" tone="text-sediment-strong">unreachable · dimmed</Row>
      <div className="h-px bg-hairline my-[4px]" />
      <Row glyph="━━" tone="text-critical">fault line · propagation</Row>
      <Row glyph="┄┄" tone="text-sediment-strong">original edge · dimmed</Row>
    </div>
  );
}

function Row({ glyph, tone, children }: { glyph: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-[10px]">
      <span className={cn("w-[20px] inline-block", tone)} aria-hidden>
        {glyph}
      </span>
      <span>{children}</span>
    </div>
  );
}
