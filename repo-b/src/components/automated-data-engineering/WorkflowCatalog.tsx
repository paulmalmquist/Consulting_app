"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getWorkflows, createWorkflow, DOMAIN_LABELS,
  type WorkflowDefinition, type WorkflowDomain, type WorkflowStep,
} from "@/lib/automated-data-engineering/workflows";
import { getSkillRegistry, type SkillSummary } from "@/lib/automated-data-engineering/api";
import {
  C, Panel, Tag, PageHeading, Loading, ErrorState, EmptyState, UnavailableState,
  Drawer, DrawerRow,
} from "./primitives";

// Workflow Registry catalog (plan PR 2). Definitions only — no execution engine.
// Cards grouped by domain; a detail drawer shows steps + I/O schema; the add form
// uses the live ADE skill registry for its step tool picker (name/description/permission).

const DOMAINS: WorkflowDomain[] = ["data_engineering", "telemetry", "investigation", "devops"];

const DOMAIN_COLOR: Record<WorkflowDomain, string> = {
  data_engineering: C.accent,
  telemetry: C.green,
  investigation: C.amber,
  devops: C.violet,
};

export default function WorkflowCatalog({ envId }: { envId: string }) {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[] | null>(null);
  const [nullReason, setNullReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<WorkflowDomain | "all">("all");
  const [selected, setSelected] = useState<WorkflowDefinition | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => {
    getWorkflows(envId)
      .then((r) => { setWorkflows(r.workflows); setNullReason(r.null_reason); })
      .catch((e) => setError(String(e)));
  };

  useEffect(load, [envId]);

  const grouped = useMemo(() => {
    const list = (workflows ?? []).filter(
      (w) => domainFilter === "all" || w.domain === domainFilter,
    );
    const by: Record<string, WorkflowDefinition[]> = {};
    for (const w of list) (by[w.domain] ??= []).push(w);
    return by;
  }, [workflows, domainFilter]);

  const heading = (
    <PageHeading eyebrow="Catalog" title="Workflow Registry"
      blurb="Named, reusable execution sequences the fabric knows about. Definitions only — this catalog records the shape of a workflow (its ordered steps and the governed skills each step calls). Execution is future work; today every workflow shows its steps, domain, and how many times it has been run." />
  );

  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!workflows) return <>{heading}<Loading label="Loading workflows…" /></>;

  return (
    <>
      {heading}

      {/* Filter + add */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <FilterChip active={domainFilter === "all"} label="All" onClick={() => setDomainFilter("all")} />
          {DOMAINS.map((d) => (
            <FilterChip key={d} active={domainFilter === d} label={DOMAIN_LABELS[d]} onClick={() => setDomainFilter(d)} />
          ))}
        </div>
        <button type="button" onClick={() => setShowAdd(true)}
          style={{ fontFamily: C.mono, fontSize: 12, color: C.bg, background: C.accent,
            border: "none", borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontWeight: 600 }}>
          + Add Workflow
        </button>
      </div>

      {nullReason ? (
        <UnavailableState nullReason={nullReason} />
      ) : workflows.length === 0 ? (
        <EmptyState label="No workflows yet"
          hint="The three canonical workflows seed automatically on first load. Use Add Workflow to define your own." />
      ) : (
        DOMAINS.filter((d) => grouped[d]?.length).map((d) => (
          <Panel key={d} title={DOMAIN_LABELS[d]} right={<Tag color={DOMAIN_COLOR[d]}>{grouped[d].length}</Tag>} style={{ marginBottom: 14 }}>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {grouped[d].map((w) => (
                <WorkflowCard key={w.id} wf={w} onOpen={() => setSelected(w)} />
              ))}
            </div>
          </Panel>
        ))
      )}

      {selected && <WorkflowDetailDrawer wf={selected} onClose={() => setSelected(null)} />}
      {showAdd && (
        <AddWorkflowDrawer envId={envId}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); setWorkflows(null); load(); }} />
      )}
    </>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.04em",
        color: active ? C.text : C.dim, background: active ? C.panelHi : "transparent",
        border: `1px solid ${active ? C.borderHi : C.border}`, borderRadius: 6,
        padding: "5px 11px", cursor: "pointer" }}>
      {label}
    </button>
  );
}

function WorkflowCard({ wf, onOpen }: { wf: WorkflowDefinition; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen}
      style={{ textAlign: "left", background: C.panelHi, border: `1px solid ${C.border}`,
        borderRadius: 9, padding: 14, cursor: "pointer", width: "100%" }}>
      <div style={{ fontFamily: C.sans, fontSize: 15, fontWeight: 600, color: C.text }}>{wf.name}</div>
      {wf.description && (
        <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>{wf.description}</div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, fontFamily: C.mono, fontSize: 11, color: C.faint }}>
        <span>{wf.steps.length} steps</span>
        <span>{wf.run_count} runs</span>
        <span>{wf.last_run_at ? `last ${new Date(wf.last_run_at).toLocaleDateString()}` : "never run"}</span>
      </div>
    </button>
  );
}

