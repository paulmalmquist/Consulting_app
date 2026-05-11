/**
 * Vendor Intelligence store — temporary localStorage bridge.
 *
 * All vendor relevance / workflow / engagement / replaceability metadata
 * reads and writes go through this adapter. When the `nv_vendor_intelligence`
 * table lands, only this file changes — component code stays the same.
 *
 * Key shape: `${envId}:${vendorName}` (vendor name normalized to lowercase).
 */

export type VendorRelevance =
  | "core"
  | "supporting"
  | "personal"
  | "redundant"
  | "unknown";

export type VendorIntelligence = {
  business_relevance: VendorRelevance;
  linked_workflow?: string;
  linked_engagement_id?: string;
  replaceable_by_winston: boolean;
  monthly_roi_estimate_usd?: number;
  classified_at?: string;
  classified_by?: "user" | "system";
  classification_confidence?: number;
};

const STORAGE_PREFIX = "nv_vendor_intel:";

function normalize(vendor: string): string {
  return vendor.trim().toLowerCase();
}

function key(envId: string, vendor: string): string {
  return `${STORAGE_PREFIX}${envId}:${normalize(vendor)}`;
}

export function getVendorIntel(
  envId: string,
  vendor: string,
): VendorIntelligence | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(envId, vendor));
    if (!raw) return null;
    return JSON.parse(raw) as VendorIntelligence;
  } catch {
    return null;
  }
}

export function setVendorIntel(
  envId: string,
  vendor: string,
  intel: Partial<VendorIntelligence>,
): VendorIntelligence {
  const current = getVendorIntel(envId, vendor) ?? {
    business_relevance: "unknown" as VendorRelevance,
    replaceable_by_winston: false,
  };
  const next: VendorIntelligence = {
    ...current,
    ...intel,
    classified_at: new Date().toISOString(),
    classified_by: intel.classified_by ?? "user",
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key(envId, vendor), JSON.stringify(next));
    } catch {
      /* quota or disabled — best-effort */
    }
  }
  return next;
}

export function clearVendorIntel(envId: string, vendor: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(envId, vendor));
  } catch {
    /* ignore */
  }
}

export function listVendorIntel(
  envId: string,
): Record<string, VendorIntelligence> {
  if (typeof window === "undefined") return {};
  const out: Record<string, VendorIntelligence> = {};
  const prefix = `${STORAGE_PREFIX}${envId}:`;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const vendor = k.slice(prefix.length);
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      try {
        out[vendor] = JSON.parse(raw);
      } catch {
        /* skip malformed entry */
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

export const RELEVANCE_LABELS: Record<VendorRelevance, string> = {
  core: "Core",
  supporting: "Supporting",
  personal: "Personal",
  redundant: "Redundant",
  unknown: "Unknown",
};

export const RELEVANCE_ORDER: VendorRelevance[] = [
  "core",
  "supporting",
  "personal",
  "redundant",
  "unknown",
];
