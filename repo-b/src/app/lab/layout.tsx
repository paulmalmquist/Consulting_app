import AppShell from "@/components/AppShell";
import { EnvProvider } from "@/components/EnvProvider";
import { isAdminSession } from "@/lib/server/sessionRole";

export default function LabLayout({ children }: { children: React.ReactNode }) {
  const adminSession = isAdminSession();

  return (
    <EnvProvider>
      <AppShell isAdmin={adminSession}>{children}</AppShell>
    </EnvProvider>
  );
}
