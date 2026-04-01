"use client";

import { useMemo } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import ResumeWorkspace from "@/components/resume/ResumeWorkspace";
import { normalizeResumeWorkspace } from "@/lib/resume/workspace";
import { getResumeSeedPayload } from "@/data/visualResumeSeed";

export default function ResumeOsPage() {
  const { envId, businessId } = useDomainEnv();

  // Seed renders immediately — the complete career narrative from the
  // forensically-extracted resume with precomputed capability curves.
  const workspace = useMemo(
    () => normalizeResumeWorkspace(getResumeSeedPayload()).workspace,
    [],
  );

  // The seed IS the authoritative career data. No DB fetch — the seed
  // contains the complete forensically-extracted resume with precomputed
  // capability curves. DB hydration was causing flash-revert because the
  // backend data is sparser and replaces milestones, initiatives, BI
  // entities, and architecture with older/thinner versions.

  return <ResumeWorkspace envId={envId} businessId={businessId} workspace={workspace} />;
}
