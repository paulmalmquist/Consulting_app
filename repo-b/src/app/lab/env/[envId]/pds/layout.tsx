import { DomainEnvProvider } from "@/components/domain/DomainEnvProvider";
import PdsEnterpriseShell from "@/components/pds-enterprise/PdsEnterpriseShell";

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
      <PdsEnterpriseShell envId={envId}>
        {children}
      </PdsEnterpriseShell>
    </DomainEnvProvider>
  );
}
