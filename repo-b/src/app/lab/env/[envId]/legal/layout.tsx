import { DomainEnvProvider } from "@/components/domain/DomainEnvProvider";
import DomainWorkspaceShell from "@/components/domain/DomainWorkspaceShell";

export default async function LegalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return (
    <DomainEnvProvider domain="legal" envId={envId}>
      <DomainWorkspaceShell envId={envId} domain="legal">
        {children}
      </DomainWorkspaceShell>
    </DomainEnvProvider>
  );
}
