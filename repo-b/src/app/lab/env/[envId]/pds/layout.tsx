import { DomainEnvProvider } from "@/components/domain/DomainEnvProvider";
import PdsEnterpriseShell from "@/components/pds-enterprise/PdsEnterpriseShell";
import { isAdminSession } from "@/lib/server/sessionRole";

export default async function DomainLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  const domain = "pds" as const;
  return (
    <DomainEnvProvider domain={domain} envId={envId}>
      <PdsEnterpriseShell envId={envId} isAdmin={isAdminSession()}>
        {children}
      </PdsEnterpriseShell>
    </DomainEnvProvider>
  );
}
