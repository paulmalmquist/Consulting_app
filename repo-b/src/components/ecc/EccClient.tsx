"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import {
  approvePayable,
  completeMessage,
  createPayableFromMessage,
  delegateEccItem,
  fetchEccBrief,
  fetchEccDemoStatus,
  fetchEccMessage,
  fetchEccPayable,
  fetchEccQueue,
  fetchVipContacts,
  generateEccBrief,
  quickCaptureEcc,
  resetEccDemo,
  snoozeMessage,
  updateEccDemoMode,
} from "@/lib/ecc/api";
import type {
  EccBriefResponse,
  EccDemoStatus,
  EccMessageDetail,
  EccPayableDetail,
  EccQueueCard,
  EccQueueResponse,
} from "@/lib/ecc/types";

function formatAmount(value: number | null) {
  if (value == null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function badgeVariant(label: string): "danger" | "warning" | "success" | "accent" | "default" {
  if (/overdue|vip 3|red|risk/i.test(label)) return "danger";
  if (/review|rsvp|vip 2/i.test(label)) return "warning";
  if (/approved|paid|done/i.test(label)) return "success";
  if (/approval|vip/i.test(label)) return "accent";
  return "default";
}

function Section({
  title,
  items,
  envId,
  onRefresh,
}: {
  title: string;
  items: EccQueueCard[];
  envId: string;
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();

  const runCardAction = async (card: EccQueueCard, action: "reply" | "approve" | "delegate" | "snooze" | "done") => {
    if (action === "reply" && card.kind === "message") {
      await completeMessage(envId, card.id);
      await onRefresh();
      return;
    }
    if (action === "approve" && card.kind === "payable") {
      await approvePayable(envId, card.id, "Approved from queue");
      await onRefresh();
      return;
    }
    if (action === "delegate") {
      await delegateEccItem({
        envId,
        itemType: card.kind,
        itemId: card.id,
        toUser: /payable/i.test(card.kind) ? "Daniel Ortiz" : "Sarah Kim",
        dueBy: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        contextNote: `Cover this ${card.kind} and report back in ECC.`,
      });
      await onRefresh();
      return;
    }
    if (action === "snooze" && card.kind === "message") {
      await snoozeMessage(envId, card.id, new Date(Date.now() + 30_000).toISOString());
      await onRefresh();
      return;
    }
    if (action === "done" && card.kind === "message") {
      await completeMessage(envId, card.id);
      await onRefresh();
      return;
    }
    router.push(card.href);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-bm-muted2">{title}</h2>
        <span className="text-xs text-bm-muted">{items.length}</span>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? (
          <Card>
            <CardContent className="py-4 text-sm text-bm-muted">Nothing waiting here.</CardContent>
          </Card>
        ) : (
          items.map((item) => (
            <Card key={`${title}-${item.id}`} className="rounded-2xl border border-bm-border/60 bg-bm-surface/20">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-bm-text">{item.actor}</p>
                      <Badge variant={badgeVariant(item.badge)}>{item.badge}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-bm-text">{item.title}</p>
                    <p className="mt-1 text-xs text-bm-muted">{item.summary}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-bm-text">{formatAmount(item.amount)}</p>
                    <p className="text-[11px] text-bm-muted2">{item.due_label}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {item.kind === "message" ? (
                    <>
                      <Button size="sm" onClick={() => runCardAction(item, "reply")}>Reply</Button>
                      <Button size="sm" variant="secondary" onClick={() => runCardAction(item, "delegate")}>Delegate</Button>
                      <Button size="sm" variant="secondary" onClick={() => runCardAction(item, "snooze")}>Snooze</Button>
                      <Button size="sm" variant="secondary" onClick={() => runCardAction(item, "done")}>Done</Button>
                    </>
                  ) : item.kind === "payable" ? (
                    <>
                      <Button size="sm" onClick={() => runCardAction(item, "approve")}>Approve</Button>
                      <Button size="sm" variant="secondary" onClick={() => runCardAction(item, "delegate")}>Delegate</Button>
                      <Button size="sm" variant="secondary" onClick={() => router.push(item.href)}>Review</Button>
                      <Button size="sm" variant="secondary" onClick={() => onRefresh()}>Refresh</Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => router.push(item.href)}>Open</Button>
                      <Button size="sm" variant="secondary" onClick={() => runCardAction(item, "delegate")}>Delegate</Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}

export function EccQueueClient({ envId }: { envId: string }) {
  const [snapshot, setSnapshot] = useState<EccQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [captureText, setCaptureText] = useState("");

  const cacheKey = `ecc_queue_snapshot_${envId}`;

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchEccQueue(envId);
      setSnapshot(next);
      sessionStorage.setItem(cacheKey, JSON.stringify(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        setSnapshot(JSON.parse(cached) as EccQueueResponse);
        setLoading(false);
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId]);

  const sections = snapshot?.sections;

  return (
    <div className="space-y-5 pb-6">
      <Card className="rounded-3xl border border-bm-border/60 bg-bm-surface/20">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Live Queue</p>
              <p className="text-xl font-semibold tracking-[-0.02em]">Decision and routing for the messy day</p>
            </div>
            <Button size="sm" variant="secondary" onClick={refresh} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <MetricChip label="Red Alerts" value={snapshot?.counts.red_alerts ?? 0} tone="danger" />
            <MetricChip label="VIP Replies" value={snapshot?.counts.vip ?? 0} tone="warning" />
            <MetricChip label="Approvals" value={snapshot?.counts.approvals ?? 0} tone="accent" />
            <MetricChip label="Calendar" value={snapshot?.counts.calendar ?? 0} tone="default" />
            <MetricChip label="General" value={snapshot?.counts.general ?? 0} tone="default" />
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-bm-bg/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-bm-muted2">Quick Capture</p>
            <Textarea
              className="mt-2 min-h-[96px]"
              placeholder="Paste a message, text, or loose commitment..."
              value={captureText}
              onChange={(event) => setCaptureText(event.target.value)}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-bm-muted">Manual capture runs the same ingest, classify, and route pipeline.</p>
              <Button
                size="sm"
                onClick={async () => {
                  if (!captureText.trim()) return;
                  await quickCaptureEcc(envId, captureText);
                  setCaptureText("");
                  await refresh();
                }}
              >
                Capture
              </Button>
            </div>
          </div>
          {snapshot?.risk_signals?.length ? (
            <div className="flex flex-wrap gap-2">
              {snapshot.risk_signals.map((risk) => (
                <Badge key={risk} variant="danger">{risk}</Badge>
              ))}
            </div>
          ) : null}
          {error ? <p className="text-sm text-bm-danger">{error}</p> : null}
        </CardContent>
      </Card>

      <Section title="Red Alerts" items={sections?.red_alerts || []} envId={envId} onRefresh={refresh} />
      <Section title="VIP Replies" items={sections?.vip || []} envId={envId} onRefresh={refresh} />
      <Section title="Approvals" items={sections?.approvals || []} envId={envId} onRefresh={refresh} />
      <Section title="Calendar" items={sections?.calendar || []} envId={envId} onRefresh={refresh} />
      <Section title="Everything Else" items={sections?.general || []} envId={envId} onRefresh={refresh} />
    </div>
  );
}

function MetricChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "warning" | "accent" | "default";
}) {
  const toneClass =
    tone === "danger"
      ? "border-bm-danger/35 bg-bm-danger/12"
      : tone === "warning"
      ? "border-bm-warning/35 bg-bm-warning/12"
      : tone === "accent"
      ? "border-bm-accent/35 bg-bm-accent/12"
      : "border-bm-border/60 bg-bm-surface/20";
  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">{label}</p>
      <p className="mt-1 text-xl font-semibold text-bm-text">{value}</p>
    </div>
  );
}

export function EccMessageDetailClient({
  envId,
  messageId,
}: {
  envId: string;
  messageId: string;
}) {
  const [detail, setDetail] = useState<EccMessageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setDetail(await fetchEccMessage(envId, messageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load message.");
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, messageId]);

  if (!detail) {
    return <Card><CardContent className="p-4 text-sm text-bm-muted">{error || "Loading message..."}</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border border-bm-border/60 bg-bm-surface/20">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={badgeVariant(detail.message.vip_flag ? `VIP ${detail.message.vip_tier}` : "Message")}>
              {detail.message.vip_flag ? `VIP ${detail.message.vip_tier}` : "Message"}
            </Badge>
            <Badge variant={detail.message.status === "done" ? "success" : "default"}>{detail.message.status}</Badge>
          </div>
          <CardTitle className="text-xl">{detail.message.subject}</CardTitle>
          <p className="text-sm text-bm-muted">From {detail.message.sender_raw}</p>
          <div className="rounded-2xl border border-bm-border/60 bg-bm-bg/40 p-3 text-sm leading-6 text-bm-text">
            {detail.message.body_full}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-bm-border/60 bg-bm-bg/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-bm-muted2">Extracted Asks</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {detail.message.action_candidates.map((action) => (
                  <Badge key={action} variant="accent">{action}</Badge>
                ))}
                {!detail.message.action_candidates.length ? (
                  <span className="text-sm text-bm-muted">No explicit ask detected.</span>
                ) : null}
              </div>
            </div>
            <div className="rounded-2xl border border-bm-border/60 bg-bm-bg/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-bm-muted2">Finance Linker</p>
              <div className="mt-2 space-y-2">
                {detail.message.finance_suggestions.map((suggestion) => (
                  <div key={`${suggestion.kind}-${suggestion.label}`} className="rounded-xl border border-bm-border/50 p-2 text-sm">
                    <p className="font-medium text-bm-text">{suggestion.label}</p>
                    <p className="text-xs text-bm-muted">{suggestion.note}</p>
                    <p className="mt-1 text-[11px] text-bm-muted2">Confidence {Math.round(suggestion.confidence * 100)}%</p>
                  </div>
                ))}
                {detail.message.finance_suggestions.some((suggestion) => suggestion.kind === "create_payable") ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await createPayableFromMessage(envId, messageId);
                      await refresh();
                    }}
                  >
                    Create Payable
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={async () => { await completeMessage(envId, messageId); await refresh(); }}>Reply / Mark Done</Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await delegateEccItem({
                  envId,
                  itemType: "message",
                  itemId: messageId,
                  toUser: "Sarah Kim",
                  dueBy: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                  contextNote: "Respond and log the closeout.",
                });
                await refresh();
              }}
            >
              Delegate
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-bm-muted2">Audit Trail</p>
          {detail.audit.length ? (
            detail.audit.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-bm-border/50 p-3 text-sm">
                <p className="font-medium text-bm-text">{entry.action}</p>
                <p className="text-xs text-bm-muted">{new Date(entry.created_at).toLocaleString()}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-bm-muted">No audit entries yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function EccApprovalDetailClient({
  envId,
  payableId,
}: {
  envId: string;
  payableId: string;
}) {
  const [detail, setDetail] = useState<EccPayableDetail | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [note, setNote] = useState("Approved in ECC after reviewing scope and liquidity.");
  const [delegateNote, setDelegateNote] = useState("Confirm vendor backup, then reconcile in the controller queue.");

  const refresh = async () => {
    setDetail(await fetchEccPayable(envId, payableId));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, payableId]);

  if (!detail) {
    return <Card><CardContent className="p-4 text-sm text-bm-muted">Loading approval...</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border border-bm-border/60 bg-bm-surface/20">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={badgeVariant(detail.payable.status)}>{detail.payable.status.replace(/_/g, " ")}</Badge>
            {detail.payable.match_confidence != null ? (
              <Badge variant={detail.payable.match_confidence >= 0.85 ? "success" : "warning"}>
                Match {Math.round(detail.payable.match_confidence * 100)}%
              </Badge>
            ) : null}
          </div>
          <CardTitle className="text-xl">{detail.payable.vendor_name_raw}</CardTitle>
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-bm-border/60 bg-bm-bg/40 p-3 text-sm">
            <div>
              <p className="text-bm-muted">Amount</p>
              <p className="font-semibold text-bm-text">{formatAmount(detail.payable.amount)}</p>
            </div>
            <div>
              <p className="text-bm-muted">Due</p>
              <p className="font-semibold text-bm-text">{new Date(detail.payable.due_date).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-bm-muted">Invoice</p>
              <p className="font-semibold text-bm-text">{detail.payable.invoice_number || "—"}</p>
            </div>
            <div>
              <p className="text-bm-muted">Approval Note</p>
              <p className="font-semibold text-bm-text">{detail.payable.approval_note || "—"}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setApproveOpen(true)}>Approve</Button>
            <Button variant="secondary" onClick={() => setDelegateOpen(true)}>Delegate</Button>
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-bm-bg/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-bm-muted2">Finance Linker</p>
            <div className="mt-2 space-y-2">
              {detail.candidate_transactions.map((txn) => (
                <div key={txn.id} className="rounded-xl border border-bm-border/50 p-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-bm-text">{txn.merchant}</p>
                    <p className="font-semibold text-bm-text">{formatAmount(txn.amount)}</p>
                  </div>
                  <p className="text-xs text-bm-muted">{txn.memo}</p>
                  <p className="mt-1 text-[11px] text-bm-muted2">Confidence {Math.round((txn.confidence_score || 0) * 100)}%</p>
                </div>
              ))}
            </div>
          </div>
          {detail.linked_message ? (
            <Link href={`/lab/env/${envId}/ecc/messages/${detail.linked_message.id}`} className="text-sm text-bm-accent">
              Open source message
            </Link>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-bm-muted2">Audit Trail</p>
          {detail.audit.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-bm-border/50 p-3 text-sm">
              <p className="font-medium text-bm-text">{entry.action}</p>
              <p className="text-xs text-bm-muted">{new Date(entry.created_at).toLocaleString()}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Approve payable"
        description="This updates internal approval state only. No payment is executed."
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                await approvePayable(envId, payableId, note);
                setApproveOpen(false);
                await refresh();
              }}
            >
              Confirm approval
            </Button>
          </>
        }
      >
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} />
      </Dialog>

      <Dialog
        open={delegateOpen}
        onOpenChange={setDelegateOpen}
        title="Delegate follow-up"
        description="Delegation keeps the item visible until it is closed."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDelegateOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                await delegateEccItem({
                  envId,
                  itemType: "payable",
                  itemId: payableId,
                  toUser: "Daniel Ortiz",
                  dueBy: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
                  contextNote: delegateNote,
                });
                setDelegateOpen(false);
                await refresh();
              }}
            >
              Confirm delegation
            </Button>
          </>
        }
      >
        <Textarea value={delegateNote} onChange={(event) => setDelegateNote(event.target.value)} rows={4} />
      </Dialog>
    </div>
  );
}

