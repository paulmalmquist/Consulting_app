"use client";

/**
 * Chart primitives for the ML Algorithm Decision Lab. recharts for scatter/bar/
 * line; custom CSS-grid for the confusion matrix; custom SVG for a SIMPLIFIED
 * dendrogram (recharts has none). Important marks are clickable (open the detail
 * drawer). Dark palette, readable axes, ResponsiveContainer + fixed heights.
 */

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

const AXIS = { stroke: "#525252", fontSize: 11 };
const GRID = "#262626";
const CLUSTER_COLORS = ["#38bdf8", "#34d399", "#f59e0b", "#a78bfa", "#f87171", "#22d3ee"];

function colorFor(key: string | number, index: number): string {
  if (typeof key === "number") return CLUSTER_COLORS[key % CLUSTER_COLORS.length];
  return CLUSTER_COLORS[index % CLUSTER_COLORS.length];
}

const tooltipStyle = {
  contentStyle: {
    background: "#0a0a0a",
    border: "1px solid #404040",
    borderRadius: 6,
    fontSize: 11,
    color: "#e5e5e5",
  },
};

type Pt = Record<string, number | string>;

export function ActualVsPredictedChart({
  points,
  onPointClick,
}: {
  points: Array<{ actual: number; predicted: number; residual?: number }>;
  onPointClick?: (p: Pt) => void;
}) {
  const lo = Math.min(...points.map((p) => Math.min(p.actual, p.predicted)));
  const hi = Math.max(...points.map((p) => Math.max(p.actual, p.predicted)));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="actual" name="Actual" {...AXIS}
          label={{ value: "Actual", position: "insideBottom", offset: -12, fill: "#737373", fontSize: 11 }} />
        <YAxis type="number" dataKey="predicted" name="Predicted" {...AXIS}
          label={{ value: "Predicted", angle: -90, position: "insideLeft", fill: "#737373", fontSize: 11 }} />
        <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke="#525252" strokeDasharray="4 4" />
        <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
        <Scatter
          data={points}
          fill="#38bdf8"
          onClick={(p: unknown) => onPointClick?.((p as { payload: Pt }).payload)}
          style={{ cursor: onPointClick ? "pointer" : "default" }}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function BarSeriesChart({
  data,
  labelKey,
  valueKey,
  onBarClick,
}: {
  data: Array<Record<string, number | string>>;
  labelKey: string;
  valueKey: string;
  onBarClick?: (d: Record<string, number | string>) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" {...AXIS} />
        <YAxis type="category" dataKey={labelKey} width={150} {...AXIS} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "#ffffff10" }} />
        <Bar
          dataKey={valueKey}
          fill="#34d399"
          onClick={(d: unknown) => onBarClick?.((d as { payload: Record<string, number | string> }).payload)}
          style={{ cursor: onBarClick ? "pointer" : "default" }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ExplainedVarianceChart({
  data,
}: {
  data: Array<{ component: string; ratio: number; cumulative: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="component" {...AXIS} />
        <YAxis {...AXIS} domain={[0, 1]} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey="ratio" fill="#a78bfa" />
        <Line type="monotone" dataKey="cumulative" stroke="#38bdf8" dot={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PcaScatterChart({
  points,
  colorKey,
  onPointClick,
}: {
  points: Array<Record<string, number | string>>;
  colorKey: string;
  onPointClick?: (p: Pt) => void;
}) {
  const groups = Array.from(new Set(points.map((p) => String(p[colorKey]))));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="pc1" name="PC1" {...AXIS}
          label={{ value: "PC1", position: "insideBottom", offset: -12, fill: "#737373", fontSize: 11 }} />
        <YAxis type="number" dataKey="pc2" name="PC2" {...AXIS}
          label={{ value: "PC2", angle: -90, position: "insideLeft", fill: "#737373", fontSize: 11 }} />
        <ZAxis range={[36, 36]} />
        <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
        {groups.map((g, i) => (
          <Scatter
            key={g}
            name={g}
            data={points.filter((p) => String(p[colorKey]) === g)}
            fill={colorFor(g, i)}
            onClick={(p: unknown) => onPointClick?.((p as { payload: Pt }).payload)}
            style={{ cursor: onPointClick ? "pointer" : "default" }}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function RocCurveChart({ points }: { points: Array<{ fpr: number; tpr: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="fpr" domain={[0, 1]} {...AXIS} />
        <YAxis type="number" dataKey="tpr" domain={[0, 1]} {...AXIS} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#525252" strokeDasharray="4 4" />
        <Tooltip {...tooltipStyle} />
        <Line type="monotone" dataKey="tpr" stroke="#38bdf8" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface ConfusionCells {
  true_negative: number;
  false_positive: number;
  false_negative: number;
  true_positive: number;
}

export function ConfusionMatrix({
  cells,
  labels,
  onCellClick,
}: {
  cells: ConfusionCells;
  labels: string[];
  onCellClick?: (kind: string) => void;
}) {
  const max = Math.max(cells.true_negative, cells.false_positive, cells.false_negative, cells.true_positive, 1);
  const cell = (kind: keyof ConfusionCells, tone: string, note?: string) => {
    const v = cells[kind];
    const intensity = 0.12 + 0.55 * (v / max);
    return (
      <button
        type="button"
        onClick={() => onCellClick?.(kind)}
        className="rounded-md border border-neutral-800 p-3 text-left hover:border-neutral-600"
        style={{ background: `${tone}${Math.round(intensity * 255).toString(16).padStart(2, "0")}` }}
      >
        <div className="text-[10px] uppercase tracking-wide text-neutral-300">{kind.replace(/_/g, " ")}</div>
        <div className="text-xl font-semibold text-neutral-50">{v}</div>
        {note ? <div className="text-[10px] text-amber-300 mt-0.5">{note}</div> : null}
      </button>
    );
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {cell("true_negative", "#10b981")}
        {cell("false_positive", "#f59e0b")}
        {cell("false_negative", "#ef4444", "Business risk: missed risk event")}
        {cell("true_positive", "#10b981")}
      </div>
      <div className="text-[10px] text-neutral-500 mt-2">
        Rows = actual ({labels.join(" / ")}); columns = predicted. Click a cell for the records.
      </div>
    </div>
  );
}

/** Simplified, depth-capped SVG cluster tree (NOT a full dendrogram). */
interface TreeNode {
  id: number;
  height: number;
  count: number;
  children?: TreeNode[];
}

export function Dendrogram({ node }: { node: TreeNode }) {
  const leaves: TreeNode[] = [];
  const collect = (n: TreeNode) => {
    if (!n.children || n.children.length === 0) leaves.push(n);
    else n.children.forEach(collect);
  };
  collect(node);
  const width = 320;
  const height = Math.max(120, leaves.length * 28);
  const maxH = node.height || 1;
  const leafY = new Map<number, number>();
  leaves.forEach((l, i) => leafY.set(l.id, (i + 0.5) * (height / leaves.length)));

  const lines: React.ReactNode[] = [];
  let key = 0;
  const x = (h: number) => width - 40 - (h / maxH) * (width - 80);
  const draw = (n: TreeNode): number => {
    if (!n.children || n.children.length === 0) {
      const y = leafY.get(n.id) ?? height / 2;
      lines.push(
        <text key={`t${key++}`} x={width - 32} y={y + 3} fontSize={10} fill="#a3a3a3">
          {n.count}
        </text>,
      );
      return y;
    }
    const ys = n.children.map(draw);
    const y = ys.reduce((a, b) => a + b, 0) / ys.length;
    const nx = x(n.height);
    ys.forEach((cy, i) => {
      const cx = x(n.children![i].height);
      lines.push(<line key={`l${key++}`} x1={nx} y1={cy} x2={cx} y2={cy} stroke="#38bdf8" strokeWidth={1.2} />);
    });
    lines.push(
      <line key={`v${key++}`} x1={nx} y1={Math.min(...ys)} x2={nx} y2={Math.max(...ys)} stroke="#38bdf8" strokeWidth={1.2} />,
    );
    return y;
  };
  draw(node);

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Simplified cluster tree">
        {lines}
      </svg>
      <div className="text-[10px] text-neutral-500 mt-1">
        Simplified cluster tree (depth-capped). Leaf labels = cluster sizes.
      </div>
    </div>
  );
}

export function SimpleTable({
  columns,
  rows,
  onRowClick,
}: {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
  onRowClick?: (row: Record<string, unknown>) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-neutral-500 text-left">
            {columns.map((c) => (
              <th key={c.key} className="font-medium px-2 py-1 border-b border-neutral-800">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              className={`border-b border-neutral-900 ${onRowClick ? "cursor-pointer hover:bg-neutral-800/50" : ""}`}
            >
              {columns.map((c) => (
                <td key={c.key} className="px-2 py-1 text-neutral-200">
                  {String(row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
