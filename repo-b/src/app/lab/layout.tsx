import AppShell from "@/components/AppShell";
import { EnvProvider } from "@/components/EnvProvider";
import { LabThemeProvider } from "@/components/lab/LabThemeProvider";

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <LabThemeProvider>
      <EnvProvider>
        <AppShell>{children}</AppShell>
      </EnvProvider>
    </LabThemeProvider>
  );
}
