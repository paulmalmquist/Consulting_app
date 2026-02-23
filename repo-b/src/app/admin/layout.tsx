import { EnvProvider } from "@/components/EnvProvider";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <EnvProvider>
      <AdminShell>{children}</AdminShell>
    </EnvProvider>
  );
}
