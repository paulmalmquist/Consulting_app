"use client";

export type CopilotAttachment = {
  id: string;
  document_id?: string;
  version_id?: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  status: "uploading" | "indexing" | "classifying" | "ready" | "failed";
  processing_mode?: "text_indexed" | "vision_only" | "unsupported" | "failed";
  classification?: {
    detected_domain?: string;
    document_type?: string;
    summary?: string | null;
    parse_stats?: Record<string, unknown>;
    suggested_actions?: string[];
    parser_used?: string;
  };
  error?: string | null;
};
