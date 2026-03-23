"use client";

export type CopilotAttachment = {
  id: string;
  document_id?: string;
  version_id?: string;
  name: string;
  status: "uploading" | "indexing" | "ready" | "failed";
  error?: string | null;
};
