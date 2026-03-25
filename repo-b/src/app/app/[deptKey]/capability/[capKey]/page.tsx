import CapabilityPageClient from "./CapabilityPageClient";
import { getCapabilityParams } from "@/lib/static-routes";

export function generateStaticParams() {
  return getCapabilityParams();
}

export default function CapabilityPage({
  params,
}: {
  params: { deptKey: string; capKey: string };
}) {
  return <CapabilityPageClient deptKey={params.deptKey} capKey={params.capKey} />;
}
