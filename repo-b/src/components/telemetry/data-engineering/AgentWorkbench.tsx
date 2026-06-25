"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getSkillRegistry,
  type SkillRegistryResponse,
  type SkillSummary,
} from "@/lib/automated-data-engineering/api";
import {
  C,
  EmptyState,
  InlineCode,
  Loading,
  MetricCard,
  PageHeading,
  Panel,
  SelectField,
  StatGrid,
  StatusDot,
  Tag,
  TelemetrySection,
  TelemetryStatusBanner,
} from "../primitives";

// Agent Workbench — the "propose" mode. It frames the live, governed MCP skill registry as the three
// things AI is allowed to do over the data fabric: Observe (read-only), Propose (produce an artifact),
// and Execute-with-guardrails (a write that requires confirmation). Skills come from /api/ade/skill-
// registry (the real registry). Phase 1 shows the full registry; an aerospace-data-engineering default
// view is declared next-phase, not faked.

type Capability = "observe" | "propose" | "execute";

const CAP_META: Record<Capability, { label: string; blurb: string; color: string }> = {
  observe: { label: "Observe", blurb: "Read-only: profile sources, read grain/freshness, inspect lineage. No side effects.", color: C.cyan },
  propose: { label: "Propose", blurb: "Produce an artifact or change for review — a mapping, feature, contract, or PR.", color: C.green },
  execute: { label: "Execute · guardrails", blurb: "A write that fails closed until explicitly confirmed.", color: C.amber },
};

function classify(skill: SkillSummary): Capability {
  if (skill.confirmation_required) return "execute";
  if (skill.side_effect_class === "read" || skill.permission === "read") return "observe";
  return "propose";
}

export default function AgentWorkbench({ envId }: { envId: string }) {
  // envId is accepted for route symmetry; the skill registry is environment-agnostic (platform core).
  void envId;
  const [registry, setRegistry] = useState<SkillRegistryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    getSkillRegistry()
      .then((r) => { if (live) setRegistry(r); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, []);

  const buckets = useMemo(() => {
    const out: Record<Capability, number> = { observe: 0, propose: 0, execute: 0 };
    for (const t of registry?.tools ?? []) out[classify(t)] += 1;
    return out;
  }, [registry]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (registry?.tools ?? [])
      .filter((t) => (!moduleFilter || t.module === moduleFilter))
      .filter((t) => (!q || `${t.name} ${t.description} ${t.skill_tags.join(" ")}`.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [registry, moduleFilter, query]);

  const heading = (
    <PageHeading
      eyebrow="Mode · Agent Workbench"
      title="Agent Workbench"
      blurb="What AI is allowed to do over the data fabric, governed. Every skill declares its permission, side-effect class, and whether it needs confirmation before it can run — so the boundary between observing, proposing, and executing is explicit, not implied."
    />
  );

  if (error && !registry) {
    return <>{heading}<TelemetryStatusBanner tone="error">Skill registry unavailable — {error}.</TelemetryStatusBanner></>;
  }
  if (!registry) return <>{heading}<Loading label="Loading skill registry…" /></>;
  if (registry.null_reason) {
    return <>{heading}<EmptyState label="Skill registry unavailable" hint={`null_reason: ${registry.null_reason}`} /></>;
  }

  return (
    <>
      {heading}

      <TelemetryStatusBanner tone="info">
        Showing the full governed skill registry ({registry.tools.length} skills · {registry.modules.length}{" "}
        modules). An aerospace-data-engineering scoped default view (profile, infer-grain, validate-join,
        generate-contract, propose-feature) is declared next-phase work.
      </TelemetryStatusBanner>

      <StatGrid cols={3} style={{ marginTop: 16 }}>
        {(Object.keys(CAP_META) as Capability[]).map((cap) => (
          <MetricCard key={cap} label={CAP_META[cap].label} value={buckets[cap]} sub={CAP_META[cap].blurb} accent={CAP_META[cap].color} />
        ))}
      </StatGrid>

      <TelemetrySection
        label="Governed skills"
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="search"
              aria-label="Search skills"
              placeholder="Search skills…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ minHeight: 34, borderRadius: 7, border: `1px solid ${C.borderHi}`, background: C.panelHi, color: C.text, padding: "0 11px", fontFamily: C.mono, fontSize: 11 }}
            />
            <SelectField value={moduleFilter} onChange={setModuleFilter} ariaLabel="Filter by module">
              <option value="">All modules</option>
              {registry.modules.map((m) => (
                <option key={m.module} value={m.module}>{m.module} ({m.tool_count})</option>
              ))}
            </SelectField>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState label="No skills match" hint="Clear the search or module filter." />
        ) : (
          <Panel pad={0}>
            <div style={{ maxHeight: 560, overflowY: "auto" }}>
              {filtered.map((t) => {
                const cap = classify(t);
                return (
                  <div key={t.name} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 16px", borderBottom: `1px solid ${C.border}` }}>
                    <StatusDot color={CAP_META[cap].color} size={7} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <InlineCode color={C.text}>{t.name}</InlineCode>
                        <Tag color={CAP_META[cap].color}>{CAP_META[cap].label}</Tag>
                        {t.confirmation_required && <Tag color={C.amber}>confirm required</Tag>}
                      </div>
                      <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.5, marginTop: 5 }}>{t.description}</div>
                    </div>
                    <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, whiteSpace: "nowrap" }}>{t.module}</span>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
      </TelemetrySection>
    </>
  );
}
