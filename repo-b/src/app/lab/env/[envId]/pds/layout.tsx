import { DomainEnvProvider } from "@/components/domain/DomainEnvProvider";
import DomainWorkspaceShell from "@/components/domain/DomainWorkspaceShell";

export default async function PdsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return (
    <DomainEnvProvider domain="pds" envId={envId}>
      <DomainWorkspaceShell envId={envId} domain="pds">
        {children}
      </DomainWorkspaceShell>
    </DomainEnvProvider>
  );
}
