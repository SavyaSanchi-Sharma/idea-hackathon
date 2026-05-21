import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { select } from "d3-selection";
import { zoom as d3zoom, type ZoomBehavior, zoomIdentity } from "d3-zoom";
import type { ApiGraph, Classification, GraphNode, ServiceLane } from "@/types/models";
import { useUiStore } from "@/store/uiStore";

/** Per-hop stagger for the fault-line BFS sweep (ms). 4 hops × 600ms = 2.4s. */
const BLAST_HOP_MS = 600;
/** Duration each individual fault edge takes to draw itself (ms). */
const BLAST_EDGE_DRAW_MS = 300;
/** Max BFS depth to animate. Beyond this the rest is just "unreachable". */
const BLAST_MAX_HOPS = 4;

const LANES: ServiceLane[] = [
  "auth",
  "core",
  "payments",
  "upi",
  "imps",
  "neft",
  "rtgs",
  "kyc",
  "aml",
  "cards",
  "internal",
  "legacy",
];

interface Stratum {
  label: string;
  yearTop: number;
  yearBottom: number;
}

const STRATA: Stratum[] = [
  { label: "2024", yearTop: 2024, yearBottom: 2026 },
  { label: "2020", yearTop: 2020, yearBottom: 2023 },
  { label: "2017", yearTop: 2017, yearBottom: 2019 },
  { label: "2014", yearTop: 2014, yearBottom: 2016 },
  { label: "2011", yearTop: 2011, yearBottom: 2013 },
  { label: "pre-2010", yearTop: 1990, yearBottom: 2010 },
];

const Y_AXIS_W = 96;
const X_AXIS_H = 32;
const PADDING = 16;

interface StratigraphicGraphProps {
  graph: ApiGraph;
  classificationFilter: Classification | "all";
  pathFilter: string;
  onSelectEndpoint: (id: string) => void;
}

/**
 * Fixed-position SVG layout: (service-lane, birth-year). NOT force-directed.
 * Pan/zoom via d3-zoom. Nodes fall into their strata in chronological order
 * on intro mount.
 */
