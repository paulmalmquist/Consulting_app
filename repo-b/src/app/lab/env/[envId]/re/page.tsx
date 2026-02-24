import { redirect } from "next/navigation";

export default async function ReIndexPage({
  params,
}: {
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  redirect(`/lab/env/${envId}/re/portfolio`);
}
