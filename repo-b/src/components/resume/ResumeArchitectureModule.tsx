"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { ResumeArchitecture } from "@/lib/bos-api";
import ResumeFallbackCard from "./ResumeFallbackCard";
import ArchitectureNodeDetail from "./ArchitectureNodeDetail";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";

const LAYER_COLORS: Record<string, string> = {
  source: "rgba(148, 163, 184, 0.12)",
  ingestion: "rgba(16, 185, 129, 0.14)",
  processing: "rgba(59, 130, 246, 0.14)",
  ai: "rgba(168, 85, 247, 0.14)",
  consumption: "rgba(244, 114, 182, 0.14)",
};

const BORDER_COLORS: Record<string, string> = {
  source: "#94a3b8",
  ingestion: "#34d399",
  processing: "#60a5fa",
  ai: "#c084fc",
  consumption: "#f472b6",
};

function ArchitectureFlowInner({ architecture }: { architecture: ResumeArchitecture }) {
  const {
    architectureView,
    setArchitectureView,
    selectedArchitectureNodeId,
    selectArchitectureNode,
    highlightArchitectureNodeIds,
  } = useResumeWorkspaceStore(
    useShallow((state) => ({
      architectureView: state.architectureView,
      setArchitectureView: state.setArchitectureView,
      selectedArchitectureNodeId: state.selectedArchitectureNodeId,
      selectArchitectureNode: state.selectArchitectureNode,
      highlightArchitectureNodeIds: state.highlightArchitectureNodeIds,
    })),
  );

  const { fitView } = useReactFlow();
  const fitViewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const highlightSet = useMemo(() => new Set(highlightArchitectureNodeIds), [highlightArchitectureNodeIds]);
  const hasHighlights = highlightSet.size > 0;

  useEffect(() => {
    if (highlightArchitectureNodeIds.length === 0) return;
    if (fitViewTimer.current) clearTimeout(fitViewTimer.current);
    fitViewTimer.current = setTimeout(() => {
      fitView({
        nodes: highlightArchitectureNodeIds.map((id) => ({ id })),
        padding: 0.35,
        duration: 400,
      });
    }, 300);
    return () => {
      if (fitViewTimer.current) clearTimeout(fitViewTimer.current);
    };
  }, [highlightArchitectureNodeIds, fitView]);

  const nodes = useMemo<Node[]>(
    () =>
      architecture.nodes.map((node) => {
        const isSelected = selectedArchitectureNodeId === node.node_id;
        const isLinked = highlightSet.has(node.node_id);
        const isDimmed = hasHighlights && !isLinked && !isSelected;
        return {
          id: node.node_id,
          position: node.position,
          data: {
            label: (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/55">{node.group}</div>
                <div className="text-sm font-semibold text-white">{node.label}</div>
                <div className="text-xs leading-5 text-white/70">
                  {architectureView === "technical" ? node.description : node.business_problem}
                </div>
                {node.tools.length > 0 ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {node.tools.slice(0, 3).map((tool) => (
                      <span key={tool} className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] text-white/50">
                        {tool}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ),
          },
          style: {
            width: 220,
            borderRadius: 18,
            padding: 16,
            border: `1px solid ${isSelected ? "#ffffff" : isLinked ? BORDER_COLORS[node.layer] : "rgba(255,255,255,0.15)"}`,
            background: LAYER_COLORS[node.layer] ?? "rgba(255,255,255,0.08)",
            boxShadow: isSelected
              ? "0 0 0 2px rgba(255,255,255,0.16), 0 20px 45px -30px rgba(255,255,255,0.45)"
              : isLinked
                ? `0 0 0 1px ${BORDER_COLORS[node.layer]}, 0 16px 36px -24px ${BORDER_COLORS[node.layer]}`
                : "0 18px 48px -36px rgba(5,12,18,0.9)",
            color: "white",
            opacity: isDimmed ? 0.3 : 1,
            transition: "opacity 0.3s ease, box-shadow 0.3s ease, border 0.3s ease",
          },
          draggable: false,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        };
      }),
    [architecture.nodes, architectureView, selectedArchitectureNodeId, highlightSet, hasHighlights],
  );

  const edges = useMemo<Edge[]>(
    () =>
      architecture.edges.map((edge) => {
        const sourceLinked = highlightSet.has(edge.source);
        const targetLinked = highlightSet.has(edge.target);
        const isActiveEdge = hasHighlights && sourceLinked && targetLinked;
        const isDimmedEdge = hasHighlights && !isActiveEdge;
        return {
          id: edge.edge_id,
          source: edge.source,
          target: edge.target,
          label: architectureView === "technical" ? edge.technical_label : edge.impact_label,
          animated: isActiveEdge || !hasHighlights,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isActiveEdge ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)",
          },
          labelStyle: {
            fill: isDimmedEdge ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.68)",
            fontSize: 11,
          },
          style: {
            stroke: isActiveEdge
              ? "rgba(255,255,255,0.6)"
              : isDimmedEdge
                ? "rgba(255,255,255,0.08)"
                : "rgba(255,255,255,0.22)",
            strokeWidth: isActiveEdge ? 2.2 : 1.6,
            transition: "stroke 0.3s ease, opacity 0.3s ease",
          },
        };
      }),
    [architecture.edges, architectureView, highlightSet, hasHighlights],
  );

  const selectedNode = useMemo(
    () => architecture.nodes.find((n) => n.node_id === selectedArchitectureNodeId) ?? null,
    [architecture.nodes, selectedArchitectureNodeId],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectArchitectureNode(selectedArchitectureNodeId === node.id ? null : node.id);
    },
    [selectArchitectureNode, selectedArchitectureNodeId],
  );

  return (
    <section className="rounded-[28px] border border-bm-border/60 bg-bm-surface/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="bm-section-label">Architecture</p>
          <h2 className="mt-2 text-2xl">Governed data foundation to AI operating surface</h2>
          <p className="mt-2 max-w-3xl text-sm text-bm-muted">
            This is the same story expressed in system form: source systems, ingestion, processing, AI, and consumption.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-bm-border/30 bg-white/5 p-1">
          {(["technical", "business"] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setArchitectureView(view)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                architectureView === view ? "bg-white/12 text-white" : "text-bm-muted hover:text-bm-text"
              }`}
            >
              {view === "technical" ? "Technical View" : "Business Impact View"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 h-[640px] overflow-hidden rounded-[24px] border border-bm-border/30 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.09),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          nodesDraggable={false}
          onNodeClick={handleNodeClick}
        >
          <Background gap={24} color="rgba(255,255,255,0.06)" />
          <Controls showInteractive={false} position="bottom-right" />
          <MiniMap
            nodeColor={(node) => {
              const archNode = architecture.nodes.find((n) => n.node_id === String(node.id));
              return BORDER_COLORS[archNode?.layer ?? "processing"] ?? BORDER_COLORS.processing;
            }}
            maskColor="rgba(4, 8, 12, 0.55)"
            pannable
          />
        </ReactFlow>
      </div>

      {selectedNode ? <ArchitectureNodeDetail node={selectedNode} /> : null}

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
        {[
          ["Source Systems", "Source data and manual origin points"],
          ["Ingestion", "Landing and ETL orchestration"],
          ["Processing", "Silver / Gold / semantic logic"],
          ["AI Layer", "Embeddings, vector retrieval, RAG"],
          ["Consumption", "Dashboards, Winston, APIs"],
        ].map(([label, copy]) => (
          <span key={label} className="rounded-full border border-bm-border/35 px-3 py-1">
            {label} · {copy}
          </span>
        ))}
        {architecture.edges.length === 0 ? (
          <span className="rounded-full border border-bm-border/35 px-3 py-1">
            Flow edges unavailable · Showing node topology only
          </span>
        ) : null}
      </div>
    </section>
  );
}

export default function ResumeArchitectureModule({ architecture }: { architecture: ResumeArchitecture }) {
  if (architecture.nodes.length === 0) {
    return (
      <ResumeFallbackCard
        eyebrow="Architecture"
        title="Visualization failed to render"
        body="The architecture layer does not have enough normalized node data to draw a safe system map."
        tone="warning"
      />
    );
  }

  return (
    <ReactFlowProvider>
      <ArchitectureFlowInner architecture={architecture} />
    </ReactFlowProvider>
  );
}
