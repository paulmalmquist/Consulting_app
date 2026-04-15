import Breadcrumbs from "@/components/lab/Breadcrumbs";
import LabEnvironmentShell from "@/components/lab/LabEnvironmentShell";
import WorkspaceIdentityBar from "@/components/lab/WorkspaceIdentityBar";

export default async function LabEnvironmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;

  // Identity + breadcrumbs live at the layout boundary so they render on
  // every route under /lab/env/{envId}/..., including domain-vertical
  // routes where the shell early-returns `<>{children}</>`.
  return (
    <>
      <div className="mx-auto w-full max-w-[1600px] space-y-2 px-4 pt-3 lg:px-6">
        <WorkspaceIdentityBar envId={envId} />
        <Breadcrumbs envId={envId} />
      </div>
      <LabEnvironmentShell envId={envId}>{children}</LabEnvironmentShell>
    </>
  );
}
