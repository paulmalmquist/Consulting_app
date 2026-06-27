"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { C, DisclosureFooter, InlineCode } from "../primitives";
import { TelemetryPageHeader } from "../TelemetryPageHeader";
import { telemetryAccentForPath } from "../telemetryNav";
import {
  RefTOC, RefSection, RefProse, RefTable, EvidenceCell, StatusPill, CommandBlock, Callout,
  type RefCol,
} from "./refPrimitives";
import {
  SECTIONS, KINDS, PAGE_INVENTORY, HIDDEN_ROUTES, CROSS_LINKS, PLANNED_SURFACES,
  SKILL_FAMILIES, RUNTIME_LAYERS, ENDPOINT_FAMILIES, PLANNED_ENDPOINTS,
  MCP_TOOLS, MCP_TOOLS_SOURCE, MCP_MUST_NOT, CLI_BLOCKS, RELEASE_FLOW, CI_GATES,
  EVIDENCE_CHECKLIST, BOUNDARIES, WHY_IT_MATTERS,
} from "./manifest";

// "AI Build & Operations Reference" — a document-style technical reference (engineering-runbook feel,
// not a dashboard) explaining how the telemetry demo was built and how it is operated: which parts are
// deterministic software vs ML vs LLM/agentic, which were produced by AI-assisted engineering, which
// REST APIs / MCP tools / CLI / CI-CD workflows operate it, and what is real vs fixture vs synthetic
// vs cold. Honest by construction: nothing here executes; every claim renders from a hand-maintained
// static manifest whose rows cite the file/route they describe (see ./manifest.ts).

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ display: "grid", gap: 8, margin: "0 0 4px", paddingLeft: 18, maxWidth: 880 }}>
      {items.map((t, i) => (
        <li key={i} style={{ fontFamily: C.sans, fontSize: 14, color: C.dim, lineHeight: 1.6 }}>{t}</li>
      ))}
    </ul>
  );
}

function pageCell(route: string, page: string, status: Parameters<typeof StatusPill>[0]["status"]): ReactNode {
  return (
    <span style={{ display: "grid", gap: 6 }}>
      <span style={{ fontFamily: C.sans, fontWeight: 600, color: C.text }}>{page}</span>
      <InlineCode color={C.faint}>{route}</InlineCode>
      <span><StatusPill status={status} /></span>
    </span>
  );
}

