import Link from "next/link";
import { cookies } from "next/headers";
import fs from "node:fs";
import path from "node:path";
import { Archive, CheckCircle2, LockKeyhole } from "lucide-react";
import { HAPPYCO_COOKIE_NAME } from "@/lib/happyco/proof";
import { HAPPYCO_ARTIFACTS, HAPPYCO_VIEW_BUNDLES } from "@/lib/happyco/artifacts";

function artifactExists(relativePath: string) {
  return fs.existsSync(path.resolve(process.cwd(), relativePath));
}

function LockedArtifacts() {
  return (
    <main className="min-h-screen bg-[#FBFAF7] px-5 py-12 text-[#241437]">
      <div className="mx-auto flex min-h-[70vh] max-w-4xl flex-col justify-center">
        <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-[#DDD8EA] bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#35146B]">
          <LockKeyhole className="h-4 w-4" /> Gated artifact hub
        </div>
        <div className="rounded-[34px] border border-[#DDD8EA] bg-white p-8 shadow-sm">
          <h1 className="text-4xl font-black tracking-tight text-[#35146B]">HappyCo artifact access required.</h1>
          <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-[#4D426A]">
            Unlock the HappyCo package first. Artifacts are not exposed from public static URLs.
          </p>
          <Link href="/happyco" className="mt-6 inline-flex rounded-2xl bg-[#35146B] px-5 py-3 text-sm font-black text-white hover:bg-[#5430C0]">
            Unlock HappyCo package
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function HappyCoArtifactsPage() {
  const unlocked = cookies().get(HAPPYCO_COOKIE_NAME)?.value === "granted";
  if (!unlocked) return <LockedArtifacts />;

  const rows = HAPPYCO_ARTIFACTS.map((artifact) => ({ ...artifact, available: artifactExists(artifact.relativePath) }));
  const viewBundles = HAPPYCO_VIEW_BUNDLES.map((bundle) => ({ ...bundle, available: artifactExists(bundle.checkPath) }));

  return (
    <main className="min-h-screen bg-[#FBFAF7] text-[#241437]">
      <section className="mx-auto max-w-[1600px] px-5 py-8 xl:px-8">
        <div className="rounded-[34px] border border-[#DDD8EA] bg-[#C6F4DF] p-7 lg:p-9">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#35146B]">HappyCo gated artifact hub</div>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-[#35146B] sm:text-6xl">Artifact Access</h1>
              <p className="mt-4 max-w-4xl text-base font-semibold leading-7 text-[#241437]">
                Manifest-first access for the proof package. Downloads are shown only when the file exists server-side and can stream through the gated API.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/happyco/demo" className="rounded-2xl bg-[#35146B] px-5 py-3 text-sm font-black text-white hover:bg-[#5430C0]">Open clean demo</Link>
              <Link href="/happyco" className="rounded-2xl border border-[#35146B]/20 bg-white px-5 py-3 text-sm font-black text-[#35146B] hover:bg-[#F5F1FF]">Back to package</Link>
            </div>
          </div>
        </div>

        {viewBundles.map((bundle) => (
          <section key={bundle.key} className="mt-6 rounded-[28px] border border-[#B9EFD8] bg-gradient-to-br from-[#E8FFF5] to-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${bundle.available ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
                  {bundle.available ? "Available" : "Not available"}
                </span>
                <h2 className="mt-3 text-2xl font-black text-[#35146B]">{bundle.title}</h2>
                <div className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-[#6F6590]">{bundle.kind}</div>
                <p className="mt-3 text-sm font-semibold leading-6 text-[#4D426A]">{bundle.description}</p>
                <div className="mt-3 rounded-2xl bg-white/70 p-3 text-xs font-bold leading-5 text-[#6F6590]">{bundle.caveat}</div>
              </div>
              <Link href={bundle.viewHref} className="rounded-2xl bg-[#35146B] px-5 py-3 text-sm font-black text-white hover:bg-[#5430C0]">
                View weather-risk intelligence
              </Link>
            </div>
          </section>
        ))}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((artifact) => (
            <section key={artifact.key} className="rounded-[28px] border border-[#DDD8EA] bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <Archive className="h-6 w-6 text-[#5430C0]" />
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${artifact.available ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>{artifact.available ? "Gated download ready" : "Local/private"}</span>
              </div>
              <div className="mt-4 text-xl font-black text-[#35146B]">{artifact.title}</div>
              <div className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-[#6F6590]">{artifact.kind}</div>
              <p className="mt-3 text-sm font-semibold leading-6 text-[#4D426A]">{artifact.description}</p>
              <div className="mt-4 rounded-2xl bg-[#FBFAF7] p-3 text-xs font-bold leading-5 text-[#6F6590]">{artifact.caveat}</div>
              {artifact.available ? (
                <a href={`/api/happyco/artifacts/${artifact.key}`} className="mt-4 inline-flex rounded-2xl bg-[#35146B] px-4 py-2 text-sm font-black text-white hover:bg-[#5430C0]">
                  Download through gate
                </a>
              ) : (
                <div className="mt-4 inline-flex rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-black text-amber-900">
                  Local/private artifact available; upload to gated storage pending
                </div>
              )}
            </section>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-[#DDD8EA] bg-white p-5 text-sm font-semibold leading-6 text-[#4D426A]">
          <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-700" /> No artifacts are served from public static paths. The API route uses an allowlist and the same invite cookie.
        </div>
      </section>
    </main>
  );
}
