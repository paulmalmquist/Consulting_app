"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getDocCompletionFile,
  getDocCompletionAuditLog,
  sendDocCompletionOutreach,
  acceptDocRequirement,
  rejectDocRequirement,
  waiveDocRequirement,
  resolveDocEscalation,
  DcLoanFile,
  DcAuditLogEntry,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";

type Tab = "overview" | "communications" | "audit";

const STATUS_COLORS: Record<string, string> = {
  accepted: "bg-green-500/20 text-green-400",
  waived: "bg-green-500/20 text-green-400",
  uploaded: "bg-yellow-500/20 text-yellow-400",
  required: "bg-red-500/20 text-red-400",
  requested: "bg-orange-500/20 text-orange-400",
  rejected: "bg-red-500/20 text-red-300",
};

const FILE_STATUS_COLORS: Record<string, string> = {
  complete: "bg-green-500/20 text-green-400",
  escalated: "bg-red-500/20 text-red-400",
  waiting_on_borrower: "bg-yellow-500/20 text-yellow-400",
  partial_docs_received: "bg-blue-500/20 text-blue-400",
  closed_manually: "bg-gray-500/20 text-gray-400",
};

function Badge({ status, map }: { status: string; map: Record<string, string> }) {
  const cls = map[status] || "bg-gray-500/20 text-gray-400";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{status.replace(/_/g, " ")}</span>;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

export default function DocCompletionFileDetailPage() {
  const params = useParams();
  const fileId = params.fileId as string;
  const { envId, businessId } = useDomainEnv();
  const [tab, setTab] = useState<Tab>("overview");
  const [file, setFile] = useState<DcLoanFile | null>(null);
  const [auditLog, setAuditLog] = useState<DcAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${envId}/credit/doc-completion/files/${fileId}`,
      surface: "credit",
      active_module: "doc_completion",
    });
    return () => resetAssistantPageContext();
  }, [envId, fileId]);

  async function loadFile() {
    setLoading(true);
    setError(null);
    try {
      const f = await getDocCompletionFile(envId, fileId, businessId || undefined);
      setFile(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load file");
    } finally {
      setLoading(false);
    }
  }

  async function loadAudit() {
    try {
      const log = await getDocCompletionAuditLog(envId, fileId, businessId || undefined);
      setAuditLog(log);
    } catch {
      // non-critical
    }
  }

  useEffect(() => {
    void loadFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, fileId, businessId]);

  useEffect(() => {
    if (tab === "audit") void loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, envId, fileId]);

  async function handleDocAction(reqId: string, action: "accept" | "reject" | "waive") {
    setActionLoading(reqId);
    try {
      if (action === "accept") await acceptDocRequirement(envId, fileId, reqId, businessId || undefined);
      else if (action === "reject") {
        const notes = prompt("Rejection reason (optional):");
        await rejectDocRequirement(envId, fileId, reqId, notes || undefined, businessId || undefined);
      } else {
        await waiveDocRequirement(envId, fileId, reqId, businessId || undefined);
      }
      void loadFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSendOutreach() {
    setActionLoading("outreach");
    try {
      await sendDocCompletionOutreach(envId, fileId, { channel: "both" }, businessId || undefined);
      void loadFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Outreach failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResolveEscalation(escId: string) {
    const note = prompt("Resolution note:");
    if (note === null) return;
    setActionLoading(escId);
    try {
      await resolveDocEscalation(envId, fileId, escId, { resolution_note: note, status: "resolved" }, businessId || undefined);
      void loadFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolve failed");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) return <p className="p-6 text-bm-muted2">Loading...</p>;
  if (error && !file) return <p className="p-6 text-xs text-red-400">{error}</p>;
  if (!file) return <p className="p-6 text-bm-muted2">File not found.</p>;

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{file.external_application_id}</h2>
          <p className="text-sm text-bm-muted2">
            {file.loan_type} &middot; <Badge status={file.status} map={FILE_STATUS_COLORS} /> &middot; {file.total_missing} missing / {file.total_required} total
          </p>
        </div>
        <button
          onClick={handleSendOutreach}
          disabled={actionLoading === "outreach"}
          className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm hover:bg-bm-surface/60 disabled:opacity-50"
        >
          {actionLoading === "outreach" ? "Sending..." : "Send Outreach"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bm-border/50">
        {(["overview", "communications", "audit"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize ${tab === t ? "border-b-2 border-white font-medium" : "text-bm-muted2 hover:text-white"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* Borrower Card */}
          {file.borrower && (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <h3 className="text-sm font-semibold mb-2">Borrower</h3>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div><span className="text-bm-muted2">Name:</span> {file.borrower.first_name} {file.borrower.last_name}</div>
                <div><span className="text-bm-muted2">Email:</span> {file.borrower.email || "-"}</div>
                <div><span className="text-bm-muted2">Mobile:</span> {file.borrower.mobile || "-"}</div>
                <div><span className="text-bm-muted2">Channel:</span> {file.borrower.preferred_channel}</div>
              </div>
            </div>
          )}

          {/* Document Checklist */}
          <div className="rounded-xl border border-bm-border/70 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  <th className="px-4 py-3 font-medium">Document</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Uploaded</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {file.requirements.map((req) => (
                  <tr key={req.requirement_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-3 font-medium">{req.display_name}</td>
                    <td className="px-4 py-3"><Badge status={req.status} map={STATUS_COLORS} /></td>
                    <td className="px-4 py-3 text-bm-muted2">{fmtDate(req.uploaded_at)}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {req.status === "uploaded" && (
                        <>
                          <button
                            onClick={() => handleDocAction(req.requirement_id, "accept")}
                            disabled={actionLoading === req.requirement_id}
                            className="rounded border border-green-600/50 px-2 py-1 text-xs text-green-400 hover:bg-green-600/20 disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleDocAction(req.requirement_id, "reject")}
                            disabled={actionLoading === req.requirement_id}
                            className="rounded border border-red-600/50 px-2 py-1 text-xs text-red-400 hover:bg-red-600/20 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {(req.status === "required" || req.status === "requested" || req.status === "rejected") && (
                        <button
                          onClick={() => handleDocAction(req.requirement_id, "waive")}
                          disabled={actionLoading === req.requirement_id}
                          className="rounded border border-bm-border px-2 py-1 text-xs text-bm-muted2 hover:bg-bm-surface/40 disabled:opacity-50"
                        >
                          Waive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Escalations */}
          {file.escalations.length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-red-400">Escalations</h3>
              {file.escalations.map((esc) => (
                <div key={esc.escalation_event_id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{esc.reason}</span>
                    <span className="text-bm-muted2 ml-2">Priority: {esc.priority}</span>
                    {esc.resolved_at && <span className="text-green-400 ml-2">Resolved</span>}
                  </div>
                  {esc.status !== "resolved" && esc.status !== "dismissed" && (
                    <button
                      onClick={() => handleResolveEscalation(esc.escalation_event_id)}
                      disabled={actionLoading === esc.escalation_event_id}
                      className="rounded border border-bm-border px-2 py-1 text-xs hover:bg-bm-surface/40 disabled:opacity-50"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Communications Tab */}
      {tab === "communications" && (
        <div className="space-y-3">
          {file.messages.length === 0 ? (
            <p className="text-sm text-bm-muted2">No messages sent yet.</p>
          ) : (
            file.messages.map((msg) => (
              <div key={msg.message_event_id} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${msg.channel === "sms" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}>
                    {msg.channel.toUpperCase()}
                  </span>
                  <span className="text-xs text-bm-muted2 capitalize">{msg.message_type.replace(/_/g, " ")}</span>
                  {msg.failed_at && <span className="text-xs text-red-400">Failed</span>}
                </div>
                {msg.subject && <p className="text-sm font-medium mb-1">{msg.subject}</p>}
                <p className="text-sm text-bm-muted2 whitespace-pre-wrap">{msg.content_snapshot}</p>
                <div className="flex gap-4 mt-2 text-xs text-bm-muted2">
                  <span>Sent: {fmtDate(msg.sent_at)}</span>
                  {msg.delivered_at && <span>Delivered: {fmtDate(msg.delivered_at)}</span>}
                  {msg.opened_at && <span>Opened: {fmtDate(msg.opened_at)}</span>}
                  {msg.failure_reason && <span className="text-red-400">Error: {msg.failure_reason}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Audit Tab */}
      {tab === "audit" && (
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {auditLog.length === 0 ? (
                <tr><td className="px-4 py-6 text-bm-muted2" colSpan={4}>No audit entries.</td></tr>
              ) : (
                auditLog.map((entry) => (
                  <tr key={entry.audit_log_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-3 text-bm-muted2 text-xs">{fmtDate(entry.created_at)}</td>
                    <td className="px-4 py-3 font-medium">{entry.action}</td>
                    <td className="px-4 py-3 text-bm-muted2">{entry.actor_type}{entry.actor_id ? ` (${entry.actor_id})` : ""}</td>
                    <td className="px-4 py-3 text-bm-muted2 text-xs max-w-xs truncate">{JSON.stringify(entry.metadata_json)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