export default function AiBuildOpsReference({ envId }: { envId: string }) {
  void envId; // reserved for future env-scoped deep links; the reference itself is static.
  const accent = telemetryAccentForPath(usePathname() ?? "");

  const inventoryCols: RefCol[] = [
    { key: "page", header: "Demo page", minWidth: 180 },
    { key: "sees", header: "What the user sees", minWidth: 200 },
    { key: "ai", header: "AI / ML connection", minWidth: 200 },
    { key: "api", header: "API / data source", minWidth: 180 },
    { key: "tooling", header: "Tooling / DevOps", minWidth: 180 },
    { key: "evidence", header: "Evidence / audit", minWidth: 180 },
    { key: "boundary", header: "Honest boundary", minWidth: 220 },
  ];
  const inventoryRows = PAGE_INVENTORY.map((r) => ({
    page: pageCell(r.route, r.page, r.status),
    sees: r.sees,
    ai: r.aiConnection,
    api: <InlineCode color={C.dim}>{r.dataSource}</InlineCode>,
    tooling: r.tooling,
    evidence: r.evidence,
    boundary: (
      <span style={{ display: "grid", gap: 6 }}>
        <span>{r.boundary}</span>
        <EvidenceCell refs={r.sourceRefs} />
      </span>
    ),
  }));

  const skillCols: RefCol[] = [
    { key: "family", header: "Skill family", minWidth: 170 },
    { key: "usedFor", header: "Used for", minWidth: 260 },
    { key: "example", header: "Example in telemetry demo", minWidth: 260 },
    { key: "evidence", header: "Evidence to inspect", minWidth: 180 },
  ];
  const skillRows = SKILL_FAMILIES.map((s) => ({
    family: s.family, usedFor: s.usedFor, example: s.example, evidence: <EvidenceCell refs={s.sourceRefs} />,
  }));

  const runtimeCols: RefCol[] = [
    { key: "layer", header: "Runtime layer", minWidth: 160 },
    { key: "purpose", header: "Purpose", minWidth: 220 },
    { key: "examples", header: "Examples", minWidth: 200 },
    { key: "failure", header: "Failure mode", minWidth: 200 },
    { key: "evidence", header: "User-visible evidence", minWidth: 200 },
  ];
  const runtimeRows = RUNTIME_LAYERS.map((r) => ({
    layer: r.layer, purpose: r.purpose, examples: r.examples, failure: r.failureMode,
    evidence: (
      <span style={{ display: "grid", gap: 6 }}>
        <span>{r.evidence}</span>
        <EvidenceCell refs={r.sourceRefs} />
      </span>
    ),
  }));

  const endpointCols: RefCol[] = [
    { key: "ep", header: "Endpoint", minWidth: 280 },
    { key: "usedBy", header: "Used by", minWidth: 140 },
    { key: "purpose", header: "Purpose", minWidth: 220 },
    { key: "auth", header: "Auth", minWidth: 110 },
    { key: "evidence", header: "Source", minWidth: 150 },
  ];

  const mcpCols: RefCol[] = [
    { key: "name", header: "Tool", minWidth: 250 },
    { key: "capability", header: "What it can do", minWidth: 240 },
    { key: "useCase", header: "Telemetry use case", minWidth: 180 },
    { key: "risk", header: "Risk", minWidth: 90 },
    { key: "permission", header: "Permission", minWidth: 150 },
    { key: "audit", header: "Audit", minWidth: 150 },
  ];
  const mcpRows = MCP_TOOLS.map((t) => ({
    name: <InlineCode color={C.text}>{t.name}</InlineCode>,
    capability: t.capability, useCase: t.useCase, risk: t.risk, permission: t.permission, audit: t.audit,
  }));

  const ciCols: RefCol[] = [
    { key: "gate", header: "Gate", minWidth: 170 },
    { key: "catches", header: "What it catches", minWidth: 240 },
    { key: "evidence", header: "Command / evidence", minWidth: 220 },
    { key: "blocks", header: "Blocks release?", minWidth: 110 },
  ];
  const ciRows = CI_GATES.map((g) => ({
    gate: <InlineCode color={C.text}>{g.gate}</InlineCode>,
    catches: g.catches,
    evidence: (
      <span style={{ display: "grid", gap: 6 }}>
        <span>{g.evidence}</span>
        <EvidenceCell refs={g.sourceRefs} />
      </span>
    ),
    blocks: g.blocks ? <span style={{ color: C.red }}>Yes</span> : <span style={{ color: C.dim }}>No</span>,
  }));

  const boundaryCols: RefCol[] = [
    { key: "area", header: "Claim area", minWidth: 160 },
    { key: "real", header: "Real today", minWidth: 220 },
    { key: "sim", header: "Simulated / fixture-backed", minWidth: 200 },
    { key: "planned", header: "Planned", minWidth: 160 },
    { key: "ui", header: "How the UI says it", minWidth: 240 },
  ];
  const boundaryRows = BOUNDARIES.map((b) => ({
    area: b.area, real: b.realToday, sim: b.simulated, planned: b.planned,
    ui: (
      <span style={{ display: "grid", gap: 6 }}>
        <span>{b.uiSays}</span>
        <EvidenceCell refs={b.sourceRefs} />
      </span>
    ),
  }));

  return (
    <div>
      <TelemetryPageHeader
        variant="evidence"
        eyebrow="Build & Operations"
        title="AI Build & Operations Reference"
        description="How the telemetry demo was created, operated, tested, and explained through AI-assisted engineering, REST APIs, MCP tools, CLI workflows, model evidence, and deployment gates. This is a written reference of verified structure — nothing here executes, and every row cites the file or route it describes."
      />

      <RefProse>
        The telemetry demo has four different kinds of &ldquo;AI&rdquo; and automation, and they are
        easy to conflate. This page separates them, then maps each demo surface to the real APIs, tools,
        and workflows behind it. The goal is to reduce ambiguity: you should leave knowing exactly which
        parts are deterministic software, which are ML models, which are LLM/RAG/agentic features, and
        which were produced by AI-assisted coding — and where to click to verify each claim.
      </RefProse>

      <RefTOC sections={SECTIONS} accent={accent} />

      {/* 1 — What this page documents */}
      <RefSection {...SECTIONS[0]} accent={accent}>
        <div style={{ display: "grid", gap: 14, maxWidth: 880 }}>
          {KINDS.map((k) => (
            <div key={k.key}>
              <div style={{ fontFamily: C.sans, fontSize: 14.5, fontWeight: 700, color: C.text, marginBottom: 4 }}>{k.title}</div>
              <div style={{ fontFamily: C.sans, fontSize: 14, color: C.dim, lineHeight: 1.6 }}>{k.body}</div>
            </div>
          ))}
        </div>
      </RefSection>

      {/* 2 — Page-by-page inventory */}
      <RefSection {...SECTIONS[1]} accent={accent}>
        <RefProse>
          One row per real telemetry surface. The status pill marks whether a page reads live serving
          rows (<StatusPill status="real" />), a committed fixture (<StatusPill status="fixture" />),
          clearly-labeled synthetic data (<StatusPill status="synthetic" />), or infrastructure that is
          off/cold by default (<StatusPill status="cold" />).
        </RefProse>
        <RefTable columns={inventoryCols} rows={inventoryRows} minWidth={1280} />
        <RefProse style={{ marginTop: 16 }}>
          <strong style={{ color: C.dim }}>Hidden but resolving.</strong> A few document/console routes
          are intentionally dropped from the rail (declutter) yet still resolve as deep links:
        </RefProse>
        <Bullets items={HIDDEN_ROUTES.map((h) => `${h.label} — ${h.route} — ${h.note}`)} />
        <RefProse style={{ marginTop: 12 }}>
          <strong style={{ color: C.dim }}>Cross-links.</strong>{" "}
          {CROSS_LINKS.map((c) => `${c.label} (${c.route}) — ${c.note}`).join(" ")}
        </RefProse>
        <RefProse style={{ marginTop: 12 }}>
          <strong style={{ color: C.amber }}>Planned / not present yet.</strong> Listed honestly so the
          inventory above never overclaims:
        </RefProse>
        <Bullets items={PLANNED_SURFACES.map((p) => `${p.label} — ${p.note}`)} />
      </RefSection>

      {/* 3 — AI skills used to build the demo */}
      <RefSection {...SECTIONS[2]} accent={accent}>
        <RefProse>
          This is the AI-assisted <em>engineering</em> system, not a runtime LLM feature. Each family is
          a governed workflow — planning, code, tests, deploy, safety — that runs through the same PR and
          CI gates as any other change. Language is grounded: a row is &ldquo;represented by&rdquo; the
          evidence it cites, not a claim that an agent autonomously did the work unattended.
        </RefProse>
        <RefTable columns={skillCols} rows={skillRows} minWidth={960} />
      </RefSection>

      {/* 4 — Runtime AI connections */}
      <RefSection {...SECTIONS[3]} accent={accent}>
        <RefProse>
          The runtime architecture, layer by layer. Note the distinction the table keeps: LLM answer
          generation (copilot, gateway), deterministic API responses (serving), traditional ML scoring
          (/score), and static fixture/historical evidence are separate rows with separate failure modes.
        </RefProse>
        <RefTable columns={runtimeCols} rows={runtimeRows} minWidth={1080} />
      </RefSection>

      {/* 5 — REST API & endpoint map */}
      <RefSection {...SECTIONS[4]} accent={accent}>
        <RefProse>
          Real endpoint families that power the pages above. The frontend reaches them through a
          catch-all proxy (<InlineCode color={C.dim}>repo-b/src/app/api/telemetry/[...path]/route.ts</InlineCode>)
          and a typed client (<InlineCode color={C.dim}>repo-b/src/lib/telemetry/api.ts</InlineCode>).
          Planned endpoints are kept in a separate table below — never blended with the real ones.
        </RefProse>
        <div style={{ display: "grid", gap: 18 }}>
          {ENDPOINT_FAMILIES.map((fam) => (
            <div key={fam.family}>
              <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.dim, marginBottom: 8 }}>{fam.family}</div>
              <RefTable
                columns={endpointCols}
                minWidth={900}
                rows={fam.rows.map((e) => ({
                  ep: <InlineCode color={C.text}>{`${e.method} ${e.path}`}</InlineCode>,
                  usedBy: e.usedBy, purpose: e.purpose,
                  auth: <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>{e.auth}</span>,
                  evidence: <EvidenceCell refs={e.sourceRefs} />,
                }))}
              />
            </div>
          ))}
        </div>
        <RefProse style={{ marginTop: 16 }}>
          <strong style={{ color: C.amber }}>Not yet implemented / planned.</strong>
        </RefProse>
        <Bullets items={PLANNED_ENDPOINTS.map((e) => `${e.path} — ${e.note}`)} />
      </RefSection>

      {/* 6 — MCP & tool-use map */}
      <RefSection {...SECTIONS[5]} accent={accent}>
        <RefProse>
          MCP is the typed, permissioned tool layer that lets the assistant do operational work without
          free-form, uncontrolled access. In the telemetry environment it is deliberately small and
          read-only: four tools, each scope-enforced and audited. Out-of-scope calls are denied with
          <InlineCode color={C.dim}>tool_not_in_telemetry_scope</InlineCode>.
        </RefProse>
        <RefTable columns={mcpCols} rows={mcpRows} minWidth={1080} />
        <RefProse style={{ marginTop: 12 }}>
          Source: <EvidenceCell refs={[MCP_TOOLS_SOURCE]} />. Live registry + scope demo:{" "}
          <InlineCode color={C.dim}>GET /api/telemetry/mcp/tools</InlineCode>,{" "}
          <InlineCode color={C.dim}>POST /api/telemetry/mcp/check</InlineCode>.
        </RefProse>
        <Callout tone="warn">
          What MCP must not do here: {MCP_MUST_NOT.join(" ")}
        </Callout>
      </RefSection>

      {/* 7 — CLI / DevOps operations */}
      <RefSection {...SECTIONS[6]} accent={accent}>
        <RefProse>
          Real commands used to develop, test, and operate the system. No secrets, tokens, or invite
          codes appear here. Anything illustrative rather than present is labeled in its note.
        </RefProse>
        <div style={{ display: "grid", gap: 18, maxWidth: 880 }}>
          {CLI_BLOCKS.map((b) => (
            <div key={b.title}>
              <div style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>{b.title}</div>
              <CommandBlock commands={b.commands} />
              {b.note && <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.faint, marginTop: 6 }}>{b.note}</div>}
              <div style={{ marginTop: 6 }}><EvidenceCell refs={b.sourceRefs} /></div>
            </div>
          ))}
        </div>
      </RefSection>

      {/* 8 — CI/CD & release gates */}
      <RefSection {...SECTIONS[7]} accent={accent}>
        <RefProse>The promotion path from code to production:</RefProse>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 4px", alignItems: "center", maxWidth: 880, marginBottom: 16 }}>
          {RELEASE_FLOW.map((step, i) => (
            <span key={step} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontFamily: C.mono, fontSize: 11.5, color: C.dim, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px" }}>{step}</span>
              {i < RELEASE_FLOW.length - 1 && <span aria-hidden style={{ color: accent }}>→</span>}
            </span>
          ))}
        </div>
        <RefTable columns={ciCols} rows={ciRows} minWidth={840} />
      </RefSection>

      {/* 9 — Evidence, audit & receipts */}
      <RefSection {...SECTIONS[8]} accent={accent}>
        <RefProse>
          The demo should not say &ldquo;trust us.&rdquo; It should let an interviewer click through the
          proof: model cards, eval metrics, replay evidence, lineage drawers, audit rows, signed
          receipts, CI logs, deploy health, and the designed null states when data is missing. The
          checklist below is the test — every item should be answerable by clicking.
        </RefProse>
        <Bullets items={EVIDENCE_CHECKLIST} />
      </RefSection>

      {/* 10 — Honest boundaries */}
      <RefSection {...SECTIONS[9]} accent={accent}>
        <RefProse>
          What is real, what is simulated or fixture-backed, and what is planned. Cold infrastructure,
          disabled providers, and fixtures are surfaced here on purpose — this section exists to increase
          trust, not to market.
        </RefProse>
        <RefTable columns={boundaryCols} rows={boundaryRows} minWidth={1080} />
      </RefSection>

      {/* 11 — Why this matters */}
      <RefSection {...SECTIONS[10]} accent={accent}>
        <Bullets items={WHY_IT_MATTERS} />
      </RefSection>

      <div style={{ marginTop: 24 }}>
        <DisclosureFooter />
      </div>
    </div>
  );
}
