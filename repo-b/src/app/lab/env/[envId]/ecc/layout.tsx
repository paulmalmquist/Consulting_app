import EccShell from "@/components/ecc/EccShell";

export default async function EccLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <EccShell envId={envId}>{children}</EccShell>;
}
