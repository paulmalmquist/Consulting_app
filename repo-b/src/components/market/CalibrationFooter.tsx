"use client";

type CalibrationPoint = {
  avg_brier?: number | string | null;
};

type CalibrationFooterProps = {
  brierHistory?: CalibrationPoint[] | null;
  agents?: unknown[] | null;
  predictions?: unknown[] | null;
};

export function CalibrationFooter({
  brierHistory = [],
  agents = [],
  predictions = [],
}: CalibrationFooterProps) {
  const safeBrierHistory = brierHistory ?? [];
  const safeAgents = agents ?? [];
  const safePredictions = predictions ?? [];
  const latestBrier = safeBrierHistory.at(-1);
  const avgBrier =
    latestBrier && typeof latestBrier.avg_brier === "number"
      ? latestBrier.avg_brier.toFixed(3)
      : typeof latestBrier?.avg_brier === "string"
        ? Number(latestBrier.avg_brier).toFixed(3)
        : "—";

  return (
    <div className="rounded border border-gray-200 bg-white/70 px-4 py-3 text-xs text-gray-600 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <span className="font-mono uppercase tracking-wider text-gray-500">
          Calibration
        </span>
        <span>{safeAgents.length} agents tracked</span>
        <span>{safePredictions.length} recent predictions</span>
        <span>Latest avg brier: {avgBrier}</span>
      </div>
    </div>
  );
}
