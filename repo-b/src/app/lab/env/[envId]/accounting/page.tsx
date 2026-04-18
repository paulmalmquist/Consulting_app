import CommandDeskShell from "@/components/accounting/CommandDeskShell";

export const dynamic = "force-dynamic";

export default async function AccountingCommandDeskPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return <CommandDeskShell envId={envId} />;
}
