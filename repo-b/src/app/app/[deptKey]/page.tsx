import { redirect } from "next/navigation";
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
  if (params.deptKey === "finance") {
    redirect("/app/finance/portfolio");
  }

  return <DepartmentLandingClient deptKey={params.deptKey} />;
}
