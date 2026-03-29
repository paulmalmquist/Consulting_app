import { DomainEnvProvider } from "@/components/domain/DomainEnvProvider";
import DomainWorkspaceShell from "@/components/domain/DomainWorkspaceShell";

export default async function DomainLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  const domain = "legal" as const;
  return (
    <DomainEnvProvider domain={domain} envId={envId}>
      <DomainWorkspaceShell envId={envId} domain={domain}>
        {children}
      </DomainWorkspaceShell>
    </DomainEnvProvider>
  );
}
