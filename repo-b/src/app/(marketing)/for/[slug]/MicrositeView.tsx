"use client";

import { useEffect, useRef, useState } from "react";
import { FirmHeader } from "@/components/marketing/personalizer/FirmHeader";
import { InsightCards } from "@/components/marketing/personalizer/InsightCards";
import { LoomEmbed } from "@/components/marketing/personalizer/LoomEmbed";
import { CtaButton } from "@/components/marketing/personalizer/CtaButton";
import {
  getMicrosite,
  trackMicrosite,
  type MicrositePayload,
} from "@/lib/outreach-personalizer-api";

type ViewState =
  | { kind: "loading" }
  | { kind: "not_available" }
  | { kind: "not_ready"; firmName: string }
  | { kind: "ready"; data: Extract<MicrositePayload, { ready: true }> };

function FailClosed({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      <p className="mt-3 text-sm text-white/55">{body}</p>
      <a
        href="https://novendor.ai"
        className="mt-6 text-xs font-medium text-sky-300 hover:text-sky-200"
      >
        novendor.ai
      </a>
    </main>
  );
}

export function MicrositeView({ slug }: { slug: string }) {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const trackedView = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getMicrosite(slug);
        if (cancelled) return;
        if (!data.ready) {
          setState({ kind: "not_ready", firmName: data.firm.name });
          return;
        }
        setState({ kind: "ready", data });
        if (!trackedView.current) {
          trackedView.current = true;
          void trackMicrosite(slug, "microsite_view").catch(() => {});
        }
      } catch {
        if (!cancelled) setState({ kind: "not_available" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state.kind === "loading") {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-6">
        <p className="text-sm text-white/40">Loading…</p>
      </main>
    );
  }

  if (state.kind === "not_available") {
    return (
      <FailClosed
        title="This page isn't available"
        body="The link may be inactive or the page hasn't been published yet."
      />
    );
  }

  if (state.kind === "not_ready") {
    return (
      <FailClosed
        title={`${state.firmName}'s page is being prepared`}
        body="We're putting the finishing touches on this. Check back shortly."
      />
    );
  }

  const { data } = state;
  const accent = data.styling.accent_hsl;

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24">
      <FirmHeader
        name={data.firm.name}
        logoUrl={data.firm.logo_url}
        accentHsl={accent}
      />

      <div className="space-y-14">
        <InsightCards insights={data.insights} accentHsl={accent} />

        <LoomEmbed url={data.loom.url} state={data.loom.state} />

        {data.cold_email_preview.body ? (
          <section className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-7">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/45">
              The note we&apos;d send
            </p>
            {data.cold_email_preview.subject ? (
              <p className="mt-3 text-sm font-semibold text-white">
                {data.cold_email_preview.subject}
              </p>
            ) : null}
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/65">
              {data.cold_email_preview.body}
            </p>
          </section>
        ) : null}

        <CtaButton
          label={data.cta.label}
          href={data.cta.href}
          accentHsl={accent}
          onTrack={() => {
            void trackMicrosite(slug, "microsite_cta", {
              cta_kind: data.cta.kind,
            }).catch(() => {});
          }}
        />
      </div>
    </main>
  );
}
