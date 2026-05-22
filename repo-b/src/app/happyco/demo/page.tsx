import Link from "next/link";
import { cookies } from "next/headers";
import { LockKeyhole } from "lucide-react";
import { HappyCoDemoClient } from "@/components/happyco/HappyCoDemoClient";
import { HAPPYCO_COOKIE_NAME, HAPPYCO_DEMO_ENV_ID } from "@/lib/happyco/proof";

function LockedDemo() {
  return (
    <main className="min-h-screen bg-[#FBFAF7] px-5 py-12 text-[#241437]">
      <div className="mx-auto flex min-h-[70vh] max-w-4xl flex-col justify-center">
        <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-[#DDD8EA] bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#35146B]">
          <LockKeyhole className="h-4 w-4" /> Gated clean demo
        </div>
        <div className="rounded-[34px] border border-[#DDD8EA] bg-white p-8 shadow-sm">
          <h1 className="text-4xl font-black tracking-tight text-[#35146B]">HappyCo demo access required.</h1>
          <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-[#4D426A]">
            Unlock the HappyCo proof package first. The clean demo uses the same invite-code gate and does not render inside the Winston/Hall Boys shell.
          </p>
          <Link href="/happyco" className="mt-6 inline-flex rounded-2xl bg-[#35146B] px-5 py-3 text-sm font-black text-white hover:bg-[#5430C0]">
            Unlock HappyCo package
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function HappyCoDemoPage() {
  const unlocked = cookies().get(HAPPYCO_COOKIE_NAME)?.value === "granted";
  if (!unlocked) return <LockedDemo />;
  return <HappyCoDemoClient envId={HAPPYCO_DEMO_ENV_ID} />;
}
