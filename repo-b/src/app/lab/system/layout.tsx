import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/server/sessionRole";

export default function SystemLayout({ children }: { children: React.ReactNode }) {
  if (!isAdminSession()) {
    redirect("/app");
  }
  return <>{children}</>;
}
