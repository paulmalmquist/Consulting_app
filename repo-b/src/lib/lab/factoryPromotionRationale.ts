// Derive why a registry version is (or is not) the champion, using only fields
// already present in the committed model_registry.json. This is DERIVED demo
// rationale — there is no separate human-approval record in the export, and we
// say so. Never fabricate gate results that aren't in the data.

import type { RegistryModel, RegistryVersion } from "@/lib/lab/factoryMlData";

export const RATIONALE_SOURCE =
  "Derived from exported registry metadata; no separate human approval record found.";

export type PromotionRationale = {
  whyChampion: string[];
  whyNotChampion: string[];
  source: string;
};

function fmt(metric: string, value: number): string {
  return `${metric} ${value.toFixed(3)}`;
}

export function derivePromotionRationale(
  model: RegistryModel,
  version: RegistryVersion,
): PromotionRationale {
  const champion = model.champion;
  const whyChampion: string[] = [];
  const whyNotChampion: string[] = [];

  if (version.is_champion) {
    whyChampion.push(`Current champion alias points to v${version.version}.`);
    const others = model.versions.filter((v) => v.version !== version.version);
    const best = others.reduce<RegistryVersion | null>(
      (acc, v) => (acc === null || v.primary_metric_value > acc.primary_metric_value ? v : acc),
      null,
    );
    if (best && version.primary_metric_value >= best.primary_metric_value) {
      whyChampion.push(
        `Highest ${version.primary_metric} among all versions ` +
          `(${fmt(version.primary_metric, version.primary_metric_value)} vs next ` +
          `${fmt(best.primary_metric, best.primary_metric_value)}).`,
      );
    }
    const archived = others.filter((v) => v.stage === "archived").length;
    if (archived > 0) {
      whyChampion.push(`Supersedes ${archived} archived version${archived === 1 ? "" : "s"}.`);
    }
  } else {
    if (champion) {
      const delta = champion.primary_metric_value - version.primary_metric_value;
      if (delta > 0) {
        whyNotChampion.push(
          `Lower ${version.primary_metric} than the current champion ` +
            `(${fmt(version.primary_metric, version.primary_metric_value)} vs ` +
            `${fmt(champion.primary_metric, champion.primary_metric_value)}, ` +
            `−${delta.toFixed(3)}).`,
        );
      } else if (delta === 0) {
        whyNotChampion.push(
          `Ties the champion on ${version.primary_metric} ` +
            `(${fmt(version.primary_metric, version.primary_metric_value)}) but is not the active alias.`,
        );
      }
      whyNotChampion.push(`Superseded by champion v${champion.version}.`);
    }
    if (version.stage === "archived") {
      whyNotChampion.push("Archived after the champion alias moved; retained for lineage.");
    }
  }

  return { whyChampion, whyNotChampion, source: RATIONALE_SOURCE };
}