function WorkflowDetailDrawer({ wf, onClose }: { wf: WorkflowDefinition; onClose: () => void }) {
  return (
    <Drawer eyebrow={DOMAIN_LABELS[wf.domain]} title={wf.name} onClose={onClose}>
      {wf.description && (
        <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.55, marginBottom: 14 }}>{wf.description}</p>
      )}
      <DrawerRow label="Domain" value={DOMAIN_LABELS[wf.domain]} />
      <DrawerRow label="Slug" value={wf.slug} />
      <DrawerRow label="Owner" value={wf.owner} />
      <DrawerRow label="Run count" value={wf.run_count} />
      <DrawerRow label="Last run" value={wf.last_run_at ? new Date(wf.last_run_at).toLocaleString() : null} />

      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.faint, textTransform: "uppercase", margin: "16px 0 8px" }}>
        Steps
      </div>
      {wf.steps.map((s, i) => (
        <div key={`${s.step_name}-${i}`} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, minWidth: 18 }}>{i + 1}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: C.sans, fontSize: 13, color: C.text }}>{s.step_name}</div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 2 }}>
              {s.tool_name ? `skill: ${s.tool_name}` : "no skill bound"}
            </div>
          </div>
        </div>
      ))}
    </Drawer>
  );
}

// ── Add form ───────────────────────────────────────────────────────────────
function AddWorkflowDrawer({ envId, onClose, onCreated }: {
  envId: string; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState<WorkflowDomain>("data_engineering");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [skills, setSkills] = useState<SkillSummary[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    // Skill picker source: the live ADE skill registry (name/description/permission).
    getSkillRegistry().then((r) => setSkills(r.tools)).catch(() => setSkills([]));
  }, []);

  const addStep = () => setSteps((s) => [...s, { step_name: "", tool_name: null, inputs: [], outputs: [] }]);
  const updateStep = (i: number, patch: Partial<WorkflowStep>) =>
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!name.trim()) { setFormError("Name is required."); return; }
    setSubmitting(true);
    setFormError(null);
    createWorkflow(envId, {
      name: name.trim(), domain,
      description: description.trim() || undefined,
      steps: steps.filter((s) => s.step_name.trim()),
    })
      .then(onCreated)
      .catch((e) => { setFormError(String(e)); setSubmitting(false); });
  };

  return (
    <Drawer eyebrow="New" title="Add Workflow" onClose={onClose}>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Supplier Risk Sweep"
          style={inputStyle} />
      </Field>
      <Field label="Domain">
        <select value={domain} onChange={(e) => setDomain(e.target.value as WorkflowDomain)} style={inputStyle}>
          {DOMAINS.map((d) => <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>)}
        </select>
      </Field>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          placeholder="What this workflow does" style={{ ...inputStyle, resize: "vertical" }} />
      </Field>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 8px" }}>
        <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.faint, textTransform: "uppercase" }}>Steps</span>
        <button type="button" onClick={addStep}
          style={{ fontFamily: C.mono, fontSize: 11, color: C.accent, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>
          + Step
        </button>
      </div>

      {steps.length === 0 && (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, padding: "6px 0" }}>
          No steps yet. A workflow can be saved without steps and refined later.
        </div>
      )}

      {steps.map((s, i) => (
        <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: 10, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, minWidth: 16 }}>{i + 1}</span>
            <input value={s.step_name} onChange={(e) => updateStep(i, { step_name: e.target.value })}
              placeholder="step name" style={{ ...inputStyle, marginBottom: 0 }} />
            <button type="button" onClick={() => removeStep(i)} aria-label="Remove step"
              style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: C.mono, fontSize: 14 }}>×</button>
          </div>
          <select value={s.tool_name ?? ""} onChange={(e) => updateStep(i, { tool_name: e.target.value || null })}
            style={{ ...inputStyle, marginTop: 8, marginBottom: 0 }}>
            <option value="">— no skill —</option>
            {skills?.map((sk) => (
              <option key={sk.name} value={sk.name}>
                {sk.name} ({sk.permission})
              </option>
            ))}
          </select>
          {s.tool_name && skills && (
            <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.dim, marginTop: 5, lineHeight: 1.45 }}>
              {skills.find((sk) => sk.name === s.tool_name)?.description ?? ""}
            </div>
          )}
        </div>
      ))}

      {formError && (
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.red, marginTop: 12 }}>{formError}</div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button type="button" onClick={submit} disabled={submitting}
          style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: C.bg, background: C.accent,
            border: "none", borderRadius: 6, padding: "8px 16px", cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Saving…" : "Save Workflow"}
        </button>
        <button type="button" onClick={onClose}
          style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", fontFamily: C.sans, fontSize: 13, color: C.text,
  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
  padding: "7px 10px", marginBottom: 0, outline: "none",
};
