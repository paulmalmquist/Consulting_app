// Derived environment status (PR 5; extracted in PR 14 for reuse on the Mission Control wall).
// Honest, derived from KNOWN client-side fields only. No invented health_score, no numeric
// percentage. promotion_state is NOT available on the client Environment type, so its branches
// are forward-compat and unreachable today — we never fetch it.
import type { Environment } from "@/components/EnvProvider";

export type EnvStatusTone = "teal" | "amber" | "muted";
export type EnvStatus = { label: string; tone: EnvStatusTone; reason: string | null };

const PROMO_DEGRADED = new Set(["degraded", "blocked", "failed", "error", "broken"]);
const PROMO_PENDING = new Set(["pending", "draft", "in_progress", "provisioning", "queued"]);

export function deriveEnvironmentStatus(
  env: Environment | null,
  anomalyCount: number,
  bizId: string | null,
  promotionState?: string | null, // omitted by callers — forward-compat only
): EnvStatus {
  if (!env) {
    return { label: "Status unavailable", tone: "muted", reason: "No environment selected." };
  }
  if (typeof env.is_active !== "boolean" || !env.env_id) {
    return { label: "Status unavailable", tone: "muted", reason: "Required environment fields not loaded." };
  }
  // Inactive wins: a dead env's signals are moot.
  if (env.is_active === false) {
    return { label: "Inactive", tone: "amber", reason: null };
  }
  // Forward-compat (unreachable now — promotionState is always undefined).
  const ps = promotionState?.toLowerCase();
  if (ps && PROMO_DEGRADED.has(ps)) {
    return { label: "Needs attention", tone: "amber", reason: `Promotion state: ${promotionState}` };
  }
  // No tenant → intelligence cannot be scoped → fail closed (never use the default tenant).
  if (!bizId) {
    return {
      label: "Status unavailable",
      tone: "muted",
      reason: "No tenant (business_id) resolved; intelligence cannot be scoped.",
    };
  }
  // The real signal this ships: open anomaly cards for the scoped env.
  if (anomalyCount > 0) {
    return {
      label: "Needs attention",
      tone: "amber",
      reason: `${anomalyCount} open anomaly card${anomalyCount === 1 ? "" : "s"}.`,
    };
  }
  if (ps && PROMO_PENDING.has(ps)) {
    return { label: "In progress", tone: "teal", reason: `Promotion state: ${promotionState}` };
  }
  return { label: "Healthy", tone: "teal", reason: "Derived from active state and open cards. Promotion state not loaded." };
}

export function statusToneColor(tone: EnvStatusTone): string {
  if (tone === "amber") return "rgba(209, 161, 91, 0.95)";
  if (tone === "teal") return "rgba(140, 200, 158, 0.95)";
  return "rgba(255,255,255,0.55)";
}
