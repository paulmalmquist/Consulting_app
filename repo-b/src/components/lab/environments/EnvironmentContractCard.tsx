"use client";

/**
 * EnvironmentContractCard — read-only operator view of an environment's
 * governance contract + fail-closed verification report (Ticket 1).
 *
 * Modeled on the AuditDrawer audit-surface pattern (dark bm-* tokens, dl grid).
 * Read-only: no promote/quarantine affordances (those are Ticket 2). Missing /
 * unknown / not_available checks render explicitly — a non-pass check is NEVER
 * shown as success.
 *
 * Fetches /v2/environments/{envId}/verify through the existing same-origin /bos
 * proxy via bosFetch (no hard-coded backend origin).
 */

import { useCallback, useEffect, useState } from "react";
import { bosFetch } from "@/lib/bos-api";

type CheckStatus = "pass" | "fail" | "missing" | "unknown" | "not_available";
type CheckSeverity = "blocking" | "warning";

interface ContractCheck {
  key: string;
  status: CheckStatus;
  severity: CheckSeverity;
  message: string;
}

interface VerificationReport {
  env_id: string;
  checks: ContractCheck[];
  blocking_failures: string[];
  warnings: string[];
  eligible_for_promotion: boolean;
  promotion_state: string;
  verified_at: string;
  health_ok: boolean;
}

const PROMOTION_BADGE: Record<string, string> = {
  released: "bg-bm-success/15 text-bm-success border-bm-success/40",
  staging: "bg-bm-warning/15 text-bm-warning border-bm-warning/40",
  verified: "bg-bm-warning/15 text-bm-warning border-bm-warning/40",
  quarantined: "bg-bm-danger/15 text-bm-danger border-bm-danger/40",
  failed: "bg-bm-danger/15 text-bm-danger border-bm-danger/40",
  seeded: "bg-bm-muted/15 text-bm-muted border-bm-border/40",
  draft: "bg-bm-muted/15 text-bm-muted border-bm-border/40",
};

// The single "forward" promotion step offered per state (mirrors the backend
// _LEGAL_TRANSITIONS happy path). staging/released are eligibility-gated; the
// button is disabled unless eligible_for_promotion. released has no next step.
const NEXT_PROMOTION: Record<string, string | null> = {
  draft: "seeded",
  seeded: "verified",
  verified: "staging",
  staging: "released",
  released: null,
  quarantined: "verified",
  failed: "draft",
};
const ELIGIBILITY_GATED = new Set(["staging", "released"]);

const STATUS_COLOR: Record<CheckStatus, string> = {
  pass: "text-bm-success",
  fail: "text-bm-danger",
  missing: "text-bm-warning",
  unknown: "text-bm-warning",
  not_available: "text-bm-muted2",
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="nv-metric text-[10px] uppercase text-bm-muted2">{label}</dt>
      <dd className="text-bm-text">{value}</dd>
    </div>
  );
}

