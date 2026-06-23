"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { C, Tag, Panel, Loading, ErrorState, PageHeading } from "./primitives";

// Deployment / CI receipt.
//
// Backend SHA + status come from a REAL fetch of GET /version ({ git_sha: string | null }).
// Frontend SHA comes from NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA (Vercel injects at build; undefined
// locally -> "local / unset", never faked).
//
// The "Test + smoke" panel is an HONEST DESCRIPTION of the CI gates that run on every PR — it is NOT
// a live pass/fail signal (we do not fetch CI status here). It is framed as descriptors, with a
// pointer to the PR's run links.
//
// Fail closed: if /version fetch fails, only the backend panel shows an ErrorState; the frontend SHA
// and the CI descriptor still render.

interface VersionResponse {
  // /version returns { "git_sha": string | null }. Treat extra fields as optional.
  git_sha?: string | null;
  version?: string | null;
}

const CI_GATES: { name: string; detail: string }[] = [
  { name: "Frontend Lint", detail: "eslint over repo-b" },
  { name: "Frontend Typecheck", detail: "tsc --noEmit (strict)" },
  { name: "Frontend Unit", detail: "vitest run" },
  { name: "Backend pytest", detail: "FastAPI service + route tests" },
  { name: "Mass-deletion gate", detail: "blocks PRs deleting >100 files" },
];

function shortSha(sha: string): string {
  return sha.length > 12 ? sha.slice(0, 12) : sha;
}

export default function DeploymentReceiptCard() {
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<VersionResponse>("/api/version")
      .then((v) => {
        if (!cancelled) setVersion(v);
      })
      .catch((e) => {
        if (!cancelled) setBackendError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Vercel injects this at build time; undefined locally. Render honestly — never fabricate a SHA.
  const frontendShaRaw = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  const frontendSha = frontendShaRaw ? shortSha(frontendShaRaw) : "local / unset";
  const frontendKnown = Boolean(frontendShaRaw);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <PageHeading
        eyebrow="Deployment / CI receipt"
        title="What is deployed, and what gates it"
        blurb="Live backend version, the frontend build SHA, and the CI gates every change passes."
      />
      {/* Backend — real /version. Fail-closed to its own ErrorState. */}
      <Panel
        title="Backend deploy receipt"
        right={
          backendError ? (
            <Tag color={C.red}>unreachable</Tag>
          ) : version ? (
            <Tag color={version.git_sha ? C.green : C.amber}>{version.git_sha ? "live" : "sha unset"}</Tag>
          ) : undefined
        }
      >
        {backendError ? (
          <ErrorState message={backendError} />
        ) : !version ? (
          <Loading label="Reading /version…" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Row label="Backend git SHA" value={version.git_sha ? shortSha(version.git_sha) : "null (not captured at deploy)"} mono />
            {version.version && <Row label="Version" value={version.version} mono />}
            <Row label="Status" value={version.git_sha ? "responding" : "responding (SHA unset)"} />
            <Row label="Source" value="GET /api/version → backend /version (live fetch)" />
          </div>
        )}
      </Panel>

      {/* Frontend — build-time injected SHA. Renders regardless of backend state. */}
      <Panel
        title="Frontend build"
        right={<Tag color={frontendKnown ? C.green : C.amber}>{frontendKnown ? "built" : "local"}</Tag>}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Row label="Frontend git SHA" value={frontendSha} mono />
          <Row label="Source" value="NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA (build-time)" />
        </div>
        {!frontendKnown && (
          <p style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.6, margin: "10px 0 0" }}>
            Not running on a Vercel build — the commit SHA is not injected locally. Shown honestly as
            unset rather than faked.
          </p>
        )}
      </Panel>

      {/* CI gates — DESCRIPTION, not a live pass/fail. Always renders. */}
      <Panel title="Test + smoke (CI gates)">
        <p style={{ fontFamily: C.mono, fontSize: 11.5, color: C.faint, lineHeight: 1.6, margin: "0 0 12px" }}>
          What CI runs on every PR. This is a description of the gates, not a live green/red signal —
          see the CI run links in the PR for the actual pass/fail of any specific commit.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {CI_GATES.map((g) => (
            <div
              key={g.name}
              style={{ display: "flex", gap: 10, alignItems: "baseline", fontFamily: C.mono, fontSize: 11.5 }}
            >
              <span style={{ color: C.cyan, minWidth: 130, display: "inline-block" }}>{g.name}</span>
              <span style={{ color: C.dim }}>{g.detail}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "7px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>{label}</span>
      <span
        style={{
          fontFamily: mono ? C.mono : C.sans,
          fontSize: 12,
          color: C.text,
          textAlign: "right",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}
