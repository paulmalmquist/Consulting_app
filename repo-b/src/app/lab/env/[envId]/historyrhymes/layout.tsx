import HistoryRhymesShell from "@/components/historyrhymes/cockpit/HistoryRhymesShell";

// Full-bleed History Rhymes regime cockpit. The lab shell yields full-bleed
// for /historyrhymes (isDomainRoute), and HistoryRhymesShell carries the dark
// cockpit palette inline, so no theme pinning is needed here.
export default async function HistoryRhymesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <HistoryRhymesShell envId={envId}>{children}</HistoryRhymesShell>;
}