export function EnvironmentContractCard({ envId }: { envId: string }) {
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Read-only by default — does not materialize or transition anything.
      const r = await bosFetch<VerificationReport>(
        `/v2/environments/${envId}/verify`,
      );
      setReport(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "verification failed");
    } finally {
      setLoading(false);
    }
  }, [envId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (kind: "promote" | "quarantine", target?: string) => {
      setActionBusy(true);
      setActionError(null);
      try {
        await bosFetch(`/v2/environments/${envId}/${kind}`, {
          method: "POST",
          body: JSON.stringify(
            kind === "promote"
              ? { target, actor: "operator" }
              : { actor: "operator", reason: "operator quarantine" },
          ),
          headers: { "Content-Type": "application/json" },
        });
        await load();
      } catch (e: unknown) {
        // The gate fails closed with a 409 + blocking reasons — surface it,
        // do not swallow it into a success state.
        setActionError(
          e instanceof Error ? e.message : `${kind} failed`,
        );
      } finally {
        setActionBusy(false);
      }
    },
    [envId, load],
  );

  if (loading) {
    return (
      <section
        data-testid="env-contract-card"
        className="rounded-lg border border-bm-border/45 bg-bm-surface/20 p-4 text-xs text-bm-muted"
      >
        Verifying environment contract…
      </section>
    );
  }

  if (error || !report) {
    return (
      <section
        data-testid="env-contract-card"
        className="rounded-lg border border-bm-danger/40 bg-bm-surface/20 p-4 text-xs text-bm-danger"
      >
        Could not load environment contract verification
        {error ? `: ${error}` : "."}
      </section>
    );
  }

  // Blocking checks first, then warnings, pass last — so failures lead the eye.
  const ordered = [...report.checks].sort((a, b) => {
    const rank = (c: ContractCheck) =>
      c.status === "pass" ? 2 : c.severity === "blocking" ? 0 : 1;
    return rank(a) - rank(b);
  });

  const badgeClass =
    PROMOTION_BADGE[report.promotion_state] ?? PROMOTION_BADGE.draft;

  return (
    <section
      data-testid="env-contract-card"
      className="rounded-lg border border-bm-border/45 bg-bm-surface/20 p-4 text-xs"
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="nv-h3 text-bm-text">Environment Contract</h3>
        <span
          data-testid="promotion-state-badge"
          className={`rounded border px-2 py-0.5 nv-metric text-[10px] uppercase ${badgeClass}`}
        >
          {report.promotion_state}
        </span>
      </header>

      <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <Field
          label="eligible_for_promotion"
          value={report.eligible_for_promotion ? "yes" : "no"}
        />
        <Field
          label="blocking_failures"
          value={String(report.blocking_failures.length)}
        />
        <Field label="warnings" value={String(report.warnings.length)} />
        <Field label="verified_at" value={report.verified_at} />
      </dl>

      {!report.eligible_for_promotion ? (
        <p
          data-testid="not-eligible-banner"
          className="mb-3 rounded border border-bm-danger/40 bg-bm-danger/10 px-3 py-2 text-bm-danger"
        >
          Not promotable — {report.blocking_failures.length} blocking check
          {report.blocking_failures.length === 1 ? "" : "s"} not passing.
        </p>
      ) : null}

      <ul className="space-y-1">
        {ordered.map((c) => (
          <li
            key={c.key}
            data-testid={`check-${c.key}`}
            className="flex items-baseline gap-2 border-b border-bm-border/20 pb-1"
          >
            <span
              className={`nv-metric w-24 shrink-0 text-[10px] uppercase ${STATUS_COLOR[c.status]}`}
            >
              {c.status}
            </span>
            <span className="w-20 shrink-0 text-bm-muted2">{c.severity}</span>
            <span className="font-mono text-bm-text">{c.key}</span>
            <span className="text-bm-muted">— {c.message}</span>
          </li>
        ))}
      </ul>

      {(() => {
        const next = NEXT_PROMOTION[report.promotion_state] ?? null;
        const gated = next ? ELIGIBILITY_GATED.has(next) : false;
        const promoteDisabled =
          !next ||
          actionBusy ||
          (gated && !report.eligible_for_promotion);
        const canQuarantine =
          report.promotion_state !== "released" &&
          report.promotion_state !== "quarantined";
        return (
          <footer
            data-testid="contract-actions"
            className="mt-4 flex items-center gap-3 border-t border-bm-border/30 pt-3"
          >
            <button
              type="button"
              data-testid="promote-button"
              disabled={promoteDisabled}
              onClick={() => next && runAction("promote", next)}
              className="rounded border border-bm-border/50 bg-bm-surface2/40 px-3 py-1 text-bm-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              {next ? `Promote → ${next}` : "No further promotion"}
            </button>
            <button
              type="button"
              data-testid="quarantine-button"
              disabled={!canQuarantine || actionBusy}
              onClick={() => runAction("quarantine")}
              className="rounded border border-bm-danger/40 bg-bm-danger/10 px-3 py-1 text-bm-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              Quarantine
            </button>
            {gated && !report.eligible_for_promotion ? (
              <span className="text-bm-muted2">
                Promotion to {next} requires a passing verification.
              </span>
            ) : null}
            {actionError ? (
              <span
                data-testid="action-error"
                className="text-bm-danger"
              >
                {actionError}
              </span>
            ) : null}
          </footer>
        );
      })()}
    </section>
  );
}
