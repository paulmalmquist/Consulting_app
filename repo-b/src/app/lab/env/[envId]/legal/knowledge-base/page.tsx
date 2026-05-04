"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  type LegalApprovalRule,
  type LegalApprover,
  type LegalClause,
  type LegalPlaybook,
  type LegalPolicySource,
  type LegalPriorDecision,
  listLegalApprovalRules,
  listLegalApprovers,
  listLegalClauses,
  listLegalPlaybooks,
  listLegalPolicySources,
  listLegalPriorDecisions,
  seedLegalKb,
} from "@/lib/bos-api";

type TabKey = "playbooks" | "clauses" | "rules" | "memory" | "policies" | "approvers";

const TABS: { key: TabKey; label: string }[] = [
  { key: "playbooks", label: "Playbooks" },
  { key: "clauses", label: "Clauses" },
  { key: "rules", label: "Approval Rules" },
  { key: "memory", label: "Legal Memory" },
  { key: "policies", label: "Policies" },
  { key: "approvers", label: "Approvers" },
];

type State = {
  loading: boolean;
  error: string | null;
  playbooks: LegalPlaybook[];
  clauses: LegalClause[];
  rules: LegalApprovalRule[];
  memory: LegalPriorDecision[];
  policies: LegalPolicySource[];
  approvers: LegalApprover[];
};

const EMPTY_STATE: State = {
  loading: true,
  error: null,
  playbooks: [],
  clauses: [],
  rules: [],
  memory: [],
  policies: [],
  approvers: [],
};

