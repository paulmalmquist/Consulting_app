import AppShell from "@/components/AppShell";
import { EnvProvider } from "@/components/EnvProvider";

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <EnvProvider>
      <AppShell>{children}</AppShell>
    </EnvProvider>
  );
}
