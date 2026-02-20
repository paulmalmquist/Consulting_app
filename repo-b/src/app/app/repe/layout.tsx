import RepeWorkspaceShell from "@/components/repe/workspace/RepeWorkspaceShell";

export default function RepeLayout({ children }: { children: React.ReactNode }) {
  return <RepeWorkspaceShell>{children}</RepeWorkspaceShell>;
}
