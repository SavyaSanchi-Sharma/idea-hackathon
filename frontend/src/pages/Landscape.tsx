import { useState } from "react";
import { useGraph } from "@/hooks/useGraph";
import { useUiStore } from "@/store/uiStore";
import { StratigraphicGraph } from "@/components/graph/StratigraphicGraph";
import { GraphLegend } from "@/components/graph/GraphLegend";
import { GraphControls } from "@/components/graph/GraphControls";
import { BlastRadiusOverlay } from "@/components/graph/BlastRadiusOverlay";
import type { Classification } from "@/types/models";

/**
 * The stratigraphic cross-section. Replaces the force-directed default.
 */
export default function Landscape() {
  const { data: graph, isLoading } = useGraph();
  const openEndpoint = useUiStore((s) => s.openEndpoint);
  const graphMode = useUiStore((s) => s.graphMode);
  const blastOrigin = useUiStore((s) => s.blastRadiusOriginId);

  const [classification, setClassification] = useState<Classification | "all">("all");
  const [search, setSearch] = useState("");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <GraphControls
        classification={classification}
        onClassificationChange={setClassification}
        search={search}
        onSearchChange={setSearch}
      />
      <div className="relative flex flex-1 min-h-0">
        {isLoading || !graph ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="font-mono text-[12px] text-bone-dim">
              retrieving stratigraphy…<span className="caret-blink ml-[4px]" aria-hidden>▮</span>
            </span>
          </div>
        ) : graph.nodes.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="font-mono text-[13px] text-bone-dim">
              no specimens recovered. depth scan has not been executed.
            </span>
          </div>
        ) : (
          <StratigraphicGraph
            graph={graph}
            classificationFilter={classification}
            pathFilter={search}
            onSelectEndpoint={(id) => {
              if (graphMode !== "blast_radius") openEndpoint(id);
            }}
          />
        )}
        <GraphLegend mode={graphMode} />
        {graphMode === "blast_radius" && blastOrigin ? (
          <BlastRadiusOverlay originId={blastOrigin} />
        ) : null}
      </div>
    </div>
  );
}