function AdapterChip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-bm-border/70 bg-bm-surface/30 px-2.5 py-0.5 text-[11px] text-bm-muted2 hover:bg-bm-surface/50"
        aria-expanded={open}
      >
        <span className="font-semibold text-bm-text">Adapter:</span>
        KnowledgeBase / DocumentSource — default: Winston tables
        <span className="text-bm-muted2">▾</span>
      </button>
      {open ? (
        <div className="rounded-md border border-bm-border/60 bg-bm-surface/30 p-3 text-[11px] leading-relaxed text-bm-muted2 max-w-2xl">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="mb-0.5 font-semibold text-bm-text">Demo implementation</div>
              <p>Reads <code>legal_playbooks</code>, <code>legal_clause_library</code>, <code>legal_approval_rules</code>, <code>legal_prior_decisions</code>, <code>legal_policy_sources</code>, <code>legal_approver_registry</code>.</p>
            </div>
            <div>
              <div className="mb-0.5 font-semibold text-bm-text">Client implementation</div>
              <p>Replace with reads from your existing systems — SharePoint / Confluence / iManage / NetDocuments for documents, native CLM for playbooks, Okta / AD / Workday for approvers.</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Empty({ label, onSeed, seeding }: { label: string; onSeed?: () => void; seeding?: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-bm-border/60 bg-bm-surface/20 p-6 text-sm text-bm-muted2">
      <p>No {label} loaded yet.</p>
      <p className="mt-1 text-[12px] text-bm-muted2/80">
        This is a reference implementation. The library would normally be loaded from your client&rsquo;s knowledge sources via the adapter; for the demo, seed sample content.
      </p>
      {onSeed ? (
        <button
          type="button"
          onClick={onSeed}
          disabled={seeding}
          className="mt-3 rounded-md border border-bm-accent/60 bg-bm-accent/10 px-3 py-1.5 text-xs font-semibold text-bm-accent disabled:opacity-50"
        >
          {seeding ? "Seeding…" : "Seed demo content"}
        </button>
      ) : null}
    </div>
  );
}

function PlaybooksTable({ rows }: { rows: LegalPlaybook[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-bm-border/60">
      <table className="min-w-full text-xs">
        <thead className="bg-bm-surface/40 text-[11px] uppercase tracking-[0.08em] text-bm-muted2">
          <tr>
            <th className="px-3 py-2 text-left">Name</th>
            <th className="px-3 py-2 text-left">Contract Type</th>
            <th className="px-3 py-2 text-left">Jurisdiction</th>
            <th className="px-3 py-2 text-left">Owner</th>
            <th className="px-3 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bm-border/40">
          {rows.map((r) => (
            <tr key={r.playbook_id} className="hover:bg-bm-surface/20">
              <td className="px-3 py-2 font-medium">{r.name}</td>
              <td className="px-3 py-2">{r.contract_type}</td>
              <td className="px-3 py-2">{r.jurisdiction ?? "—"}</td>
              <td className="px-3 py-2">{r.owner ?? "—"}</td>
              <td className="px-3 py-2"><span className="rounded-full bg-bm-surface/40 px-2 py-0.5 text-[10px]">{r.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClausesTable({ rows }: { rows: LegalClause[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-bm-border/60">
      <table className="min-w-full text-xs">
        <thead className="bg-bm-surface/40 text-[11px] uppercase tracking-[0.08em] text-bm-muted2">
          <tr>
            <th className="px-3 py-2 text-left">Clause</th>
            <th className="px-3 py-2 text-left">Key</th>
            <th className="px-3 py-2 text-left">Canonical Text</th>
            <th className="px-3 py-2 text-left">Jurisdiction</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bm-border/40">
          {rows.map((r) => (
            <tr key={r.clause_id} className="hover:bg-bm-surface/20">
              <td className="px-3 py-2 font-medium">{r.clause_label}</td>
              <td className="px-3 py-2"><code className="text-[11px] text-bm-muted2">{r.clause_key}</code></td>
              <td className="px-3 py-2 text-bm-muted2 max-w-xl truncate">{r.canonical_text ?? "—"}</td>
              <td className="px-3 py-2">{r.jurisdiction ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RulesTable({ rows }: { rows: LegalApprovalRule[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-bm-border/60">
      <table className="min-w-full text-xs">
        <thead className="bg-bm-surface/40 text-[11px] uppercase tracking-[0.08em] text-bm-muted2">
          <tr>
            <th className="px-3 py-2 text-left">Rule</th>
            <th className="px-3 py-2 text-left">Contract Type</th>
            <th className="px-3 py-2 text-left">Trigger</th>
            <th className="px-3 py-2 text-left">Required Approver</th>
            <th className="px-3 py-2 text-left">Escalation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bm-border/40">
          {rows.map((r) => (
            <tr key={r.rule_id} className="hover:bg-bm-surface/20">
              <td className="px-3 py-2 font-medium">{r.rule_name}</td>
              <td className="px-3 py-2">{r.contract_type ?? "—"}</td>
              <td className="px-3 py-2 text-bm-muted2"><code className="text-[10px]">{JSON.stringify(r.trigger_json)}</code></td>
              <td className="px-3 py-2">{r.required_approver}</td>
              <td className="px-3 py-2">{r.escalation_level}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemoryTable({ rows }: { rows: LegalPriorDecision[] }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-bm-muted2">
        Legal Memory is the defensible asset — accumulated dispositions, accepted/rejected positions, and attorney rationale. Reference implementation; in a real deployment this grows from every Attorney Workbench action.
      </p>
      <div className="overflow-x-auto rounded-lg border border-bm-border/60">
        <table className="min-w-full text-xs">
          <thead className="bg-bm-surface/40 text-[11px] uppercase tracking-[0.08em] text-bm-muted2">
            <tr>
              <th className="px-3 py-2 text-left">Contract Type</th>
              <th className="px-3 py-2 text-left">Clause</th>
              <th className="px-3 py-2 text-left">Accepted</th>
              <th className="px-3 py-2 text-left">Rejected</th>
              <th className="px-3 py-2 text-left">Decided By</th>
              <th className="px-3 py-2 text-left">Rationale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {rows.map((r) => (
              <tr key={r.decision_id} className="hover:bg-bm-surface/20">
                <td className="px-3 py-2">{r.contract_type ?? "—"}</td>
                <td className="px-3 py-2"><code className="text-[11px] text-bm-muted2">{r.clause_key ?? "—"}</code></td>
                <td className="px-3 py-2 max-w-sm truncate">{r.accepted_text ?? "—"}</td>
                <td className="px-3 py-2 max-w-sm truncate text-bm-muted2">{r.rejected_text ?? "—"}</td>
                <td className="px-3 py-2">{r.decided_by ?? "—"}</td>
                <td className="px-3 py-2 max-w-md truncate text-bm-muted2">{r.rationale ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PoliciesTable({ rows }: { rows: LegalPolicySource[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-bm-border/60">
      <table className="min-w-full text-xs">
        <thead className="bg-bm-surface/40 text-[11px] uppercase tracking-[0.08em] text-bm-muted2">
          <tr>
            <th className="px-3 py-2 text-left">Title</th>
            <th className="px-3 py-2 text-left">Source</th>
            <th className="px-3 py-2 text-left">Effective From</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bm-border/40">
          {rows.map((r) => (
            <tr key={r.policy_id} className="hover:bg-bm-surface/20">
              <td className="px-3 py-2 font-medium">{r.title}</td>
              <td className="px-3 py-2">{r.source_url ? <a className="text-bm-accent underline" href={r.source_url} target="_blank" rel="noreferrer">{r.source_url}</a> : "—"}</td>
              <td className="px-3 py-2">{r.effective_from ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApproversTable({ rows }: { rows: LegalApprover[] }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-bm-muted2">
        Default backing for the <code>ApproverRegistryAdapter</code>. A client deployment swaps this for Okta / Active Directory / Workday / native authz.
      </p>
      <div className="overflow-x-auto rounded-lg border border-bm-border/60">
        <table className="min-w-full text-xs">
          <thead className="bg-bm-surface/40 text-[11px] uppercase tracking-[0.08em] text-bm-muted2">
            <tr>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Person</th>
              <th className="px-3 py-2 text-left">Contact</th>
              <th className="px-3 py-2 text-left">Scope</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {rows.map((r) => (
              <tr key={r.approver_id} className="hover:bg-bm-surface/20">
                <td className="px-3 py-2 font-medium">{r.role_label}</td>
                <td className="px-3 py-2">{r.person_name ?? "—"}</td>
                <td className="px-3 py-2">{r.contact ?? "—"}</td>
                <td className="px-3 py-2 text-bm-muted2"><code className="text-[10px]">{JSON.stringify(r.scope_json)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LegalKnowledgeBasePage() {
  const { envId, businessId } = useDomainEnv();
  const businessIdParam = businessId ?? undefined;

  const [tab, setTab] = useState<TabKey>("playbooks");
  const [state, setState] = useState<State>(EMPTY_STATE);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    if (!envId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [playbooks, clauses, rules, memory, policies, approvers] = await Promise.all([
        listLegalPlaybooks(envId, businessIdParam),
        listLegalClauses(envId, businessIdParam),
        listLegalApprovalRules(envId, businessIdParam),
        listLegalPriorDecisions(envId, businessIdParam),
        listLegalPolicySources(envId, businessIdParam),
        listLegalApprovers(envId, businessIdParam),
      ]);
      setState({
        loading: false,
        error: null,
        playbooks: Array.isArray(playbooks) ? playbooks : [],
        clauses: Array.isArray(clauses) ? clauses : [],
        rules: Array.isArray(rules) ? rules : [],
        memory: Array.isArray(memory) ? memory : [],
        policies: Array.isArray(policies) ? policies : [],
        approvers: Array.isArray(approvers) ? approvers : [],
      });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, [envId, businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSeed = useCallback(async () => {
    if (!envId) return;
    setSeeding(true);
    try {
      await seedLegalKb(envId, businessIdParam);
      await load();
    } catch (err) {
      setState((s) => ({ ...s, error: (err as Error).message }));
    } finally {
      setSeeding(false);
    }
  }, [envId, businessId, load]);

  const counts = useMemo(
    () => ({
      playbooks: state.playbooks.length,
      clauses: state.clauses.length,
      rules: state.rules.length,
      memory: state.memory.length,
      policies: state.policies.length,
      approvers: state.approvers.length,
    }),
    [state],
  );

  const allEmpty =
    !state.loading &&
    counts.playbooks + counts.clauses + counts.rules + counts.memory + counts.policies + counts.approvers === 0;

  return (
    <section className="space-y-4" data-testid="legal-knowledge-base">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Knowledge Base &amp; Legal Memory</p>
          <h2 className="text-2xl font-semibold">Your legal operating layer&rsquo;s reference content</h2>
          <p className="mt-1 max-w-3xl text-sm text-bm-muted2">
            Playbooks, clauses, approval rules, prior decisions, policy sources, and the approver registry.
            Reference implementation for what your knowledge base needs to expose so the rest of the operating
            layer can do first-pass review and prepare decision packets.
          </p>
        </div>
        <AdapterChip />
      </div>

      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-2 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                t.key === tab
                  ? "border-bm-accent/60 bg-bm-accent/10 text-bm-text"
                  : "border-bm-border/70 hover:bg-bm-surface/40 text-bm-muted2"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-[10px] text-bm-muted2">
                {state.loading ? "…" : counts[t.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {state.error ? (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-300">
          Failed to load knowledge base: {state.error}
        </div>
      ) : null}

      {allEmpty ? (
        <Empty label="knowledge base content" onSeed={handleSeed} seeding={seeding} />
      ) : state.loading ? (
        <div className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-6 text-sm text-bm-muted2">Loading…</div>
      ) : (
        <>
          {tab === "playbooks" && (counts.playbooks ? <PlaybooksTable rows={state.playbooks} /> : <Empty label="playbooks" onSeed={handleSeed} seeding={seeding} />)}
          {tab === "clauses" && (counts.clauses ? <ClausesTable rows={state.clauses} /> : <Empty label="clause library entries" onSeed={handleSeed} seeding={seeding} />)}
          {tab === "rules" && (counts.rules ? <RulesTable rows={state.rules} /> : <Empty label="approval rules" onSeed={handleSeed} seeding={seeding} />)}
          {tab === "memory" && (counts.memory ? <MemoryTable rows={state.memory} /> : <Empty label="prior decisions in Legal Memory" onSeed={handleSeed} seeding={seeding} />)}
          {tab === "policies" && (counts.policies ? <PoliciesTable rows={state.policies} /> : <Empty label="policy sources" onSeed={handleSeed} seeding={seeding} />)}
          {tab === "approvers" && (counts.approvers ? <ApproversTable rows={state.approvers} /> : <Empty label="approvers" onSeed={handleSeed} seeding={seeding} />)}
        </>
      )}
    </section>
  );
}
