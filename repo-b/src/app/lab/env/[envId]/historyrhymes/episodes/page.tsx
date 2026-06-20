import { EpisodesExplorer } from "@/components/historyrhymes/EpisodesExplorer";

export default async function HistoryRhymesEpisodesPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  await params; // envId available if needed for future server-side filtering
  return (
    <div
      data-testid="hr-episodes-page"
      className="min-h-screen bg-neutral-950 text-neutral-200 p-6"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-lg font-semibold text-neutral-100">
            History Rhymes — Episodes
          </h1>
          <p className="text-xs text-neutral-500">
            Historical reference episodes used in analog matching. Click a row to
            see details and evidence links.
          </p>
        </header>
        <EpisodesExplorer />
      </div>
    </div>
  );
}
