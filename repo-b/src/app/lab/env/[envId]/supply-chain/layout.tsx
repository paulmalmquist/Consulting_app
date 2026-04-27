import SupplyChainShell from "@/components/supply-chain/SupplyChainShell";

export default async function SupplyChainLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <SupplyChainShell envId={envId}>{children}</SupplyChainShell>;
}
