import { redirect } from "next/navigation";

export default async function WinstonAliasPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  redirect(`/lab/env/${envId}/copilot`);
}
