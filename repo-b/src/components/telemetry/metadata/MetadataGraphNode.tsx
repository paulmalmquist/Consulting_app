"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { C } from "../primitives";
import type { TelemetryMetadataNode } from "@/lib/telemetry/metadata";

export type MetadataGraphNodeData = {
  node: TelemetryMetadataNode;
  selected: boolean;
  traced: boolean;
};

export type MetadataFlowNode = Node<MetadataGraphNodeData, "metadataNode">;

const LAYER_COLORS: Record<string, string> = {
  source: "#8b9daf",
  bronze: "#c58a5a",
  silver: "#b7c2cd",
  gold: "#f3b14a",
  metric: "#3fb1e8",
  consumer: "#a78bfa",
  model: "#3ddc97",
  runtime: "#ef7066",
};

const STATUS_COLORS: Record<string, string> = {
  fresh: C.green,
  stale: C.amber,
  missing: C.red,
  quarantined: "#c084fc",
  unknown: C.faint,
};

export default function MetadataGraphNode({ data }: NodeProps<MetadataFlowNode>) {
  const { node, selected, traced } = data;
  const layer = node.layer ?? "runtime";
  const accent = LAYER_COLORS[layer] ?? C.dim;
  const status = node.status ?? "unknown";

  return (
    <div
      data-testid={`metadata-node-${node.id}`}
      style={{
        width: 218,
        minHeight: 82,
        borderRadius: 9,
        border: `1px solid ${selected || traced ? accent : C.borderHi}`,
        background: selected ? C.panelHi : C.panel,
        boxShadow: selected
          ? `0 0 0 2px ${accent}35, 0 10px 30px rgba(0,0,0,0.28)`
          : traced
            ? `0 0 0 1px ${accent}25`
            : "0 8px 22px rgba(0,0,0,0.18)",
        padding: "10px 12px",
        color: C.text,
        fontFamily: C.mono,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: accent, border: "none" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span
          style={{
            color: accent,
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {layer} / {node.kind}
        </span>
        <span
          title={status}
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: STATUS_COLORS[status] ?? C.faint,
            flexShrink: 0,
          }}
        />
      </div>
      <div
        style={{
          fontFamily: C.sans,
          fontSize: 13,
          lineHeight: 1.25,
          fontWeight: 650,
          marginTop: 7,
          overflowWrap: "anywhere",
        }}
      >
        {node.label}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          color: C.faint,
          fontSize: 9,
          marginTop: 8,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
        }}
      >
        <span>{node.schema ?? node.metadata?.feed_type?.toString() ?? "catalog"}</span>
        <span>{node.confidence}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: accent, border: "none" }} />
    </div>
  );
}
