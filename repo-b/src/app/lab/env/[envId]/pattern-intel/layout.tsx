import { DomainEnvProvider } from "@/components/domain/DomainEnvProvider";
import DomainWorkspaceShell from "@/components/domain/DomainWorkspaceShell";

export default async function PatternIntelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  const domain = "pattern-intel" as const;
  return (
    <DomainEnvProvider domain={domain} envId={envId}>
      <DomainWorkspaceShell envId={envId} domain={domain}>
        {children}
      </DomainWorkspaceShell>
    </DomainEnvProvider>
  );
}
