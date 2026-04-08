import { DomainEnvProvider } from "@/components/domain/DomainEnvProvider";
import OperatorShell from "@/components/operator/OperatorShell";

export default async function OperatorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  const domain = "operator" as const;

  return (
    <DomainEnvProvider domain={domain} envId={envId}>
      <OperatorShell envId={envId}>{children}</OperatorShell>
    </DomainEnvProvider>
  );
}
