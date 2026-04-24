import { AlteredMindWeekDetail } from "@/components/altered-mind/AlteredMindWeekDetail";

export default async function AlteredMindWeekPage({
  params,
}: {
  params: Promise<{ envId: string; date: string }>;
}) {
  const { envId, date } = await params;
  return <AlteredMindWeekDetail envId={envId} date={date} />;
}
