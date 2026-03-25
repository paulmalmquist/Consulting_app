"use client";
import React from "react";

export default function LegalDocumentsPage() {
  return (
    <section className="space-y-5" data-testid="legal-documents">
      <div>
        <h2 className="text-2xl font-semibold">Documents</h2>
        <p className="text-sm text-bm-muted2">Legal document management, contract versions, and filing attachments.</p>
      </div>
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-8 text-center">
        <p className="text-sm font-medium">Document Management</p>
        <p className="mt-2 text-sm text-bm-muted2">
          Attach and manage documents directly from within each matter workspace.<br />
          Navigate to a matter and use the Attachments tab to upload contracts, filings, and correspondence.
        </p>
      </div>
    </section>
  );
}