export function EccBriefClient({ envId }: { envId: string }) {
  const [amBrief, setAmBrief] = useState<EccBriefResponse | null>(null);
  const [pmBrief, setPmBrief] = useState<EccBriefResponse | null>(null);

  const refresh = async () => {
    const [am, pm] = await Promise.all([fetchEccBrief(envId, "am"), fetchEccBrief(envId, "pm")]);
    setAmBrief(am);
    setPmBrief(pm);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId]);

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border border-bm-border/60 bg-bm-surface/20">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Daily Brief</p>
              <p className="text-xl font-semibold tracking-[-0.02em]">Start and end day with certainty</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={async () => { await generateEccBrief(envId, "am"); await refresh(); }}>
                Refresh AM
              </Button>
              <Button size="sm" onClick={async () => { await generateEccBrief(envId, "pm"); await refresh(); }}>
                Run PM Sweep
              </Button>
            </div>
          </div>
          {amBrief ? (
            <BriefCard title="Morning Brief" brief={amBrief} />
          ) : null}
          {pmBrief ? (
            <BriefCard title="Evening Sweep" brief={pmBrief} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function BriefCard({ title, brief }: { title: string; brief: EccBriefResponse }) {
  const money = brief.brief.money_summary;
  return (
    <div className="rounded-2xl border border-bm-border/60 bg-bm-bg/40 p-4">
      <p className="text-sm font-semibold text-bm-text">{title}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <BriefMetric label="Cash Today" value={formatAmount(money.cash_out_today)} />
        <BriefMetric label="Due 72h" value={formatAmount(money.due_72h_total)} />
        <BriefMetric label="Overdue" value={formatAmount(money.overdue_total)} />
        <BriefMetric label="Receivables" value={formatAmount(money.receivable_total)} />
        <BriefMetric label="Exposure" value={formatAmount(money.decision_exposure)} />
      </div>
      <div className="mt-3 rounded-2xl border border-bm-border/50 bg-bm-surface/15 p-3">
        <pre className="whitespace-pre-wrap text-sm text-bm-text">{brief.brief.body}</pre>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {brief.brief.top_risks.map((risk) => (
          <Badge key={risk} variant="danger">{risk}</Badge>
        ))}
      </div>
      <p className="mt-3 text-xs text-bm-muted">
        Outstanding red alerts: {brief.outstanding_red_alerts} • Open items: {brief.outstanding_open_items}
      </p>
    </div>
  );
}

function BriefMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-bm-border/50 p-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">{label}</p>
      <p className="mt-1 font-semibold text-bm-text">{value}</p>
    </div>
  );
}

