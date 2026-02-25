import { DomainEnvProvider } from "@/components/domain/DomainEnvProvider";
import DomainWorkspaceShell from "@/components/domain/DomainWorkspaceShell";

export default async function MedicalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return (
    <DomainEnvProvider domain="medical" envId={envId}>
      <DomainWorkspaceShell envId={envId} domain="medical">
        {children}
      </DomainWorkspaceShell>
    </DomainEnvProvider>
  );
}
