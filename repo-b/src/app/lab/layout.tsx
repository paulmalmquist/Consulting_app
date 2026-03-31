import AppShell from "@/components/AppShell";
import { EnvProvider } from "@/components/EnvProvider";
import { BusinessProvider } from "@/lib/business-context";

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <EnvProvider>
      <BusinessProvider>
        <AppShell>{children}</AppShell>
      </BusinessProvider>
    </EnvProvider>
  );
}
