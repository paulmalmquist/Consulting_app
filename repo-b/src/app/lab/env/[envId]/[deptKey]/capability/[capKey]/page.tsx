import { redirect } from "next/navigation";
import { capabilityRoute } from "@/lib/lab/deptRouting";

export default function LegacyLabCapabilityPage({
  params,
}: {
  params: { envId: string; deptKey: string; capKey: string };
}) {
  redirect(capabilityRoute(params.envId, params.deptKey, params.capKey));
}
