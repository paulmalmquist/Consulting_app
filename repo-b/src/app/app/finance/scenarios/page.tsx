export default function ScenarioLabPage() {
  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-bold">Finance Scenario Lab</h1>
      <p className="text-sm text-bm-muted">
        Snapshot and simulation APIs are active at `/api/fin/v1/partitions/*/snapshot` and
        `/api/fin/v1/simulations` with diff support.
      </p>
    </div>
  );
}
