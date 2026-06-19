"use client";

import type { AlgorithmResult } from "@/lib/historyrhymes/mlDemo";
import type { DrawerPayload } from "./MLDetailDrawer";
import {
  ActualVsPredictedChart,
  BarSeriesChart,
  ConfusionMatrix,
  Dendrogram,
  ExplainedVarianceChart,
  PcaScatterChart,
  RocCurveChart,
  SimpleTable,
} from "./mlCharts";
import { fmt } from "./mlUi";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">{title}</div>
      {children}
    </div>
  );
}

export function AlgorithmChartPanel({
  result,
  onDrill,
}: {
  result: AlgorithmResult;
  onDrill: (p: DrawerPayload) => void;
}) {
  const charts = result.charts as Record<string, unknown>;
  const links = result.external_links;
  const lineage = result.lineage;
  const blocks: React.ReactNode[] = [];

  if (Array.isArray(charts.actual_vs_predicted)) {
    const pts = charts.actual_vs_predicted as Array<{ actual: number; predicted: number; residual?: number }>;
    blocks.push(
      <Block key="avp" title="Actual vs predicted (click a point)">
        <ActualVsPredictedChart
          points={pts}
          onPointClick={(p) =>
            onDrill({
              mode: "prediction",
              title: "Prediction detail",
              subtitle: `${result.name}`,
              whyItMatters: "Large residuals show where the model is confidently wrong.",
              rows: [
                { label: "Actual", value: fmt(Number(p.actual)) },
                { label: "Predicted", value: fmt(Number(p.predicted)) },
                { label: "Residual", value: fmt(Number(p.actual) - Number(p.predicted)) },
              ],
              links,
              lineage,
            })
          }
        />
      </Block>,
    );
  }

  if (Array.isArray(charts.coefficient_bar)) {
    blocks.push(
      <Block key="coef" title="Coefficients (click a feature)">
        <BarSeriesChart
          data={charts.coefficient_bar as Array<Record<string, number | string>>}
          labelKey="feature"
          valueKey="coefficient"
          onBarClick={(d) => onDrill(featureDrill(String(d.feature), result))}
        />
      </Block>,
    );
  }

  if (Array.isArray(charts.feature_importance)) {
    blocks.push(
      <Block key="imp" title="Feature importance (click a feature)">
        <BarSeriesChart
          data={charts.feature_importance as Array<Record<string, number | string>>}
          labelKey="feature"
          valueKey="importance"
          onBarClick={(d) => onDrill(featureDrill(String(d.feature), result))}
        />
      </Block>,
    );
  } else if (charts.feature_importance_note) {
    blocks.push(
      <div key="impnote" className="text-[11px] text-neutral-500">{String(charts.feature_importance_note)}</div>,
    );
  }

  const cm = charts.confusion_matrix as { cells?: Record<string, number>; labels: string[]; matrix: number[][] } | undefined;
  if (cm?.cells) {
    blocks.push(
      <Block key="cm" title="Confusion matrix (click a cell)">
        <ConfusionMatrix
          cells={cm.cells as never}
          labels={cm.labels}
          onCellClick={(kind) =>
            onDrill({
              mode: "metric",
              title: `${kind.replace(/_/g, " ")} records`,
              subtitle: result.name,
              whyItMatters:
                kind === "false_negative"
                  ? "False negatives are missed risk events — the costliest error in this demo."
                  : "Filtered held-out records in this confusion cell.",
              rows: [{ label: "Count", value: String(cm.cells![kind]) }],
              links,
            })
          }
        />
      </Block>,
    );
  } else if (cm?.matrix) {
    const rows = cm.labels.map((lab, i) => {
      const row: Record<string, unknown> = { actual: lab };
      cm.labels.forEach((c, j) => (row[c] = cm.matrix[i][j]));
      return row;
    });
    blocks.push(
      <Block key="cmm" title="Confusion matrix">
        <SimpleTable columns={[{ key: "actual", label: "actual ↓" }, ...cm.labels.map((l) => ({ key: l, label: l }))]} rows={rows} />
      </Block>,
    );
  }

  if (Array.isArray(charts.roc_curve) && (charts.roc_curve as unknown[]).length > 0) {
    blocks.push(
      <Block key="roc" title="ROC curve">
        <RocCurveChart points={charts.roc_curve as Array<{ fpr: number; tpr: number }>} />
      </Block>,
    );
  }

  if (Array.isArray(charts.neighbor_table)) {
    const nbrs = charts.neighbor_table as Array<Record<string, unknown>>;
    const rows = nbrs.map((n) => ({
      test_index: n.test_index,
      true_label: n.true_label,
      neighbor_vote_positive: n.neighbor_vote_positive,
      k: n.k,
    }));
    blocks.push(
      <Block key="nbr" title="Nearest neighbors (click a row)">
        <SimpleTable
          columns={[
            { key: "test_index", label: "Test #" },
            { key: "true_label", label: "True" },
            { key: "neighbor_vote_positive", label: "+ votes" },
            { key: "k", label: "k" },
          ]}
          rows={rows}
          onRowClick={(row) =>
            onDrill({
              mode: "observation",
              title: `Neighbor analog — test #${row.test_index}`,
              subtitle: "KNN nearest-neighbor vote",
              whyItMatters:
                "KNN is the simple nearest-neighbor baseline. History Rhymes is the governed analog engine: pgvector retrieval, Rhyme Score, DTW refinement, divergence analysis, and trap detection.",
              rows: [
                { label: "True label", value: String(row.true_label) },
                { label: "Positive neighbor votes", value: String(row.neighbor_vote_positive) },
              ],
              links,
            })
          }
        />
      </Block>,
    );
  }

  if (Array.isArray(charts.pca_scatter)) {
    const pts = charts.pca_scatter as Array<Record<string, number | string>>;
    const colorKey = "cluster" in (pts[0] ?? {}) ? "cluster" : "regime_label";
    blocks.push(
      <Block key="pca" title="PCA projection (click a point)">
        <PcaScatterChart
          points={pts}
          colorKey={colorKey}
          onPointClick={(p) =>
            onDrill({
              mode: "observation",
              title: "Observation detail",
              subtitle: result.name,
              rows: [
                { label: "PC1", value: fmt(Number(p.pc1)) },
                { label: "PC2", value: fmt(Number(p.pc2)) },
                { label: colorKey, value: String(p[colorKey]) },
              ],
              links,
              lineage,
            })
          }
        />
      </Block>,
    );
  }

  if (Array.isArray(charts.explained_variance_bar)) {
    blocks.push(
      <Block key="evr" title="Explained variance">
        <ExplainedVarianceChart data={charts.explained_variance_bar as Array<{ component: string; ratio: number; cumulative: number }>} />
        <p className="text-[10px] text-neutral-600 mt-1">Variance is not importance — rare risk signal can hide in low-variance components.</p>
      </Block>,
    );
  }

  if (Array.isArray(charts.loadings)) {
    blocks.push(
      <Block key="load" title="Top loadings (PC1)">
        <BarSeriesChart
          data={(charts.loadings as Array<Record<string, number | string>>).slice().sort((a, b) => Math.abs(Number(b.pc1)) - Math.abs(Number(a.pc1)))}
          labelKey="feature"
          valueKey="pc1"
          onBarClick={(d) => onDrill(featureDrill(String(d.feature), result))}
        />
      </Block>,
    );
  }

  if (Array.isArray(charts.top_tokens)) {
    const tt = charts.top_tokens as Array<{ theme: string; tokens: string[] }>;
    blocks.push(
      <Block key="tok" title="Indicative tokens per theme (click a theme)">
        <SimpleTable
          columns={[{ key: "theme", label: "Theme" }, { key: "tokens", label: "Top tokens" }]}
          rows={tt.map((t) => ({ theme: t.theme, tokens: t.tokens.join(", ") }))}
          onRowClick={(row) =>
            onDrill({
              mode: "feature",
              title: `Theme: ${row.theme}`,
              subtitle: "Naive Bayes indicative tokens",
              rows: [{ label: "Top tokens", value: String(row.tokens) }],
              links,
            })
          }
        />
      </Block>,
    );
  }

  if (charts.cluster_profiles && Array.isArray(charts.cluster_profiles)) {
    const cp = charts.cluster_profiles as Array<Record<string, unknown>>;
    blocks.push(
      <Block key="cp" title="Cluster profiles (click a cluster)">
        <SimpleTable
          columns={[
            { key: "cluster", label: "Cluster" },
            { key: "size", label: "Size" },
            { key: "dominant_regime", label: "Dominant regime" },
            { key: "risk_event_rate", label: "Risk rate" },
          ]}
          rows={cp}
          onRowClick={(row) =>
            onDrill({
              mode: "cluster",
              title: `Cluster ${row.cluster}`,
              subtitle: result.name,
              rows: [
                { label: "Size", value: String(row.size) },
                { label: "Dominant regime", value: String(row.dominant_regime) },
                { label: "Risk-event rate", value: String(row.risk_event_rate) },
              ],
              links,
            })
          }
        />
      </Block>,
    );
  }

  if (charts.dendrogram) {
    blocks.push(
      <Block key="dnd" title="Cluster hierarchy">
        <Dendrogram node={charts.dendrogram as never} />
      </Block>,
    );
  }

  if (blocks.length === 0) {
    return <div className="text-xs text-neutral-500">No charts available for this model.</div>;
  }
  return <div className="space-y-4">{blocks}</div>;
}

function featureDrill(feature: string, result: AlgorithmResult): DrawerPayload {
  return {
    mode: "feature",
    title: `Feature: ${feature}`,
    subtitle: result.name,
    whyItMatters: "Feature definition, source table, and importance across models.",
    rows: [{ label: "Feature", value: feature }],
    links: result.external_links,
    lineage: result.lineage,
  };
}
