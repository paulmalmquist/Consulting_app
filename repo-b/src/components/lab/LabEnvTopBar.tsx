"use client";
import { usePathname } from "next/navigation";
import Breadcrumbs from "./Breadcrumbs";
import WorkspaceIdentityBar from "./WorkspaceIdentityBar";

export default function LabEnvTopBar({ envId }: { envId: string }) {
  const pathname = usePathname();
  if (/\/consulting\/pipeline(\/|$)/.test(pathname)) return null;
  if (/\/re(\/|$)/.test(pathname)) return null;
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-2 px-4 pt-3 lg:px-6">
      <WorkspaceIdentityBar envId={envId} />
      <Breadcrumbs envId={envId} />
    </div>
  );
}
