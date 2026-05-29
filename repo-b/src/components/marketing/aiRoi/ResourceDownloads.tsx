"use client";

import React, { FormEvent, useState } from "react";

type Asset = {
  slug: string;
  title: string;
  description: string;
  href: string;
};

const ASSETS: Asset[] = [
  {
    slug: "reframing-one-pager",
    title: "AI ROI reframing one-pager",
    description: "A short buyer-facing summary of the multiplier model and the assessment path.",
    href: "/assets/ai-roi/ai-roi-reframing-one-pager.pdf",
  },
  {
    slug: "framework-one-pager",
    title: "Assessment framework one-pager",
    description: "The four-part diagnostic scope: baseline, workflow value, controls, and verification.",
    href: "/assets/ai-roi/ai-roi-framework-one-pager.pdf",
  },
];

type SubmitState = "idle" | "posting" | "created" | "error";

export function ResourceDownloads() {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitReason, setSubmitReason] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAsset) return;
    setSubmitState("posting");
    setSubmitReason("");
    const response = await fetch("/api/public/ai-roi-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        company_name: companyName || undefined,
        source: `ai_roi_resource_${selectedAsset.slug}`,
        payload_json: { asset: selectedAsset.slug },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSubmitState("error");
      setSubmitReason(String(payload.reason || payload.error || "Submission failed."));
      return;
    }

    setSubmitState("created");
    const link = document.createElement("a");
    link.href = selectedAsset.href;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
      <section className="grid gap-4">
        {ASSETS.map((asset) => (
          <article key={asset.slug} className="nv-card nv-card-pad">
            <p className="nv-eyebrow">PDF</p>
            <h2 className="nv-h3" style={{ marginTop: 8 }}>{asset.title}</h2>
            <p className="nv-body" style={{ marginTop: 10 }}>{asset.description}</p>
            <button
              type="button"
              className="nv-btn nv-btn-primary"
              onClick={() => {
                setSelectedAsset(asset);
                setSubmitState("idle");
                setSubmitReason("");
              }}
            >
              Download
            </button>
          </article>
        ))}
      </section>

      <aside className="nv-card nv-card-pad h-fit space-y-4">
        <div>
          <p className="nv-eyebrow">Access</p>
          <h2 className="nv-h3" style={{ marginTop: 8 }}>
            {selectedAsset ? selectedAsset.title : "Choose a resource"}
          </h2>
        </div>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label>
            <span className="nv-small">Work email</span>
            <input
              type="email"
              required
              disabled={!selectedAsset}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-nv-md border border-nv-text/10 bg-nv-bg/60 px-3 py-2 text-sm text-nv-text disabled:opacity-50"
            />
          </label>
          <label>
            <span className="nv-small">Company</span>
            <input
              disabled={!selectedAsset}
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              className="mt-2 w-full rounded-nv-md border border-nv-text/10 bg-nv-bg/60 px-3 py-2 text-sm text-nv-text disabled:opacity-50"
            />
          </label>
          <button type="submit" className="nv-btn nv-btn-primary w-fit" disabled={!selectedAsset || submitState === "posting"}>
            {submitState === "posting" ? "Preparing" : "Send and download"}
          </button>
          {submitState === "created" && <p className="nv-small text-nv-teal">Download started.</p>}
          {submitState === "error" && <p className="nv-small text-nv-risk">{submitReason}</p>}
        </form>
      </aside>
    </div>
  );
}

