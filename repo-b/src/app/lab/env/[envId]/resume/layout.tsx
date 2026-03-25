import { DomainEnvProvider } from "@/components/domain/DomainEnvProvider";
import DomainWorkspaceShell from "@/components/domain/DomainWorkspaceShell";
import { isAdminSession } from "@/lib/server/sessionRole";

export default async function ResumeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  const domain = "resume" as const;
  return (
    <DomainEnvProvider domain={domain} envId={envId}>
      <DomainWorkspaceShell envId={envId} domain={domain} isAdmin={isAdminSession()}>
        {children}
      </DomainWorkspaceShell>
    </DomainEnvProvider>
  );
}
