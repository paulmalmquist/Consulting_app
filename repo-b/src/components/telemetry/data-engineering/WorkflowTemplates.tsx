"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getSkillRegistry,
  type SkillRegistryResponse,
} from "@/lib/automated-data-engineering/api";
import {
  EXECUTABILITY_LABEL,
  templateExecutability,
  WORKFLOW_TEMPLATES,
  type Executability,
  type WorkflowTemplate,
} from "@/lib/telemetry/workflowTemplates";
import {
  C,
  InlineCode,
  Loading,
  PageHeading,
  Panel,
  StatusDot,
  Tag,
  TelemetryStatusBanner,
} from "../primitives";

// Workflow Registry (Phase 2C) — useful read-only workflow TEMPLATES instead of a barren "Not
// available." Each card shows purpose, required inputs, ordered steps (with the governed skill backing
// each, or "declared"), required tests, and an honest executability state derived from the live
// registry. Nothing runs: no fake workflow runs, no fake receipts, no fake backend execution.

function execColor(state: Executability): string {
  if (state === "executable") return C.green;
  if (state === "read_only_template") return C.cyan;
  if (state === "blocked") return C.amber;
  return C.faint; // unavailable
}

function TemplateCard({ template, registry }: { template: WorkflowTemplate; registry: SkillRegistryResponse | null }) {
  const exec = useMemo(() => templateExecutability(template, registry), [template, registry]);
  return (
    <Panel
      title={template.name}
      right={<Tag color={execColor(exec.state)}>{EXECUTABILITY_LABEL[exec.state]}</Tag>}
      style={{ marginBottom: 12 }}
    >
      <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.55 }}>{template.purpose}</p>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.12em", color: C.faint, textTransform: "uppercase", marginBottom: 7 }}>Required inputs</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {template.requiredInputs.map((inp) => <Tag key={inp} color={C.faint}>{inp}</Tag>)}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.12em", color: C.faint, textTransform: "uppercase", marginBottom: 7 }}>Steps</div>
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {template.steps.map((step, i) => {
            const backing = exec.stepBacking[i];
            const skillBearing = Boolean(step.capabilityKey);
            return (
              <li key={step.name} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 2, minWidth: 16 }}>{i + 1}.</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{step.name}</span>
                    {!skillBearing ? (
                      <Tag color={C.faint}>manual / catalog</Tag>
                    ) : backing ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <StatusDot color={C.green} size={6} />
                        <InlineCode color={C.dim}>{backing}</InlineCode>
                      </span>
                    ) : (
                      <Tag color={C.amber}>declared — no skill</Tag>
                    )}
                  </div>
                  <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 3, lineHeight: 1.45 }}>{step.detail}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.12em", color: C.faint, textTransform: "uppercase", marginBottom: 7 }}>Required tests / evals</div>
        <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
          {template.tests.map((t) => <li key={t} style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.45 }}>{t}</li>)}
        </ul>
      </div>

      {exec.reason && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 11, color: exec.state === "blocked" ? C.amber : C.faint, lineHeight: 1.5 }}>
          {exec.state === "blocked" ? "Blocked: " : exec.state === "unavailable" ? "Unavailable: " : ""}{exec.reason}
        </div>
      )}
    </Panel>
  );
}

export default function WorkflowTemplates({ envId }: { envId: string }) {
  // Templates + registry backing are environment-agnostic; envId kept for route symmetry.
  void envId;
  const [registry, setRegistry] = useState<SkillRegistryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    getSkillRegistry()
      .then((r) => { if (!live) return; setRegistry(r ?? null); setLoaded(true); })
      .catch((e) => { if (live) { setError(e instanceof Error ? e.message : String(e)); setLoaded(true); } });
    return () => { live = false; };
  }, []);

  const heading = (
    <PageHeading
      eyebrow="Catalog · Workflow Registry"
      title="Workflow Registry"
      blurb="Named, reusable data-engineering workflows — the ordered steps each one takes, the governed skill behind every step, and the tests it must pass. These are documented, read-only templates: none execute, so nothing here fabricates a run or a receipt. Each card's executability reflects whether its steps are backed by a registered skill today."
    />
  );

  // Registry failing is non-fatal: templates still render, executability shows "unavailable".
  if (!loaded) return <>{heading}<Loading label="Checking skill backing…" /></>;

  return (
    <>
      {heading}
      {error && (
        <TelemetryStatusBanner tone="warn">
          Skill registry unavailable — {error}. Templates render, but executability is shown as unavailable
          rather than guessed.
        </TelemetryStatusBanner>
      )}
      <TelemetryStatusBanner tone="info">
        Read-only templates. No workflow executes from this surface — executability reflects governed-skill
        backing only, and no template reads as &ldquo;executable&rdquo; because no run path is wired.
      </TelemetryStatusBanner>
      <div style={{ marginTop: 16 }}>
        {WORKFLOW_TEMPLATES.map((t) => (
          <TemplateCard key={t.key} template={t} registry={error ? null : registry} />
        ))}
      </div>
    </>
  );
}
