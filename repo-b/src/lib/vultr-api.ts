/**
 * Typed client for /api/vultr/*.
 *
 * Every fetcher validates with Zod (see vultr-contracts.ts). Validation
 * failures throw rather than silently coerce — the surface is contract-bound
 * and a missing/changed field is a real bug, not a UI fallback.
 */
import { z, ZodTypeAny } from "zod";
import { bosFetch, type DomainContext } from "@/lib/bos-api";
import {
  CustomerDetailOut,
  GpuCommandGraphOut,
  VultrContext,
  VultrEnvelope,
} from "@/lib/vultr-contracts";
import type {
  CustomerDetailOut as CustomerDetailOutT,
  GpuCommandGraphOut as GpuCommandGraphOutT,
  VultrEnvelope as VultrEnvelopeT,
} from "@/lib/vultr-contracts";

async function _fetchValidated<T extends ZodTypeAny>(
  schema: T,
  path: string,
  params: Record<string, string | undefined>,
): Promise<z.infer<T>> {
  const raw = await bosFetch<unknown>(path, { params });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new Error(`vultr-api: ${path} response did not match schema — ${issues}`);
  }
  return parsed.data;
}

// ── Context (shape required by DomainEnvProvider) ────────────────────

export async function getVultrContext(
  envId: string,
  businessId?: string,
): Promise<DomainContext> {
  const ctx = await _fetchValidated(VultrContext, "/api/vultr/context", {
    env_id: envId,
    business_id: businessId,
  });
  return {
    env_id: ctx.env_id,
    business_id: ctx.business_id,
    created: ctx.created,
    source: ctx.source,
    diagnostics: ctx.diagnostics,
  };
}

// ── Landing-page / executive endpoints ───────────────────────────────

export function getVultrSummary(envId: string): Promise<VultrEnvelopeT> {
  return _fetchValidated(VultrEnvelope, "/api/vultr/summary", { env_id: envId });
}

export function getVultrExecutive(
  envId: string,
  period: string = "30D",
): Promise<VultrEnvelopeT> {
  return _fetchValidated(VultrEnvelope, "/api/vultr/executive", {
    env_id: envId,
    period,
  });
}

// ── Reconciliation ───────────────────────────────────────────────────

export function getVultrReconciliation(
  envId: string,
  opts?: { customer_id?: string; exception_type?: string; limit?: number },
): Promise<VultrEnvelopeT> {
  return _fetchValidated(VultrEnvelope, "/api/vultr/reconciliation", {
    env_id: envId,
    customer_id: opts?.customer_id,
    exception_type: opts?.exception_type,
    limit: opts?.limit ? String(opts.limit) : undefined,
  });
}

export function getVultrReconciliationDetail(
  envId: string,
  exceptionId: string,
): Promise<VultrEnvelopeT> {
  return _fetchValidated(
    VultrEnvelope,
    `/api/vultr/reconciliation/${encodeURIComponent(exceptionId)}`,
    { env_id: envId },
  );
}

// ── GPU economics + flagship graph ───────────────────────────────────

export function getVultrGpuEconomics(
  envId: string,
  period: string = "30D",
): Promise<VultrEnvelopeT> {
  return _fetchValidated(VultrEnvelope, "/api/vultr/gpu-economics", {
    env_id: envId,
    period,
  });
}

export function getVultrGpuCommandGraph(
  envId: string,
  opts?: {
    period?: string;
    region?: string;
    sku?: string;
    segment?: string;
    metric?: string;
  },
): Promise<GpuCommandGraphOutT> {
  return _fetchValidated(GpuCommandGraphOut, "/api/vultr/gpu-command-graph", {
    env_id: envId,
    period: opts?.period,
    region: opts?.region,
    sku: opts?.sku,
    segment: opts?.segment,
    metric: opts?.metric,
  });
}

// ── Customers ────────────────────────────────────────────────────────

export function getVultrCustomers(
  envId: string,
  opts?: { limit?: number; offset?: number },
): Promise<VultrEnvelopeT> {
  return _fetchValidated(VultrEnvelope, "/api/vultr/customers", {
    env_id: envId,
    limit: opts?.limit ? String(opts.limit) : undefined,
    offset: opts?.offset ? String(opts.offset) : undefined,
  });
}

export function getVultrCustomerDetail(
  envId: string,
  customerId: string,
): Promise<CustomerDetailOutT> {
  return _fetchValidated(
    CustomerDetailOut,
    `/api/vultr/customers/${encodeURIComponent(customerId)}`,
    { env_id: envId },
  );
}

// ── Sales / Operations / Data model / Quality ───────────────────────

export function getVultrSales(envId: string): Promise<VultrEnvelopeT> {
  return _fetchValidated(VultrEnvelope, "/api/vultr/sales", { env_id: envId });
}

export function getVultrOperations(envId: string): Promise<VultrEnvelopeT> {
  return _fetchValidated(VultrEnvelope, "/api/vultr/operations", {
    env_id: envId,
  });
}

export function getVultrDataModel(envId: string): Promise<VultrEnvelopeT> {
  return _fetchValidated(VultrEnvelope, "/api/vultr/data-model", {
    env_id: envId,
  });
}

export function getVultrQuality(envId: string): Promise<VultrEnvelopeT> {
  return _fetchValidated(VultrEnvelope, "/api/vultr/quality", {
    env_id: envId,
  });
}
