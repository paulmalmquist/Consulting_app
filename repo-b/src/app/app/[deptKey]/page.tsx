import DepartmentLandingClient from "./DepartmentLandingClient";
import { DEPARTMENT_KEYS } from "@/lib/static-routes";

export function generateStaticParams() {
  return DEPARTMENT_KEYS.map((deptKey) => ({ deptKey }));
}

export default function DepartmentLandingPage({
  params,
}: {
  params: { deptKey: string };
}) {
  return <DepartmentLandingClient deptKey={params.deptKey} />;
}
