"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getSkillRegistry,
  type SkillRegistryResponse,
  type SkillSummary,
} from "@/lib/automated-data-engineering/api";
import {
  capabilitiesByMode,
  DE_MODES,
  DE_MODE_BLURB,
  DE_MODE_LABEL,
  matchSkill,
  type DeCapability,
} from "@/lib/telemetry/deCapabilities";
import {
  C,
  EmptyState,
  InlineCode,
  Loading,
  PageHeading,
  Panel,
  SectionTabButton,
  SelectField,
  StatGrid,
  MetricCard,
  StatusDot,
  Tag,
  TelemetrySection,
  TelemetryStatusBanner,
} from "../primitives";

// Agent Workbench (Phase 2B) — the aerospace data-engineering action map. Four groups: Observe,
// Propose, Execute-with-guardrails, and the full Advanced registry. Each curated capability is matched
// to the LIVE governed skill registry: backed → shows the real skill's permission/side-effect/confirm;
// unbacked → shown as a declared capability that CANNOT run (null_reason), never implied runnable.

function CapabilityCard({ cap, backing }: { cap: DeCapability; backing: SkillSummary | null }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${backing ? C.border : C.borderHi}`, borderRadius: 9, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot color={backing ? C.green : C.faint} size={7} glow={Boolean(backing)} />
        <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text, fontWeight: 600 }}>{cap.label}</span>
      </div>
      <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.5, marginTop: 7 }}>{cap.blurb}</div>

      {backing ? (
        <div style={{ marginTop: 11, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.green, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Governed skill available
          </div>
          <div style={{ marginTop: 6 }}><InlineCode color={C.text}>{backing.name}</InlineCode></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <Tag color={C.cyan}>permission: {backing.permission}</Tag>
            <Tag color={backing.side_effect_class === "read" ? C.green : C.amber}>side-effect: {backing.side_effect_class}</Tag>
            {backing.confirmation_required && <Tag color={C.amber}>confirm required</Tag>}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 11, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Declared capability — cannot run
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.amber, marginTop: 6 }}>
            null_reason: no_registered_skill_for_capability
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentWorkbench({ envId }: { envId: string }) {
  // Skill registry is environment-agnostic (platform core); envId kept for route symmetry.
  void envId;
  const [registry, setRegistry] = useState<SkillRegistryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [moduleFilter, setModuleFilter] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    getSkillRegistry()
      .then((r) => { if (!live) return; if (r) setRegistry(r); else setError("skill_registry_unreachable"); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, []);

  const tools = registry?.tools ?? [];
  const byMode = useMemo(() => capabilitiesByMode(), []);
  const backedCount = useMemo(
    () => Object.values(byMode).flat().filter((c) => matchSkill(c, tools)).length,
    [byMode, tools],
  );
  const totalCaps = useMemo(() => Object.values(byMode).flat().length, [byMode]);

  const advancedList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools
      .filter((t) => (!moduleFilter || t.module === moduleFilter))
      .filter((t) => (!q || `${t.name} ${t.description} ${t.skill_tags.join(" ")}`.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tools, moduleFilter, query]);

  const heading = (
    <PageHeading
      eyebrow="Mode · Agent Workbench"
      title="Agent Workbench"
      blurb="The aerospace data-engineering actions, grouped by what they do to the data. Each is matched against the live governed skill registry — where a real skill backs it, you see its permission and side-effect class; where one doesn't exist yet, it's shown as a declared capability that cannot run. Nothing is implied runnable that isn't."
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

      <StatGrid cols={3} style={{ marginBottom: 4 }}>
        <MetricCard label="DE capabilities" value={totalCaps} sub="aerospace data-engineering actions" />
        <MetricCard label="Backed by a governed skill" value={backedCount} sub={`of ${totalCaps} runnable today`} accent={backedCount ? C.green : undefined} />
        <MetricCard label="Full registry" value={registry.tools.length} sub={`${registry.modules.length} modules · advanced`} />
      </StatGrid>

      <TelemetryStatusBanner tone="info">
        {backedCount} of {totalCaps} curated capabilities are backed by a registered governed skill today;
        the rest are declared and fail closed (they cannot run). The complete registry is under Advanced.
      </TelemetryStatusBanner>

      {DE_MODES.map((mode) => (
        <TelemetrySection key={mode} label={`${DE_MODE_LABEL[mode]} — ${DE_MODE_BLURB[mode]}`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byMode[mode].map((cap) => (
              <CapabilityCard key={cap.key} cap={cap} backing={matchSkill(cap, tools)} />
            ))}
          </div>
        </TelemetrySection>
      ))}

      {/* Advanced registry — the full governed skill list, opt-in. */}
      <TelemetrySection
        label="Advanced registry"
        right={
          <SectionTabButton active={advancedOpen} onClick={() => setAdvancedOpen((v) => !v)}>
            {advancedOpen ? "Hide full registry" : `Show full registry (${registry.tools.length})`}
          </SectionTabButton>
        }
      >
        {!advancedOpen ? (
          <span style={{ fontFamily: C.mono, fontSize: 11.5, color: C.faint }}>
            The complete governed skill registry across all modules — declared permissions and side-effect
            classes, the same data the curated cards above are matched against.
          </span>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
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
            {advancedList.length === 0 ? (
              <EmptyState label="No skills match" hint="Clear the search or module filter." />
            ) : (
              <Panel pad={0}>
                <div style={{ maxHeight: 520, overflowY: "auto" }}>
                  {advancedList.map((t) => (
                    <div key={t.name} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <InlineCode color={C.text}>{t.name}</InlineCode>
                          <Tag color={t.side_effect_class === "read" ? C.green : C.amber}>{t.side_effect_class}</Tag>
                          {t.confirmation_required && <Tag color={C.amber}>confirm</Tag>}
                        </div>
                        <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, lineHeight: 1.5, marginTop: 5 }}>{t.description}</div>
                      </div>
                      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, whiteSpace: "nowrap" }}>{t.module}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </>
        )}
      </TelemetrySection>
    </>
  );
}
