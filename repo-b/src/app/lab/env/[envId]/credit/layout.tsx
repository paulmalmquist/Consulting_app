import { DomainEnvProvider } from "@/components/domain/DomainEnvProvider";
import DomainWorkspaceShell from "@/components/domain/DomainWorkspaceShell";

export default async function CreditLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return (
    <DomainEnvProvider domain="credit" envId={envId}>
      <DomainWorkspaceShell envId={envId} domain="credit">
        {children}
      </DomainWorkspaceShell>
    </DomainEnvProvider>
  );
}