export function StratigraphicGraph({
  graph,
  classificationFilter,
  pathFilter,
  onSelectEndpoint,
}: StratigraphicGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const zoomRef = useRef<ZoomBehavior<Element, unknown> | null>(null);
  const [size, setSize] = useState({ w: 1200, h: 720 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Blast-radius mode: drives the fault-line propagation overlay.
  const graphMode = useUiStore((s) => s.graphMode);
  const blastOriginId = useUiStore((s) => s.blastRadiusOriginId);
  const blastActive = graphMode === "blast_radius" && !!blastOriginId;

  // Detect prefers-reduced-motion so we can snap the propagation instead of
  // animating it. We re-evaluate on mount because the media query may differ
  // per session.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  // Restart-key forces the CSS transitions to replay every time blast mode is
  // (re)engaged or the origin changes. Without this React would reuse the
  // existing <path> elements and the dashoffset transition wouldn't fire.
  const [blastEpoch, setBlastEpoch] = useState(0);
  useEffect(() => {
    if (blastActive) setBlastEpoch((e) => e + 1);
  }, [blastActive, blastOriginId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const innerW = Math.max(600, size.w);
  const innerH = Math.max(540, size.h);
  const plotW = innerW - Y_AXIS_W - PADDING * 2;
  const plotH = innerH - X_AXIS_H - PADDING * 2;
  const laneW = plotW / LANES.length;
  const stratumH = plotH / STRATA.length;

  const yForYear = (year: number): number => {
    for (let i = 0; i < STRATA.length; i++) {
      const s = STRATA[i];
      if (year >= s.yearTop && year <= s.yearBottom) {
        const t = (s.yearBottom - year) / Math.max(1, s.yearBottom - s.yearTop);
        return X_AXIS_H + PADDING + i * stratumH + t * stratumH;
      }
    }
    if (year > STRATA[0].yearBottom) return X_AXIS_H + PADDING + stratumH * 0.2;
    return X_AXIS_H + PADDING + stratumH * (STRATA.length - 1) + stratumH * 0.6;
  };

  const xForLane = (lane: ServiceLane): number => {
    const idx = LANES.indexOf(lane);
    if (idx < 0) return Y_AXIS_W + PADDING + laneW / 2;
    return Y_AXIS_W + PADDING + idx * laneW + laneW / 2;
  };

  // Positioned endpoint nodes with deterministic jitter.
  const positioned = useMemo(() => {
    return graph.nodes
      .filter((n) => n.type === "endpoint")
      .map((n) => {
        const lane = (n.metadata.service_lane as ServiceLane) ?? "internal";
        const year = (n.metadata.birth_year as number) ?? 2018;
        const calls = (n.metadata.calls_30d as number) ?? 0;
        const jitter = deterministicJitter(n.id, Math.max(12, laneW * 0.3));
        const x = xForLane(lane) + jitter.x;
        const y = yForYear(year) + jitter.y * 0.5;
        const r = Math.min(16, Math.max(4, Math.sqrt(calls) * 0.018 + 4));
        return { ...n, x, y, r, year, lane };
      });
  }, [graph.nodes, laneW, stratumH]);

  // d3-zoom: attach once.
  useEffect(() => {
    const svg = svgRef.current;
    const g = gRef.current;
    if (!svg || !g) return;
    const beh = d3zoom()
      .scaleExtent([0.4, 4])
      .on("zoom", (e) => {
        select(g).attr("transform", e.transform.toString());
      });
    zoomRef.current = beh;
    select(svg as Element).call(beh as unknown as never);
    return () => {
      select(svg as Element).on(".zoom", null);
    };
  }, []);

  // Keyboard: 0 reset, f fit, Esc clear.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const svg = svgRef.current;
      if (!svg || !zoomRef.current) return;
      if (e.key === "0") {
        select(svg as Element).call(
          zoomRef.current.transform as unknown as never,
          zoomIdentity,
        );
      } else if (e.key === "f" || e.key === "F") {
        select(svg as Element).call(
          zoomRef.current.transform as unknown as never,
          zoomIdentity,
        );
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function matchesFilters(n: GraphNode): boolean {
    if (classificationFilter !== "all" && n.classification !== classificationFilter) return false;
    if (pathFilter) {
      const p = (n.metadata.path as string) ?? n.label;
      if (!p.toLowerCase().includes(pathFilter.toLowerCase())) return false;
    }
    return true;
  }

  // Build edges between positioned nodes only (drop edges to services).
  const positionedById = useMemo(() => {
    const m = new Map<string, (typeof positioned)[number]>();
    for (const p of positioned) m.set(p.id, p);
    return m;
  }, [positioned]);

  const edges = useMemo(() => {
    return graph.edges
      .map((e) => {
        const a = positionedById.get(e.source);
        const b = positionedById.get(e.target);
        if (!a || !b) return null;
        const crossesStrata = Math.abs(a.year - b.year) > 4;
        return { source: a, target: b, type: e.type, crossesStrata };
      })
      .filter(Boolean) as Array<{
        source: (typeof positioned)[number];
        target: (typeof positioned)[number];
        type: string;
        crossesStrata: boolean;
      }>;
  }, [graph.edges, positionedById]);

  // BFS hop layers from the blast origin, computed on the positioned-endpoint
  // adjacency (edges between drawn nodes). Undirected: a fault propagates both
  // ways. Origin is hop 0; the API only returns immediate fan-out so we run
  // our own BFS up to BLAST_MAX_HOPS. Returns null when blast mode is inactive.
  const blastHops = useMemo(() => {
    if (!blastActive || !blastOriginId) return null;
    if (!positionedById.has(blastOriginId)) return null;

    // Build undirected adjacency.
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source.id)) adj.set(e.source.id, []);
      if (!adj.has(e.target.id)) adj.set(e.target.id, []);
      adj.get(e.source.id)!.push(e.target.id);
      adj.get(e.target.id)!.push(e.source.id);
    }

    const nodeHop = new Map<string, number>();
    nodeHop.set(blastOriginId, 0);
    const queue: string[] = [blastOriginId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const curHop = nodeHop.get(cur)!;
      if (curHop >= BLAST_MAX_HOPS) continue;
      const nexts = adj.get(cur) ?? [];
      for (const n of nexts) {
        if (!nodeHop.has(n)) {
          nodeHop.set(n, curHop + 1);
          queue.push(n);
        }
      }
    }

    // An edge is on the fault path when both endpoints are reached AND the
    // hop indices differ by 1 (i.e. it was traversed during BFS). Its hop
    // index is the larger of the two — the moment the fault reaches the
    // farther node.
    const edgeHop = new Map<number, number>();
    edges.forEach((e, i) => {
      const a = nodeHop.get(e.source.id);
      const b = nodeHop.get(e.target.id);
      if (a === undefined || b === undefined) return;
      if (Math.abs(a - b) !== 1) return;
      edgeHop.set(i, Math.max(a, b));
    });

    return { nodeHop, edgeHop };
  }, [blastActive, blastOriginId, edges, positionedById]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-h-0 overflow-hidden bg-tar"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, var(--grid-dot-strong) 1px, transparent 0)," +
          " radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0)",
        backgroundSize: "32px 32px, 8px 8px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setSelectedId(null);
      }}
    >
      <svg
        ref={svgRef}
        width={innerW}
        height={innerH}
        viewBox={`0 0 ${innerW} ${innerH}`}
        className="block"
        role="img"
        aria-hidden
      >
        {/* Corner label */}
        <text
          x={8}
          y={20}
          className="font-mono"
          style={{ fontSize: 10, fill: "var(--bone-dim)" }}
        >
          depth · service →
        </text>

        <g ref={gRef}>
          {/* Stratum bands with progressive dust */}
          {STRATA.map((s, i) => {
            const y = X_AXIS_H + PADDING + i * stratumH;
            const dust = i * 0.005;
            return (
              <g key={s.label}>
                <rect
                  x={Y_AXIS_W + PADDING}
                  y={y}
                  width={plotW}
                  height={stratumH}
                  fill="var(--bone)"
                  fillOpacity={dust}
                />
                {/* boundary line */}
                <line
                  x1={Y_AXIS_W + PADDING}
                  y1={y}
                  x2={Y_AXIS_W + PADDING + plotW}
                  y2={y}
                  stroke="var(--sediment)"
                  strokeWidth={1}
                  strokeDasharray="2 6"
                />
                <text
                  x={PADDING}
                  y={y + 12}
                  className="font-mono"
                  style={{ fontSize: 10, fill: "var(--bone-dim)" }}
                >
                  {s.label}
                </text>
              </g>
            );
          })}

          {/* Lane boundaries + labels */}
          {LANES.map((lane, i) => {
            const x = Y_AXIS_W + PADDING + i * laneW;
            const isLegacy = lane === "legacy";
            return (
              <g key={lane}>
                <line
                  x1={x}
                  y1={X_AXIS_H}
                  x2={x}
                  y2={X_AXIS_H + PADDING + plotH}
                  stroke="var(--hairline)"
                  strokeWidth={1}
                />
                <text
                  x={x + laneW / 2}
                  y={X_AXIS_H - 8}
                  textAnchor="middle"
                  className="font-mono"
                  style={{ fontSize: 10, fill: isLegacy ? "var(--deprecated)" : "var(--bone-dim)" }}
                >
                  {lane}
                </text>
              </g>
            );
          })}
          <line
            x1={Y_AXIS_W + PADDING + plotW}
            y1={X_AXIS_H}
            x2={Y_AXIS_W + PADDING + plotW}
            y2={X_AXIS_H + PADDING + plotH}
            stroke="var(--hairline)"
            strokeWidth={1}
          />

          {/* Edges — base layer (always rendered; dimmed under blast). */}
          {edges.map((e, i) => {
            const sFiltered = !matchesFilters(e.source);
            const tFiltered = !matchesFilters(e.target);
            const dim = sFiltered || tFiltered;
            const isSelected =
              selectedId !== null && (e.source.id === selectedId || e.target.id === selectedId);
            const baseOpacity = e.crossesStrata ? 0.5 : 0.25;
            const onFault = blastHops?.edgeHop.has(i) ?? false;
            // In blast mode every original edge dims to ghost-opacity except
            // the ones the fault traverses (they're already going to be
            // re-painted in critical-red as the overlay).
            let opacity = isSelected ? 1 : dim ? 0.05 : baseOpacity;
            if (blastActive) {
              opacity = onFault ? 0.18 : 0.12;
            }
            const strokeColor = isSelected
              ? "var(--blueprint)"
              : e.crossesStrata
                ? "var(--deprecated)"
                : "var(--bone-dim)";
            const mid = midpoint(e.source.x, e.source.y, e.target.x, e.target.y);
            const cpY = mid.y + Math.abs(e.target.y - e.source.y) * 0.18;
            return (
              <path
                key={i}
                d={`M ${e.source.x} ${e.source.y} Q ${mid.x} ${cpY} ${e.target.x} ${e.target.y}`}
                fill="none"
                stroke={strokeColor}
                strokeWidth={isSelected ? 2 : e.crossesStrata ? 1.5 : 1}
                opacity={opacity}
                style={{ transition: "opacity 320ms cubic-bezier(0.22,1,0.36,1)" }}
              />
            );
          })}

          {/* Fault-line overlay — only in blast mode. Each edge on the BFS
              path draws itself from origin → target via a dashoffset
              transition, staggered by hop × BLAST_HOP_MS. */}
          {blastActive && blastHops ? (
            <g key={`fault-${blastEpoch}`} aria-hidden>
              {edges.map((e, i) => {
                const hop = blastHops.edgeHop.get(i);
                if (hop === undefined) return null;
                const mid = midpoint(e.source.x, e.source.y, e.target.x, e.target.y);
                const cpY = mid.y + Math.abs(e.target.y - e.source.y) * 0.18;
                const d = `M ${e.source.x} ${e.source.y} Q ${mid.x} ${cpY} ${e.target.x} ${e.target.y}`;
                // Cheap path-length proxy: straight-line distance scaled up to
                // approximate the cubic-Bézier arc. Good enough for a draw-in.
                const dx = e.target.x - e.source.x;
                const dy = e.target.y - e.source.y;
                const length = Math.max(40, Math.sqrt(dx * dx + dy * dy) * 1.05);
                const delayMs = hop * BLAST_HOP_MS;
                return (
                  <FaultEdge
                    key={i}
                    d={d}
                    length={length}
                    delayMs={delayMs}
                    drawMs={BLAST_EDGE_DRAW_MS}
                    snap={reduceMotion}
                  />
                );
              })}
            </g>
          ) : null}

          {/* Nodes */}
          {positioned.map((n) => {
            const dim = !matchesFilters(n);
            const isSelected = selectedId === n.id;
            const isOther = selectedId !== null && !isSelected;
            let opacity = dim ? 0.15 : isOther ? 0.5 : 1;

            // Blast-radius overlay state for this node.
            const hop = blastHops?.nodeHop.get(n.id);
            const reachable = hop !== undefined;
            const isOrigin = blastActive && n.id === blastOriginId;
            if (blastActive) {
              // Unreachable nodes drop to the ghost layer; reachable nodes
              // stay at full opacity so the fault highlights read.
              opacity = reachable ? 1 : 0.12;
            }

            return (
              <Node
                key={n.id}
                node={n}
                opacity={opacity}
                isSelected={isSelected}
                isHovered={hoverId === n.id}
                onHover={(h) => setHoverId(h ? n.id : null)}
                onClick={() => {
                  setSelectedId(n.id);
                  onSelectEndpoint(n.id);
                }}
                blastReached={blastActive && reachable}
                blastHop={hop ?? null}
                blastIsOrigin={isOrigin}
                blastEpoch={blastEpoch}
                blastSnap={reduceMotion}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  r: number;
  year: number;
  lane: ServiceLane;
}

function Node({
  node,
  opacity,
  isSelected,
  isHovered,
  onHover,
  onClick,
  blastReached,
  blastHop,
  blastIsOrigin,
  blastEpoch,
  blastSnap,
}: {
  node: PositionedNode;
  opacity: number;
  isSelected: boolean;
  isHovered: boolean;
  onHover: (h: boolean) => void;
  onClick: () => void;
  blastReached: boolean;
  blastHop: number | null;
  blastIsOrigin: boolean;
  blastEpoch: number;
  blastSnap: boolean;
}) {
  const classification = node.classification ?? "active";
  const tier = node.risk_tier ?? "low";
  const isCritical = classification === "orphaned" && tier === "critical";

  const stroke =
    isCritical
      ? "var(--critical)"
      : classification === "orphaned"
        ? "var(--orphaned)"
        : classification === "deprecated"
          ? "var(--deprecated)"
          : "var(--active)";

  const fill =
    isCritical
      ? "var(--critical)"
      : classification === "orphaned"
        ? "var(--orphaned)"
        : classification === "deprecated"
          ? "var(--deprecated)"
          : "var(--active)";

  const fillOpacity =
    isCritical ? 0.6 : classification === "orphaned" ? 0.4 : classification === "deprecated" ? 0.5 : 0.65;

  const dashArray =
    classification === "orphaned" ? "1 2" : classification === "deprecated" ? "2 2" : undefined;

  const yearsAgo = Math.max(0, new Date().getFullYear() - node.year);
  const delay = Math.min(0.9, yearsAgo * 0.006);

  // Show the ╳ overlay either because this node is naturally a critical
  // orphan (existing behavior) OR because the blast wave has reached it.
  const showCross = isCritical || blastReached;

  return (
    <motion.g
      initial={{ y: -node.y, opacity: 0 }}
      animate={{ y: 0, opacity: opacity }}
      transition={{ duration: 0.9, delay, ease: [0.65, 0, 0.35, 1] }}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onClick}
    >
      {isSelected ? (
        <circle
          cx={node.x}
          cy={node.y}
          r={node.r + 4}
          fill="none"
          stroke="var(--blueprint)"
          strokeWidth={2}
        />
      ) : null}
      <BlastNodeCircle
        cx={node.x}
        cy={node.y}
        r={node.r}
        baseFill={fill}
        baseFillOpacity={fillOpacity}
        baseStroke={stroke}
        baseStrokeWidth={isCritical ? 1.5 : 1}
        baseDashArray={dashArray}
        blastReached={blastReached}
        blastHop={blastHop}
        blastIsOrigin={blastIsOrigin}
        blastEpoch={blastEpoch}
        blastSnap={blastSnap}
      />
      {showCross ? (
        <BlastCross
          x={node.x}
          y={node.y + 3}
          // Existing critical orphans render immediately. Blast-reached nodes
          // fade their cross in once the fault arrives.
          delayMs={blastReached && !isCritical && blastHop !== null ? blastHop * BLAST_HOP_MS : 0}
          snap={blastSnap || isCritical}
          epoch={blastEpoch}
        />
      ) : null}
      {(isHovered || isSelected || blastReached) && node.metadata.specimen_id ? (
        <g>
          <rect
            x={node.x - 32}
            y={node.y + node.r + 6}
            width={64}
            height={14}
            fill="var(--stratum)"
            stroke="var(--hairline)"
            strokeWidth={1}
          />
          <text
            x={node.x}
            y={node.y + node.r + 16}
            textAnchor="middle"
            className="font-mono"
            style={{
              fontSize: 10,
              fill: isCritical || blastReached ? "var(--critical)" : "var(--bone-dim)",
            }}
          >
            {String(node.metadata.specimen_id).toLowerCase()}
          </text>
        </g>
      ) : null}
    </motion.g>
  );
}

/** Renders the node circle and — when blast mode reaches it — animates a
 *  critical-stroke overlay in at hop × BLAST_HOP_MS. The base circle stays
 *  put so the underlying classification color is still visible. */
function BlastNodeCircle({
  cx,
  cy,
  r,
  baseFill,
  baseFillOpacity,
  baseStroke,
  baseStrokeWidth,
  baseDashArray,
  blastReached,
  blastHop,
  blastIsOrigin,
  blastEpoch,
  blastSnap,
}: {
  cx: number;
  cy: number;
  r: number;
  baseFill: string;
  baseFillOpacity: number;
  baseStroke: string;
  baseStrokeWidth: number;
  baseDashArray: string | undefined;
  blastReached: boolean;
  blastHop: number | null;
  blastIsOrigin: boolean;
  blastEpoch: number;
  blastSnap: boolean;
}) {
  // Origin renders at 2× radius per the spec. Reached nodes adopt critical
  // stroke (2px). The base classification stroke stays under the overlay so
  // it's still legible if the overlay opacity hasn't kicked in yet.
  const originR = blastIsOrigin ? r * 2 : r;
  const delayMs = blastReached && blastHop !== null && !blastSnap ? blastHop * BLAST_HOP_MS : 0;

  return (
    <>
      <circle
        cx={cx}
        cy={cy}
        r={originR}
        fill={baseFill}
        fillOpacity={baseFillOpacity}
        stroke={baseStroke}
        strokeWidth={baseStrokeWidth}
        strokeDasharray={baseDashArray}
        style={{
          transition: "r 240ms cubic-bezier(0.22,1,0.36,1), opacity 240ms",
        }}
      />
      {blastReached ? (
        <circle
          key={`blast-stroke-${blastEpoch}`}
          cx={cx}
          cy={cy}
          r={originR + 0.5}
          fill="none"
          stroke="var(--critical)"
          strokeWidth={2}
          style={{
            opacity: 0,
            animation: blastSnap
              ? "none"
              : `blast-stroke-in 200ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms forwards`,
            ...(blastSnap ? { opacity: 1 } : null),
          }}
        />
      ) : null}
    </>
  );
}

/** The ╳ glyph that lands on each fault-reached node. Same character used
 *  elsewhere in the product (ScanFeed critical lines, GraphLegend, drawer
 *  systems-tree write-access prefix). */
function BlastCross({
  x,
  y,
  delayMs,
  snap,
  epoch,
}: {
  x: number;
  y: number;
  delayMs: number;
  snap: boolean;
  epoch: number;
}) {
  return (
    <text
      key={`cross-${epoch}`}
      x={x}
      y={y}
      textAnchor="middle"
      className="font-mono"
      style={{
        fontSize: 10,
        fill: "var(--critical)",
        fontWeight: 700,
        opacity: snap ? 1 : 0,
        animation: snap
          ? "none"
          : `blast-stroke-in 200ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms forwards`,
      }}
    >
      ╳
    </text>
  );
}

/** A single fault-line edge overlay. Renders a 2px critical stroke and
 *  animates stroke-dashoffset from `length → 0`, giving the visual of the
 *  fault drawing itself from source to target.
 *
 *  Implementation: we mount the path with strokeDashoffset = length (fully
 *  hidden), then on the next paint flip it to 0 via a state change. A CSS
 *  transition with the per-hop delay carries it across, so each edge appears
 *  to draw in sequence. */
function FaultEdge({
  d,
  length,
  delayMs,
  drawMs,
  snap,
}: {
  d: string;
  length: number;
  delayMs: number;
  drawMs: number;
  snap: boolean;
}) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (snap) {
      setDrawn(true);
      return;
    }
    // Defer to next frame so the initial offset paints before the transition
    // target is set — otherwise the browser collapses both states and skips
    // the animation entirely.
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [snap]);

  if (snap) {
    return (
      <path
        d={d}
        fill="none"
        stroke="var(--decay-edge-critical)"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.9}
      />
    );
  }

  return (
    <path
      d={d}
      fill="none"
      stroke="var(--decay-edge-critical)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeDasharray={length}
      strokeDashoffset={drawn ? 0 : length}
      opacity={drawn ? 0.95 : 0.6}
      style={{
        transition: `stroke-dashoffset ${drawMs}ms cubic-bezier(0.65,0,0.35,1) ${delayMs}ms, opacity ${drawMs}ms linear ${delayMs}ms`,
      }}
    />
  );
}

function midpoint(x0: number, y0: number, x1: number, y1: number) {
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

function deterministicJitter(id: string, range: number) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const x = ((h % 100) / 100 - 0.5) * range;
  const y = (((h >> 8) % 100) / 100 - 0.5) * range;
  return { x, y };
}