export function EccVipClient({ envId }: { envId: string }) {
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; vip_tier: number; sla_hours: number; tags: string[]; channels: { emails: string[]; phones: string[] } }>>([]);

  useEffect(() => {
    fetchVipContacts(envId).then((payload) => setContacts(payload.contacts)).catch(() => setContacts([]));
  }, [envId]);

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border border-bm-border/60 bg-bm-surface/20">
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">VIP Routing</p>
            <p className="text-xl font-semibold tracking-[-0.02em]">Tiered contacts and SLA windows</p>
          </div>
          <div className="space-y-3">
            {contacts.map((contact) => (
              <div key={contact.id} className="rounded-2xl border border-bm-border/60 bg-bm-bg/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-bm-text">{contact.name}</p>
                  <Badge variant={contact.vip_tier >= 3 ? "danger" : contact.vip_tier === 2 ? "warning" : "accent"}>
                    Tier {contact.vip_tier}
                  </Badge>
                  <Badge variant="default">SLA {contact.sla_hours}h</Badge>
                </div>
                <p className="mt-2 text-xs text-bm-muted">
                  {(contact.channels.emails[0] || contact.channels.phones[0] || "No primary channel")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {contact.tags.map((tag) => (
                    <Badge key={`${contact.id}-${tag}`} variant="default">{tag}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function EccAdminClient({ envId }: { envId: string }) {
  const [status, setStatus] = useState<EccDemoStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [captureText, setCaptureText] = useState(
    "Forwarded from iPhone: Please approve the emergency vendor wire for $12,400 before 2pm today."
  );

  const refresh = async () => {
    setStatus(await fetchEccDemoStatus(envId));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId]);

  const summary = useMemo(
    () =>
      status
        ? [
            `Messages ${status.counts.messages}`,
            `Payables ${status.counts.payables}`,
            `Tasks ${status.counts.tasks}`,
            `Red Alerts ${status.counts.red_alerts}`,
          ].join(" • ")
        : "Loading...",
    [status]
  );

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border border-bm-border/60 bg-bm-surface/20">
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Environment Controls</p>
            <p className="text-xl font-semibold tracking-[-0.02em]">Deterministic, resettable, auditable</p>
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-bm-bg/40 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-bm-text">Sample Data Mode</p>
                <p className="text-xs text-bm-muted">{summary}</p>
              </div>
              <Button
                variant={status?.demo_mode ? "primary" : "secondary"}
                onClick={async () => {
                  if (!status) return;
                  setBusy(true);
                  try {
                    await updateEccDemoMode(envId, !status.demo_mode);
                    await refresh();
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                {status?.demo_mode ? "On" : "Off"}
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              variant="secondary"
              onClick={async () => {
                setBusy(true);
                try {
                  await resetEccDemo(envId);
                  await refresh();
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              Reset Data
            </Button>
            <Button
              onClick={async () => {
                setBusy(true);
                try {
                  await quickCaptureEcc(envId, captureText);
                  await refresh();
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              Ingest Quick Capture
            </Button>
          </div>
          <div className="rounded-2xl border border-bm-border/60 bg-bm-bg/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-bm-muted2">Manual Forward / Share</p>
            <Textarea value={captureText} onChange={(event) => setCaptureText(event.target.value)} rows={5} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
