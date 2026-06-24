"use client";

// Interactive system-architecture map for the telemetry "How This Works" page. A faithful React
// port of the standalone "Winston Telemetry Architecture" SVG diagram, rebuilt in the telemetry
// `C` palette (primitives.tsx) — tabbed views, a hand-rolled pan/zoom node graph, a click-a-node
// plain-English story drawer, and status / serving-tech legends. Dependency-free: no xyflow/d3.
//
// It is a VISUAL EXPLANATION of verified system structure, not a simulator — nothing executes and
// no live value is fetched. Each node names its real source/service/table and carries an honest
// status; nodes with a real live surface deep-link to it (env-scoped).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";

import { C, Panel } from "./primitives";
import { telemetryHref } from "./telemetryNav";
import {
  ARCH_VIEWS, MASTER_COLUMNS, MASTER_LANES, STATUS_LABEL, STATUS_HINT, SHAPE_LABEL,
  TECH, TECH_ORDER, KNOWN_LIMITATIONS,
  type ArchView, type ArchNode, type ArchStatus, type NodeShape, type EdgeKind, type TechKey,
} from "./telemetryArchitectureData";

// ── palette mapping (source hexes → telemetry C tokens) ──
function statusColor(s: ArchStatus): string {
  return s === "live" ? C.green
    : s === "synth" ? C.cyan
    : s === "evidence" ? "#b07cff"   // committed/evidence — purple, kept literal (no C token)
    : s === "optional" ? C.amber
    : C.faint;                        // planned
}
function edgeColor(k: EdgeKind): string {
  return k === "committed" || k === "evidence" ? "#b07cff"
    : k === "optional" ? C.amber
    : k === "warn" ? C.red
    : k === "synth" ? "#0094b0"
    : "#46566f";                      // norm
}
function ink(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#07090C" : "#ffffff";
}

const NODE_FILL = "#0E141C";
const STATUSES: ArchStatus[] = ["live", "synth", "evidence", "optional", "planned"];

// Status precedence for a grouped node — the strongest truth class among its members wins.
const STATUS_RANK: Record<ArchStatus, number> = { live: 5, synth: 4, evidence: 3, optional: 2, planned: 1 };

// ── geometry: positioned node + the per-view computed scene ──
interface GroupMember { id: string; label: string; note: string; plain: string; status: ArchStatus; slug?: string }
interface PNode extends ArchNode {
  cx: number; cy: number; w: number; h: number; place: string;
  /** When set, this node rolls up several real tables/scripts that share one serving system. */
  members?: GroupMember[];
}
interface PEdge { a: PNode; b: PNode; label: string; kind: EdgeKind }
interface Scene { w: number; h: number; nodes: PNode[]; edges: PEdge[];
  decor: { cols?: boolean; bands: { label: string; color: string; y0: number; y1: number }[] };
  lanes: { key: string; name: string; color: string; top: number; height: number }[];
}

function nodeHeight(label: string): number {
  return Math.max(44, label.split("\n").length * 13 + 16);
}

// Detail views: a free grid positioned from the per-view layout, with optional band overlays.
function detailScene(view: ArchView): Scene {
  const { ox, oy, colGap, rowGap, nw } = view.layout;
  const map = new Map<string, PNode>();
  let maxX = 0, maxY = 0;
  const nodes: PNode[] = view.nodes.map((t) => {
    const w = t.width ?? nw, h = nodeHeight(t.label);
    const cx = ox + t.col * colGap, cy = oy + t.row * rowGap;
    const p: PNode = { ...t, cx, cy, w, h, place: "" };
    map.set(t.id, p);
    maxX = Math.max(maxX, cx + w / 2); maxY = Math.max(maxY, cy + h / 2);
    return p;
  });
  const edges = view.edges.map((e) => ({ a: map.get(e.from)!, b: map.get(e.to)!, label: e.label, kind: e.kind }))
    .filter((e) => e.a && e.b);
  const W = maxX + 60, H = maxY + 70;
  const bands = view.bands.map((b) => ({ label: b.label, color: b.color, y0: oy + b.row0 * rowGap, y1: oy + b.row1 * rowGap }));
  return { w: W, h: H, nodes, edges, decor: { bands }, lanes: [] };
}

