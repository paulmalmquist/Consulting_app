"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  listDocCompletionFiles,
  getDocCompletionStats,
  createDocCompletionApplication,
  DcLoanFileListItem,
  DcDashboardStats,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";

type Tab = "overview" | "escalations";

const STATUS_COLORS: Record<string, string> = {
  complete: "bg-green-500/20 text-green-400",
  escalated: "bg-red-500/20 text-red-400",
  waiting_on_borrower: "bg-yellow-500/20 text-yellow-400",
  partial_docs_received: "bg-blue-500/20 text-blue-400",
  closed_manually: "bg-gray-500/20 text-gray-400",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] || "bg-gray-500/20 text-gray-400";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DocCompletionHubPage() {
  const { envId, businessId } = useDomainEnv();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<DcDashboardStats | null>(null);
  const [files, setFiles] = useState<DcLoanFileListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  // intake form state
  const [appId, setAppId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [loanType, setLoanType] = useState("mortgage");
  const [requiredDocs, setRequiredDocs] = useState("government_id,pay_stub,bank_statement");

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${envId}/credit/doc-completion`,
      surface: "credit",
      active_module: "doc_completion",
    });
    return () => resetAssistantPageContext();
  }, [envId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, f] = await Promise.all([
        getDocCompletionStats(envId, businessId || undefined),
        listDocCompletionFiles(envId, businessId || undefined),
      ]);
      setStats(s);
      setFiles(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  async function handleIntake(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    try {
      await createDocCompletionApplication(envId, {
        external_application_id: appId,
        borrower: { first_name: firstName, last_name: lastName, email: email || undefined, mobile: mobile || undefined },
        loan_type: loanType,
        required_documents: requiredDocs.split(",").map((s) => s.trim()).filter(Boolean),
        send_initial_outreach: true,
      }, businessId || undefined);
      setShowForm(false);
      setAppId("");
      setFirstName("");
      setLastName("");
      setEmail("");
      setMobile("");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Intake failed");
    } finally {
      setFormLoading(false);
    }
  }

  const escalatedFiles = files.filter((f) => f.status === "escalated" || f.escalation_status === "open" || f.escalation_status === "acknowledged");
  const displayFiles = tab === "escalations" ? escalatedFiles : files;

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Doc Completion</h2>
          <p className="text-sm text-bm-muted2">Automated document collection &amp; follow-up agent</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm hover:bg-bm-surface/60"
        >
          {showForm ? "Cancel" : "+ New Application"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* KPI Strip */}
      {stats && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Active Files", value: stats.total_active },
            { label: "Waiting on Borrower", value: stats.waiting_on_borrower },
            { label: "Escalated", value: stats.escalated },
            { label: "Completed Today", value: stats.completed_today },
            { label: "Avg Completion", value: stats.avg_completion_hours != null ? `${stats.avg_completion_hours.toFixed(1)}h` : "-" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-center">
              <p className="text-2xl font-semibold">{kpi.value}</p>
              <p className="text-xs text-bm-muted2">{kpi.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Intake Form */}
      {showForm && (
        <form onSubmit={handleIntake} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
          <h3 className="text-sm font-semibold">New Application Intake</h3>
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Application ID *" value={appId} onChange={(e) => setAppId(e.target.value)} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <select value={loanType} onChange={(e) => setLoanType(e.target.value)} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
              {["mortgage", "auto", "personal", "heloc", "student", "commercial", "other"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input required placeholder="First Name *" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input required placeholder="Last Name *" value={lastName} onChange={(e) => setLastName(e.target.value)} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
            <input placeholder="Mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
          </div>
          <input placeholder="Required docs (comma-separated)" value={requiredDocs} onChange={(e) => setRequiredDocs(e.target.value)} className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" />
          <button type="submit" disabled={formLoading} className="rounded-lg border border-bm-border bg-bm-surface px-4 py-2 text-sm font-medium hover:bg-bm-surface/60 disabled:opacity-50">
            {formLoading ? "Submitting..." : "Submit Application"}
          </button>
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bm-border/50">
        {(["overview", "escalations"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize ${tab === t ? "border-b-2 border-white font-medium" : "text-bm-muted2 hover:text-white"}`}
          >
            {t}{t === "escalations" ? ` (${escalatedFiles.length})` : ""}
          </button>
        ))}
      </div>

      {/* File Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Application</th>
              <th className="px-4 py-3 font-medium">Borrower</th>
              <th className="px-4 py-3 font-medium">Loan Type</th>
              <th className="px-4 py-3 font-medium">Missing Docs</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last Activity</th>
              <th className="px-4 py-3 font-medium">Processor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={7}>Loading...</td></tr>
            ) : displayFiles.length === 0 ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={7}>{tab === "escalations" ? "No escalated files." : "No files yet. Create one above."}</td></tr>
            ) : (
              displayFiles.map((f) => (
                <tr key={f.loan_file_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/lab/env/${envId}/credit/doc-completion/files/${f.loan_file_id}`} className="hover:underline">
                      {f.external_application_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{f.borrower_name}</td>
                  <td className="px-4 py-3 capitalize">{f.loan_type}</td>
                  <td className="px-4 py-3">{f.total_missing}/{f.total_required}</td>
                  <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                  <td className="px-4 py-3 text-bm-muted2">{fmtRelative(f.last_activity_at)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{f.assigned_processor_id || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
