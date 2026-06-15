"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getSkillRegistry, getToolDetail,
  type SkillRegistryResponse, type SkillSummary, type ToolDetailResponse,
} from "@/lib/automated-data-engineering/api";
import {
  C, Panel, Tag, PageHeading, Loading, ErrorState, EmptyState, UnavailableState,
  Drawer, DrawerRow,
} from "./primitives";

// Searchable, filterable view of the governed skill registry. Row click opens
// a drawer that fetches the full manifest (including the input schema) for one
// tool. List data never carries full schema bodies — only the detail call does.

const ALL = "all";

function permColor(p: string): string {
  if (p === "read") return C.green;
  if (p === "write") return C.amber;
  return C.violet;
}

function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", color: C.faint, textTransform: "uppercase" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: C.mono, fontSize: 11, color: C.text, background: C.panelHi,
          border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px" }}>
        <option value={ALL}>all</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function ToolDrawer({ name, onClose }: { name: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ToolDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    getToolDetail(name).then(setDetail).catch((e) => setError(String(e)));
  }, [name]);

  return (
    <Drawer title={name} eyebrow="Skill manifest" onClose={onClose}>
      {error && <ErrorState message={error} />}
      {!error && !detail && <Loading label="Loading manifest…" />}
      {detail && detail.null_reason && <UnavailableState nullReason={detail.null_reason} />}
      {detail && !detail.null_reason && (
        <>
          <DrawerRow label="Module" value={detail.module} />
          <DrawerRow label="Permission" value={<Tag color={permColor(detail.permission)}>{detail.permission}</Tag>} />
          <DrawerRow label="Side effect" value={detail.side_effect_class} />
          <DrawerRow label="Permission required" value={detail.permission_required} />
          <DrawerRow label="Confirmation" value={detail.confirmation_required ? "required" : "not required"} />
          <DrawerRow label="Lane tags" value={detail.lane_tags.join(", ") || "—"} />
          <DrawerRow label="Skill tags" value={detail.skill_tags.join(", ") || "—"} />
          <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.55, margin: "14px 0" }}>
            {detail.description}
          </p>
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.faint, textTransform: "uppercase", marginBottom: 8 }}>
            Input schema
          </div>
          <pre style={{ fontFamily: C.mono, fontSize: 11, color: C.text, background: C.panelHi,
            border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, overflowX: "auto",
            whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>
            {JSON.stringify(detail.input_schema, null, 2)}
          </pre>
        </>
      )}
    </Drawer>
  );
}

export default function SkillRegistryTable() {
  const [data, setData] = useState<SkillRegistryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState(ALL);
  const [permFilter, setPermFilter] = useState(ALL);
  const [sideFilter, setSideFilter] = useState(ALL);
  const [confirmFilter, setConfirmFilter] = useState(ALL);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    getSkillRegistry().then(setData).catch((e) => setError(String(e)));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.tools.filter((t: SkillSummary) => {
      if (moduleFilter !== ALL && t.module !== moduleFilter) return false;
      if (permFilter !== ALL && t.permission !== permFilter) return false;
      if (sideFilter !== ALL && t.side_effect_class !== sideFilter) return false;
      if (confirmFilter !== ALL && String(t.confirmation_required) !== confirmFilter) return false;
      if (q && !(`${t.name} ${t.module} ${t.description}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [data, query, moduleFilter, permFilter, sideFilter, confirmFilter]);

  const heading = (
    <PageHeading eyebrow="Governance" title="Skill Registry"
      blurb="Every tool the fabric can execute, with its declared permission mode, side-effect class, and confirmation requirement. Click a row for the full manifest and input schema." />
  );

  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!data) return <>{heading}<Loading label="Loading skill registry…" /></>;
  if (data.null_reason) return <>{heading}<UnavailableState nullReason={data.null_reason} /></>;

  const modules = [...new Set(data.tools.map((t) => t.module))].sort();
  const perms = [...new Set(data.tools.map((t) => t.permission))].sort();
  const sides = [...new Set(data.tools.map((t) => t.side_effect_class))].sort();

  const grid = "1.6fr 1fr 0.7fr 0.9fr 0.8fr";

  return (
    <>
      {heading}
      <Panel title="Registered skills" right={<Tag color={C.accent}>{filtered.length} of {data.tools.length}</Tag>}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, module, description…"
            style={{ fontFamily: C.mono, fontSize: 12, color: C.text, background: C.panelHi,
              border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px 10px", minWidth: 220, flex: "1 1 220px" }} />
          <FilterSelect label="Module" value={moduleFilter} options={modules} onChange={setModuleFilter} />
          <FilterSelect label="Permission" value={permFilter} options={perms} onChange={setPermFilter} />
          <FilterSelect label="Side effect" value={sideFilter} options={sides} onChange={setSideFilter} />
          <FilterSelect label="Confirmation" value={confirmFilter} options={["true", "false"]} onChange={setConfirmFilter} />
        </div>

        {data.tools.length === 0 ? (
          <EmptyState label="No skills registered" hint="The registry responded but contains no tools." />
        ) : filtered.length === 0 ? (
          <EmptyState label="No matches" hint="No skill matches the current search and filters." />
        ) : (
          <>
            <div className="hidden sm:grid" style={{ gridTemplateColumns: grid, gap: 8, fontFamily: C.mono, fontSize: 10,
              color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase", paddingBottom: 8 }}>
              <span>Skill</span><span>Module</span><span>Permission</span><span>Side effect</span><span>Confirm</span>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, maxHeight: 620, overflowY: "auto" }}>
              {filtered.map((t) => (
                <button key={t.name} type="button" onClick={() => setSelected(t.name)}
                  className="grid grid-cols-2 sm:grid-cols-[1.6fr_1fr_0.7fr_0.9fr_0.8fr]"
                  style={{ width: "100%", gap: 8, alignItems: "center", textAlign: "left",
                    fontFamily: C.mono, fontSize: 12, color: C.text, padding: "8px 0",
                    background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                    cursor: "pointer" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                  <span style={{ color: C.dim }}>{t.module}</span>
                  <span><Tag color={permColor(t.permission)}>{t.permission}</Tag></span>
                  <span style={{ color: C.dim }}>{t.side_effect_class}</span>
                  <span style={{ color: t.confirmation_required ? C.amber : C.faint }}>
                    {t.confirmation_required ? "required" : "—"}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </Panel>

      {selected && <ToolDrawer name={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
