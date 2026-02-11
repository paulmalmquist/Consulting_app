import { redirect } from "next/navigation";
import { deptRoute } from "@/lib/lab/deptRouting";

export default function LegacyLabDepartmentPage({
  params,
}: {
  params: { envId: string; deptKey: string };
}) {
  redirect(deptRoute(params.envId, params.deptKey));
}
