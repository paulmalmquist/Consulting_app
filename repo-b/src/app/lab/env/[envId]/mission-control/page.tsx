// Full-bleed Mission Control wall. The lab shell yields full-bleed for /mission-control
// (added to isDomainRoute), and MissionControlWall carries the RS dark palette inline, so
// no theme pinning is needed here. Composition only — no new backend.
import MissionControlWall from "@/components/mission-control/MissionControlWall";

export default async function MissionControlPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <MissionControlWall envId={envId} />;
}
