import { redirect } from "next/navigation";

export default function ConsultingAccountsRedirectPage({
  params,
}: {
  params: { envId: string };
}) {
  redirect(`/lab/env/${params.envId}/operator/accounting`);
}
