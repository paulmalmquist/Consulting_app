"use client";

import React, { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const API_BASE = process.env.NEXT_PUBLIC_BOS_API_URL || "http://localhost:8000";

type GraphNode = {
  node_id: string;
  node_type: string;
  node_label: string;
  properties: Record<string, unknown>;
};

type GraphEdge = {
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
  weight: number;
  confidence: number;
};

const NODE_TYPES = ["vendor", "capability", "workflow", "metric", "industry", "architecture", "pilot", "module", "failure_mode", "pattern"];
const EDGE_TYPES = ["uses", "causes", "resolves", "replaces", "depends_on", "co_occurs", "produces", "consumes"];

const NODE_COLORS: Record<string, string> = {
  vendor: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  capability: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  workflow: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  metric: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  industry: "bg-green-500/15 text-green-400 border-green-500/30",
  architecture: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  pilot: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  module: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  failure_mode: "bg-red-500/15 text-red-400 border-red-500/30",
  pattern: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

export default function GraphPage() {
  const { envId } = useDomainEnv();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodeTypeFilter, setNodeTypeFilter] = useState("");
  const [edgeTypeFilter, setEdgeTypeFilter] = useState("");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (nodeTypeFilter) qs.set("node_types", nodeTypeFilter);
      if (edgeTypeFilter) qs.set("edge_types", edgeTypeFilter);
      const res = await fetch(`${API_BASE}/api/pattern-intel/v1/graph?${qs}`);
      if (!res.ok) throw new Error(`Graph: ${res.status}`);
      const data = await res.json();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeTypeFilter, edgeTypeFilter]);

  // Build adjacency for display
  const nodeMap = new Map(nodes.map((n) => [n.node_id, n]));

  return (
    <section className="space-y-5" data-testid="pattern-intel-graph">
      <div>
        <h2 className="text-2xl font-semibold">Knowledge Graph</h2>
        <p className="text-sm text-bm-muted2">Vendor-to-workflow-to-failure-to-architecture paths across engagements.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={nodeTypeFilter} onChange={(e) => setNodeTypeFilter(e.target.value)} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
          <option value="">All Node Types</option>
          {NODE_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </select>
        <select value={edgeTypeFilter} onChange={(e) => setEdgeTypeFilter(e.target.value)} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
          <option value="">All Edge Types</option>
          {EDGE_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => void refresh()} className="ml-4 text-xs underline">Retry</button>
        </div>
      )}

      {/* Stats bar */}
      <div className="flex gap-4 text-sm text-bm-muted2">
        <span>{loading ? "\u2014" : nodes.length} nodes</span>
        <span>{loading ? "\u2014" : edges.length} edges</span>
      </div>

      {/* Node cards */}
      {loading ? (
        <div className="rounded-xl border border-bm-border/70 p-5 text-sm text-bm-muted2">Loading graph...</div>
      ) : !nodes.length ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-sm text-bm-muted2">
          No graph nodes yet. Nodes are created as patterns and observations are materialized.
        </div>
      ) : (
        <>
          {/* Nodes grouped by type */}
          <div className="space-y-4">
            {NODE_TYPES.filter((t) => nodes.some((n) => n.node_type === t)).map((type) => (
              <div key={type}>
                <h3 className="text-sm font-semibold mb-2 capitalize">{type.replace("_", " ")}s</h3>
                <div className="flex flex-wrap gap-2">
                  {nodes.filter((n) => n.node_type === type).map((n) => (
                    <span key={n.node_id} className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs ${NODE_COLORS[type] || "bg-bm-surface/40 text-bm-muted2 border-bm-border/40"}`}>
                      {n.node_label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Edges */}
          {edges.length > 0 && (
            <div className="rounded-xl border border-bm-border/70 overflow-hidden">
              <div className="border-b border-bm-border/50 px-4 py-3 bg-bm-surface/30">
                <h3 className="text-sm font-semibold">Edges</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 font-medium">Relationship</th>
                    <th className="px-4 py-2 font-medium">Target</th>
                    <th className="px-4 py-2 font-medium">Weight</th>
                    <th className="px-4 py-2 font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bm-border/40">
                  {edges.slice(0, 50).map((e) => {
                    const src = nodeMap.get(e.source_node_id);
                    const tgt = nodeMap.get(e.target_node_id);
                    return (
                      <tr key={e.edge_id} className="hover:bg-bm-surface/20">
                        <td className="px-4 py-3">{src?.node_label || e.source_node_id.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-bm-muted2">{e.edge_type.replace("_", " ")}</td>
                        <td className="px-4 py-3">{tgt?.node_label || e.target_node_id.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-bm-muted2">{Number(e.weight).toFixed(2)}</td>
                        <td className="px-4 py-3 text-bm-muted2">{(Number(e.confidence) * 100).toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