// Master view, collapsed to serving systems: within each lane, every node that shares a serving
// tech (Databricks, Supabase, Kafka, FastAPI…) folds into ONE grouped node placed at its members'
// average pipeline stage; the underlying tables/scripts move into the node's `members` (shown in the
// drawer). Tech-less nodes (sources, gates, UIs) stay standalone so each lane still reads
// source → [services] → UI. Columns are rescaled to the occupied stage range so the map fills width.
function masterGroupedScene(view: ArchView): Scene {
  const GUT = 210, HEAD = 120, LANEH = 150, NW = 200;
  const laneTop: number[] = [];
  let y = HEAD;
  for (let j = 0; j < 8; j++) { laneTop[j] = y; y += LANEH; }
  const bottom = y;

  // Build per-lane positioned nodes: group by tech, keep tech-less nodes individual.
  interface Raw { col: number; row: number; node: PNode }
  const raws: Raw[] = [];
  for (let lane = 0; lane < 8; lane++) {
    const laneNodes = view.nodes.filter((n) => n.row === lane);
    const byTech = new Map<TechKey, ArchNode[]>();
    const solo: ArchNode[] = [];
    for (const n of laneNodes) {
      if (n.tech) { const a = byTech.get(n.tech) ?? []; a.push(n); byTech.set(n.tech, a); }
      else solo.push(n);
    }
    // grouped tech nodes
    for (const [tech, members] of byTech) {
      // average column → pipeline stage; status = strongest; warn = any.
      const avgCol = members.reduce((s, m) => s + m.col, 0) / members.length;
      const status = members.reduce<ArchStatus>((best, m) => STATUS_RANK[m.status] > STATUS_RANK[best] ? m.status : best, members[0].status);
      const warn = members.some((m) => m.warn);
      const slug = members.find((m) => m.slug !== undefined)?.slug;
      const single = members.length === 1;
      const label = single ? members[0].label : `${TECH[tech].name}\n${members.length} components`;
      const grouped: PNode = {
        id: `grp_${lane}_${tech}`, col: Math.round(avgCol), row: lane, shape: "cylinder",
        status, label, warn, yOffset: 0, note: "", plain: single ? members[0].plain
          : `${members.length} ${TECH[tech].name} components in this lane, collapsed into one serving system. Open to see each table, topic, or script.`,
        tech, cx: 0, cy: 0, w: NW, h: 0, place: "",
        members: single ? undefined : members.map((m) => ({ id: m.id, label: m.label, note: m.note, plain: m.plain, status: m.status, slug: m.slug })),
        slug,
      };
      raws.push({ col: avgCol, row: lane, node: grouped });
    }
    // solo (tech-less) nodes — keep as themselves
    for (const n of solo) {
      raws.push({ col: n.col, row: lane, node: { ...n, cx: 0, cy: 0, w: n.width ?? NW, h: 0, place: "" } });
    }
  }

  // Rescale the occupied column range to fill 10 stage-slots of width (no empty right gutter).
  const cols = raws.map((r) => r.col);
  const minC = Math.min(...cols), maxC = Math.max(...cols);
  const SLOTS = 10, COLW = 212;
  const span = maxC - minC || 1;
  const xOf = (col: number) => GUT + ((col - minC) / span) * (SLOTS - 1) * COLW + COLW / 2;
  const W = GUT + SLOTS * COLW + 30, H = bottom + 18;

  // Resolve collisions: nodes in the same lane landing on near-identical x get nudged apart vertically.
  const map = new Map<string, PNode>();
  const perLane = new Map<number, Raw[]>();
  for (const r of raws) { const a = perLane.get(r.row) ?? []; a.push(r); perLane.set(r.row, a); }
  for (const [lane, list] of perLane) {
    list.sort((a, b) => a.col - b.col);
    // bucket by rounded x to detect overlap, then fan out within the lane band.
    const buckets = new Map<number, Raw[]>();
    for (const r of list) { const k = Math.round(xOf(r.col) / 60); const a = buckets.get(k) ?? []; a.push(r); buckets.set(k, a); }
    for (const r of list) {
      const k = Math.round(xOf(r.col) / 60);
      const group = buckets.get(k)!;
      const idx = group.indexOf(r);
      const spread = (group.length - 1) * 34;
      const h = nodeHeight(r.node.label);
      r.node.cx = xOf(r.col);
      r.node.cy = laneTop[lane] + LANEH / 2 + (idx * 34 - spread / 2);
      r.node.h = h;
      r.node.place = `Lane ${String.fromCharCode(65 + lane)} · ${r.node.members ? "grouped serving system" : MASTER_COLUMNS[Math.min(9, Math.max(0, r.node.col - 1))]}`;
      map.set(r.node.id, r.node);
    }
  }
  const nodes = [...map.values()];

  // Remap edges onto group nodes; drop intra-group self-loops; dedupe.
  const owner = new Map<string, string>(); // original node id → rendered node id
  for (const r of raws) {
    if (r.node.members) for (const m of r.node.members) owner.set(m.id, r.node.id);
    else owner.set(r.node.id, r.node.id);
  }
  const seen = new Set<string>();
  const edges: PEdge[] = [];
  for (const e of view.edges) {
    const aId = owner.get(e.from), bId = owner.get(e.to);
    if (!aId || !bId || aId === bId) continue;
    const key = `${aId}->${bId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const a = map.get(aId), b = map.get(bId);
    if (a && b) edges.push({ a, b, label: "", kind: e.kind });
  }

  const lanes = MASTER_LANES.map((l, j) => ({ key: l.key, name: l.name, color: l.color, top: laneTop[j], height: LANEH }));
  return { w: W, h: H, nodes, edges, decor: { cols: false, bands: [] }, lanes };
}

function buildScene(view: ArchView): Scene {
  return view.isMaster ? masterGroupedScene(view) : detailScene(view);
}

// Orthogonal elbow route between two node anchors (mirrors the source `route`).
function route(a: PNode, b: PNode): { d: string; lx: number; ly: number } {
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  const sgn = (v: number) => (v >= 0 ? 1 : -1);
  if (Math.abs(dx) >= Math.abs(dy)) {
    const sx = a.cx + sgn(dx) * a.w / 2, sy = a.cy, ex = b.cx - sgn(dx) * b.w / 2, ey = b.cy;
    const mx = (sx + ex) / 2;
    return { d: `M${sx},${sy} L${mx},${sy} L${mx},${ey} L${ex},${ey}`, lx: mx, ly: (sy + ey) / 2 };
  }
  const sy = a.cy + sgn(dy) * a.h / 2, sx = a.cx, ey = b.cy - sgn(dy) * b.h / 2, ex = b.cx;
  const my = (sy + ey) / 2;
  return { d: `M${sx},${sy} L${sx},${my} L${ex},${my} L${ex},${ey}`, lx: (sx + ex) / 2, ly: my };
}

// ── SVG node shape (mirrors the source `shapeEls`) ──
function NodeShapeEl({ n }: { n: PNode }) {
  const x = n.cx - n.w / 2, y = n.cy - n.h / 2, w = n.w, h = n.h;
  const col = statusColor(n.status);
  const dash = n.status === "planned" ? "5 4" : undefined;
  const sw = 1.7;
  const parts = [];
  if (n.shape === "cloud") {
    parts.push(<path key="s" transform={`translate(${x},${y}) scale(${w / 120},${h / 80})`}
      d="M34,70 C18,70 8,58 12,44 C4,36 8,20 22,20 C26,8 44,2 58,8 C66,-2 88,0 92,14 C108,12 118,26 110,40 C120,50 112,68 96,68 C92,76 76,78 68,70 C58,76 44,76 34,70 Z"
      fill={NODE_FILL} stroke={col} strokeWidth={sw} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />);
  } else if (n.shape === "cylinder") {
    const ry = Math.min(10, h * 0.16);
    parts.push(<path key="b" d={`M${x},${y + ry} A${w / 2},${ry} 0 0 1 ${x + w},${y + ry} L${x + w},${y + h - ry} A${w / 2},${ry} 0 0 1 ${x},${y + h - ry} Z`} fill={NODE_FILL} stroke={col} strokeWidth={sw} strokeDasharray={dash} />);
    parts.push(<ellipse key="t" cx={n.cx} cy={y + ry} rx={w / 2} ry={ry} fill="none" stroke={col} strokeWidth={sw} />);
  } else if (n.shape === "diamond") {
    parts.push(<polygon key="s" points={`${n.cx},${y} ${x + w},${n.cy} ${n.cx},${y + h} ${x},${n.cy}`} fill={NODE_FILL} stroke={col} strokeWidth={sw} strokeDasharray={dash} />);
  } else if (n.shape === "doc") {
    parts.push(<path key="s" d={`M${x},${y} H${x + w} V${y + h - 7} C ${x + w * 0.66},${y + h + 6} ${x + w * 0.34},${y + h - 18} ${x},${y + h - 7} Z`} fill={NODE_FILL} stroke={col} strokeWidth={sw} strokeDasharray={dash} />);
  } else if (n.shape === "screen") {
    parts.push(<rect key="s" x={x} y={y} width={w} height={h} rx={4} ry={4} fill={NODE_FILL} stroke={col} strokeWidth={sw} strokeDasharray={dash} />);
    parts.push(<rect key="a" x={x + 5} y={y + 5} width={w - 10} height={2.5} fill={col} opacity={0.55} />);
    parts.push(<path key="p" d={`M${n.cx - 12},${y + h + 6} h24 M${n.cx},${y + h} v6`} stroke={col} strokeWidth={sw} fill="none" />);
  } else {
    parts.push(<rect key="s" x={x} y={y} width={w} height={h} rx={4} ry={4} fill={NODE_FILL} stroke={col} strokeWidth={sw} strokeDasharray={dash} />);
  }
  // label
  const lines = n.label.split("\n");
  const startY = n.cy - ((lines.length - 1) * 13) / 2;
  parts.push(
    <text key="lbl" x={n.cx} y={startY} textAnchor="middle" fill={C.text}
      style={{ fontFamily: C.mono, fontSize: 11, paintOrder: "stroke", stroke: "#07090C", strokeWidth: 3, strokeLinejoin: "round" }}>
      {lines.map((ln, i) => <tspan key={i} x={n.cx} dy={i === 0 ? "0.32em" : 13}>{ln}</tspan>)}
    </text>
  );
  // warn badge
  if (n.warn) {
    parts.push(<circle key="wc" cx={x + w - 3} cy={y + 4} r={7} fill={C.red} />);
    parts.push(<text key="wt" x={x + w - 3} y={y + 7.5} textAnchor="middle" fill="#fff" style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700 }}>!</text>);
  }
  // tech chip
  if (n.tech) {
    const cc = TECH[n.tech].color, code = TECH[n.tech].code, bw = code.length * 5.4 + 10;
    parts.push(
      <g key="tg" transform={`translate(${x + 2},${y - 8})`}>
        <rect x={0} y={0} width={bw} height={13} rx={2} fill={cc} />
        <text x={bw / 2} y={9.6} textAnchor="middle" fill={ink(cc)} style={{ fontFamily: C.mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.04em" }}>{code}</text>
      </g>
    );
  }
  return <>{parts}</>;
}

const cellLabel: CSSProperties = { fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" };

// ── status chip (drawer + legend) ──
function StatusChip({ status }: { status: ArchStatus }) {
  const color = statusColor(status);
  return (
    <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.05em", color,
      background: color + "18", border: `1px solid ${color}40`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function TechTag({ tech }: { tech: TechKey }) {
  const t = TECH[tech];
  return (
    <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
      color: ink(t.color), background: t.color, borderRadius: 3, padding: "2px 6px" }}>{t.code}</span>
  );
}

// Rendered only inside the floating overlay, which already guards on a selected node.
function NodeDrawer({ node, envId, onClear }: { node: PNode; envId: string; onClear: () => void }) {
  return (
    <Panel title="Node detail" right={
      <button type="button" onClick={onClear} aria-label="Clear selection"
        style={{ fontFamily: C.mono, fontSize: 14, color: C.faint, background: "none", border: "none", cursor: "pointer" }}>×</button>
    }>
      <div style={cellLabel}>{SHAPE_LABEL[node.shape]}</div>
      <div style={{ fontFamily: C.sans, fontSize: 15, fontWeight: 600, color: C.text, marginTop: 4, whiteSpace: "pre-line", lineHeight: 1.3 }}>{node.label}</div>
      <div style={{ marginTop: 9 }}><StatusChip status={node.status} /></div>
      <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.6, marginTop: 12 }}>{node.plain}</p>

      {node.members && node.members.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={cellLabel}>Components ({node.members.length})</div>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {node.members.map((m) => (
              <li key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: statusColor(m.status), marginTop: 5, flexShrink: 0, boxShadow: `0 0 6px ${statusColor(m.status)}88` }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.text, whiteSpace: "pre-line", lineHeight: 1.35 }}>{m.label}</div>
                  {m.plain && <div style={{ fontFamily: C.sans, fontSize: 11.5, color: C.dim, lineHeight: 1.45, marginTop: 2 }}>{m.plain}</div>}
                  {m.note && <div style={{ fontFamily: C.sans, fontSize: 11, color: C.faint, lineHeight: 1.45, marginTop: 2 }}>{m.note}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", marginTop: 14 }}>
        <div>
          <div style={cellLabel}>Served by</div>
          <div style={{ marginTop: 4 }}>{node.tech ? <TechTag tech={node.tech} /> : <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>—</span>}</div>
        </div>
        <div>
          <div style={cellLabel}>Status</div>
          <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginTop: 4 }}>{STATUS_HINT[node.status]}</div>
        </div>
        {node.place && (
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={cellLabel}>Place</div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 4 }}>{node.place}</div>
          </div>
        )}
      </div>

      {node.note && (
        <div style={{ marginTop: 14 }}>
          <div style={cellLabel}>Technical</div>
          <p style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, lineHeight: 1.55, marginTop: 4 }}>{node.note}</p>
        </div>
      )}

      {node.warn && (
        <div style={{ marginTop: 14, border: `1px solid ${C.red}40`, background: C.red + "12", borderRadius: 8, padding: "9px 11px" }}>
          <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.06em", color: C.red, textTransform: "uppercase" }}>⚠ Known limitation</div>
          <p style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, lineHeight: 1.55, marginTop: 6 }}>{node.note || "This path is incomplete or unverified."}</p>
        </div>
      )}

      {node.slug !== undefined && (
        <div style={{ marginTop: 14 }}>
          <Link href={telemetryHref(envId, node.slug)} style={{ fontFamily: C.mono, fontSize: 11.5, color: C.cyan, textDecoration: "none" }}>see live surface →</Link>
        </div>
      )}
    </Panel>
  );
}

// ── legends ──
function StatusLegend() {
  return (
    <Panel title="Status — independent of layer">
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {STATUSES.map((s) => (
          <div key={s} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <StatusChip status={s} />
            <span style={{ fontFamily: C.sans, fontSize: 12, color: C.dim }}>{STATUS_HINT[s]}</span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.red, border: `1px solid ${C.red}40`, background: C.red + "18", borderRadius: 5, padding: "2px 7px" }}>! KNOWN LIMITATION</span>
          <span style={{ fontFamily: C.sans, fontSize: 12, color: C.dim }}>Incomplete or unverified path</span>
        </div>
      </div>
    </Panel>
  );
}

function TechLegend() {
  return (
    <Panel title="Serving tech — the colored tag on each node">
      <p style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginBottom: 10 }}>Which system actually runs it.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
        {TECH_ORDER.map((k) => (
          <span key={k} style={{ display: "inline-flex", gap: 7, alignItems: "center" }}>
            <TechTag tech={k} />
            <span style={{ fontFamily: C.sans, fontSize: 12, color: C.dim }}>{TECH[k].name}</span>
          </span>
        ))}
      </div>
    </Panel>
  );
}

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }

// ── the map ──
export default function TelemetryArchitectureMap({ envId }: { envId: string }) {
  const [viewId, setViewId] = useState<ArchView["id"]>("master");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [k, setK] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const view = ARCH_VIEWS.find((v) => v.id === viewId)!;
  const scene = useMemo(() => buildScene(view), [view]);
  const selected = selectedId ? scene.nodes.find((n) => n.id === selectedId) ?? null : null;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ active: boolean; moved: boolean; x: number; y: number }>({ active: false, moved: false, x: 0, y: 0 });

  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const pad = 40;
    const kk = clamp(Math.min((r.width - pad * 2) / scene.w, (r.height - pad * 2) / scene.h, 1.15), 0.12, 3);
    setK(kk); setTx((r.width - scene.w * kk) / 2); setTy((r.height - scene.h * kk) / 2);
  }, [scene.w, scene.h]);

  // Fit whenever the view changes.
  useEffect(() => { fit(); }, [fit]);

  // Native wheel listener (passive:false so we can preventDefault) + resize.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      setK((prevK) => {
        const nk = clamp(prevK * Math.exp(-e.deltaY * 0.0016), 0.12, 3);
        setTx((prevTx) => cx - ((cx - prevTx) / prevK) * nk);
        setTy((prevTy) => cy - ((cy - prevTy) / prevK) * nk);
        return nk;
      });
    };
    const onResize = () => fit();
    svg.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);
    return () => { svg.removeEventListener("wheel", onWheel); window.removeEventListener("resize", onResize); };
  }, [fit]);

  const zoomBy = (f: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2;
    setK((prevK) => {
      const nk = clamp(prevK * f, 0.12, 3);
      setTx((prevTx) => cx - ((cx - prevTx) / prevK) * nk);
      setTy((prevTy) => cy - ((cy - prevTy) / prevK) * nk);
      return nk;
    });
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { active: true, moved: false, x: e.clientX, y: e.clientY };
    (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.current.moved = true;
    drag.current.x = e.clientX; drag.current.y = e.clientY;
    setTx((v) => v + dx); setTy((v) => v + dy);
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const wasMoved = drag.current.moved;
    drag.current.active = false;
    (e.currentTarget as SVGSVGElement).releasePointerCapture?.(e.pointerId);
    if (!wasMoved) setSelectedId(null); // click on empty canvas clears selection
  };

  const selectView = (id: ArchView["id"]) => { setViewId(id); setSelectedId(null); };

  return (
    <section style={{ marginBottom: 28 }}>
      {/* tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {ARCH_VIEWS.map((v) => {
          const active = v.id === viewId;
          return (
            <button key={v.id} type="button" aria-pressed={active} onClick={() => selectView(v.id)}
              style={{ cursor: "pointer", fontFamily: C.mono, fontSize: 11.5, letterSpacing: "0.04em",
                color: active ? C.cyan : C.dim, background: active ? C.panelHi : C.panel,
                border: `1px solid ${active ? C.cyan : C.border}`, borderRadius: 7, padding: "7px 12px",
                transition: "color 140ms ease, border-color 140ms ease, background 140ms ease" }}>
              {v.label}
            </button>
          );
        })}
      </div>

      <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.04em", color: C.faint, marginBottom: 10 }}>{view.title}</div>

      {/* Full-width map; the node detail is a floating overlay that appears only on click
          (matches the source diagram — top-right card over the canvas, not a permanent column). */}
      <div>
        <div style={{ position: "relative", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", minHeight: 460, height: "68vh" }}>
          <svg ref={svgRef} width="100%" height="100%"
            style={{ display: "block", cursor: drag.current.active ? "grabbing" : "grab", touchAction: "none" }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
            <defs>
              {(["norm", "optional", "warn", "synth", "committed"] as const).map((kind) => (
                <marker key={kind} id={`tam-ar-${kind}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={edgeColor(kind === "committed" ? "committed" : kind)} />
                </marker>
              ))}
            </defs>
            <g transform={`translate(${tx} ${ty}) scale(${k})`}>
              {/* bands (detail views) */}
              {scene.decor.bands.map((b, i) => (
                <g key={`band${i}`}>
                  <rect x={24} y={b.y0} width={scene.w - 48} height={b.y1 - b.y0} fill={b.color} fillOpacity={0.04} stroke={b.color} strokeOpacity={0.22} strokeWidth={1} />
                  <text x={36} y={b.y0 + 16} fill={b.color} fillOpacity={0.85} style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>{b.label}</text>
                </g>
              ))}
              {/* master lane bands + labels + column headers */}
              {view.isMaster && (
                <g>
                  {scene.lanes.map((l) => (
                    <g key={l.key}>
                      <line x1={8} y1={l.top} x2={scene.w} y2={l.top} stroke="#1A2230" strokeWidth={1} />
                      <text x={16} y={l.top + 30} fill={l.color} style={{ fontFamily: C.sans, fontSize: 18, fontWeight: 700, letterSpacing: "0.03em" }}>{l.key}</text>
                      <text x={40} y={l.top + 30} fill={C.dim} style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>{l.name}</text>
                    </g>
                  ))}
                  {/* Detailed column headers only in ungrouped mode; grouped mode shows a flow axis. */}
                  {scene.decor.cols
                    ? MASTER_COLUMNS.map((c, i) => {
                        const x = 210 + i * 212 + 212 / 2;
                        return (
                          <text key={`col${i}`} x={x} y={120 - 40} textAnchor="middle" fill={C.cyan} style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.06em" }}>
                            {String(i + 1).padStart(2, "0")}
                          </text>
                        );
                      })
                    : (
                      <text x={scene.w / 2} y={120 - 44} textAnchor="middle" fill={C.faint} style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                        source · ingest → serving systems → ui   (one node per serving system per lane)
                      </text>
                    )}
                </g>
              )}
              {/* edges */}
              {scene.edges.map((e, i) => {
                const r = route(e.a, e.b);
                const col = edgeColor(e.kind);
                const connected = selected && (e.a.id === selected.id || e.b.id === selected.id);
                const op = selected ? (connected ? 1 : 0.12) : 0.8;
                const dash = e.kind === "optional" || e.kind === "warn" ? "6 4" : undefined;
                const markerKind = e.kind === "committed" || e.kind === "evidence" ? "committed"
                  : e.kind === "optional" ? "optional" : e.kind === "warn" ? "warn" : e.kind === "synth" ? "synth" : "norm";
                return (
                  <g key={`e${i}`}>
                    <path d={r.d} fill="none" stroke={col} strokeWidth={connected ? 1.9 : 1.3} strokeDasharray={dash} opacity={op} markerEnd={`url(#tam-ar-${markerKind})`} />
                    {e.label && (
                      <text x={r.lx} y={r.ly - 2} textAnchor="middle" fill="#9fb0c8" opacity={selected ? (connected ? 1 : 0.1) : 0.92}
                        style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.02em", paintOrder: "stroke", stroke: "#07090C", strokeWidth: 3, strokeLinejoin: "round" }}>{e.label}</text>
                    )}
                  </g>
                );
              })}
              {/* nodes */}
              {scene.nodes.map((n) => {
                const isSel = selected?.id === n.id;
                const op = selected ? (isSel ? 1 : 0.32) : 1;
                return (
                  <g key={n.id} opacity={op} style={{ cursor: "pointer", filter: isSel ? `drop-shadow(0 0 6px ${statusColor(n.status)})` : "none" }}
                    onClick={(ev) => { ev.stopPropagation(); if (!drag.current.moved) setSelectedId(n.id); }}>
                    <NodeShapeEl n={n} />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* zoom controls */}
          <div style={{ position: "absolute", left: 12, bottom: 12, display: "flex", gap: 6, alignItems: "center" }}>
            <MapButton label="−" onClick={() => zoomBy(1 / 1.2)} />
            <MapButton label="+" onClick={() => zoomBy(1.2)} />
            <MapButton label="FIT" onClick={fit} wide />
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginLeft: 4 }}>{Math.round(k * 100)}%</span>
          </div>
          <div style={{ position: "absolute", right: 12, bottom: 12, fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>
            {scene.nodes.length} nodes · {scene.edges.length} edges · drag to pan · scroll to zoom
          </div>

          {/* hint when nothing is selected — keeps the empty canvas reading intentionally */}
          {!selected && (
            <div style={{ position: "absolute", top: 12, right: 12, fontFamily: C.mono, fontSize: 10.5,
              letterSpacing: "0.04em", color: C.faint, background: C.panel + "cc", border: `1px solid ${C.border}`,
              borderRadius: 7, padding: "6px 10px", pointerEvents: "none" }}>
              click a node for its plain-English story
            </div>
          )}

          {/* floating node-detail overlay — rendered only when a node is selected */}
          {selected && (
            <div style={{ position: "absolute", top: 12, right: 12, width: 320, maxWidth: "calc(100% - 24px)",
              maxHeight: "calc(100% - 24px)", overflowY: "auto", zIndex: 5,
              boxShadow: `0 0 0 1px ${C.borderHi}, 0 18px 48px rgba(0,0,0,0.6)`, borderRadius: 10 }}>
              <NodeDrawer node={selected} envId={envId} onClear={() => setSelectedId(null)} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ marginTop: 16 }}>
        <StatusLegend />
        <TechLegend />
      </div>
    </section>
  );
}

function MapButton({ label, onClick, wide }: { label: string; onClick: () => void; wide?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      style={{ cursor: "pointer", fontFamily: C.mono, fontSize: 12, color: C.dim, background: C.panel,
        border: `1px solid ${C.border}`, borderRadius: 6, width: wide ? 40 : 26, height: 26, lineHeight: 1 }}>
      {label}
    </button>
  );
}

// Re-exported for the page so it can render the limitations panel alongside the map.
export function KnownLimitationsPanel() {
  return (
    <Panel title="Known limitations">
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {KNOWN_LIMITATIONS.map((lim) => (
          <li key={lim} style={{ display: "flex", gap: 9, alignItems: "baseline" }}>
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.red, fontWeight: 700, flexShrink: 0 }}>!</span>
            <span style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>{lim}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
