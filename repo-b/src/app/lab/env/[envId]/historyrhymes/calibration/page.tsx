import { CalibrationStatus } from "@/components/historyrhymes/CalibrationStatus";

export default async function HistoryRhymesCalibrationPage() {
  return (
    <div
      data-testid="hr-calibration-page"
      className="min-h-screen bg-neutral-950 text-neutral-200 p-6"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-lg font-semibold text-neutral-100">
            History Rhymes — Calibration
          </h1>
          <p className="text-xs text-neutral-500">
            Agent calibration and prediction accuracy tracking.
          </p>
        </header>
        <CalibrationStatus />
      </div>
    </div>
  );
}
