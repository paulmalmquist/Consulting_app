import type { AssetScope } from "./decision-engine-types";

export function filterByScope<T>(
  items: T[],
  scope: AssetScope,
  classifier: (item: T) => AssetScope[]
): T[] {
  if (scope === "global") return items;
  return items.filter((item) => classifier(item).includes(scope));
}

/* ── Classifiers ──────────────────────────────────────────── */

const EQUITIES_ASSETS = new Set(["SPY", "QQQ", "HY Credit", "Gold"]);
const CRYPTO_ASSETS = new Set(["BTC", "ETH", "Stablecoins"]);
const RE_ASSETS = new Set(["Office REITs"]);

export function classifyPositioning(item: { asset: string }): AssetScope[] {
  if (EQUITIES_ASSETS.has(item.asset)) return ["equities"];
  if (CRYPTO_ASSETS.has(item.asset)) return ["crypto"];
  if (RE_ASSETS.has(item.asset)) return ["real-estate"];
  return ["global"];
}

const EQUITIES_NARRATIVES = new Set(["Soft Landing", "AI Bubble", "Rate Cut Rally", "Stagflation Risk"]);
const CRYPTO_NARRATIVES = new Set(["Crypto Supercycle"]);
const RE_NARRATIVES = new Set(["CRE Apocalypse"]);

export function classifyNarrative(item: { label: string }): AssetScope[] {
  if (EQUITIES_NARRATIVES.has(item.label)) return ["equities"];
  if (CRYPTO_NARRATIVES.has(item.label)) return ["crypto"];
  if (RE_NARRATIVES.has(item.label)) return ["real-estate"];
  return ["global"];
}

const EQUITIES_DOMAINS = new Set(["Consumer", "Logistics"]);
const RE_DOMAINS = new Set(["Housing"]);
const MACRO_DOMAINS = new Set(["Labor", "Energy"]);

export function classifyRealitySignal(item: { domain: string }): AssetScope[] {
  if (EQUITIES_DOMAINS.has(item.domain)) return ["equities"];
  if (RE_DOMAINS.has(item.domain)) return ["real-estate"];
  if (MACRO_DOMAINS.has(item.domain)) return ["equities", "real-estate", "crypto"];
  return ["global"];
}

const EQUITIES_METRICS = new Set(["CPI YoY", "Core PCE", "Nonfarm Payrolls", "PMI Mfg"]);
const RE_METRICS = new Set(["Housing Starts", "CMBS Delinq."]);

export function classifyDataSignal(item: { metric: string }): AssetScope[] {
  if (EQUITIES_METRICS.has(item.metric)) return ["equities"];
  if (RE_METRICS.has(item.metric)) return ["real-estate"];
  return ["global"];
}

const EQUITIES_MISMATCH = new Set(["Consumer Health", "Labor Market", "Rate Path"]);
const RE_MISMATCH = new Set(["Office CRE"]);
const CRYPTO_MISMATCH = new Set(["Crypto Cycle"]);

export function classifyMismatch(item: { topic: string }): AssetScope[] {
  if (EQUITIES_MISMATCH.has(item.topic)) return ["equities"];
  if (RE_MISMATCH.has(item.topic)) return ["real-estate"];
  if (CRYPTO_MISMATCH.has(item.topic)) return ["crypto"];
  return ["global"];
}
