"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { getPsychragAccessToken } from "@/lib/psychrag/auth";

type DocRow = {
  id: string;
  title: string;
  document_type: string;
  source_license: string;
  approved_for_rag: boolean;
  total_chunks: number;
  ingested_at: string;
};

export function PsychragAdminLibrary() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("clinical_guideline");
  const [license, setLicense] = useState("rights_cleared");
  const [chunkText, setChunkText] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    getPsychragAccessToken()
      .then((token) =>
        fetch("/api/psychrag/rag/documents", {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
      )
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then(setDocs)
      .catch((err) => setStatus(err instanceof Error ? err.message : "Unable to load document registry"));
  }, []);

  async function ingest() {
    setStatus(null);
    const token = await getPsychragAccessToken();
    const res = await fetch("/api/psychrag/rag/ingest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        title,
        document_type: documentType,
        source_license: license,
        approved_for_rag: true,
        rights_notes: "Added through the PsychRAG admin library MVP form.",
        chunks: chunkText
          .split("\n\n")
          .map((content) => content.trim())
          .filter(Boolean)
          .map((content, index) => ({
            content,
            section: `Seed section ${index + 1}`,
          })),
      }),
    });
    if (!res.ok) {
      setStatus(await res.text());
      return;
    }
    const next = await res.json();
    setDocs((current) => [next, ...current]);
    setTitle("");
    setChunkText("");
    setStatus("Document ingested.");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Card className="border border-white/70 bg-white/80">
        <CardHeader>
          <CardTitle>Clinical library ingest</CardTitle>
          <CardDescription>Only rights-cleared, approved material can enter the retrieval corpus.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" />
          <Select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            <option value="clinical_guideline">Clinical guideline</option>
            <option value="psychoeducation">Psychoeducation</option>
            <option value="research_paper">Research paper</option>
            <option value="treatment_manual">Treatment manual</option>
            <option value="assessment_instrument">Assessment instrument</option>
            <option value="textbook">Textbook</option>
          </Select>
          <Select value={license} onChange={(e) => setLicense(e.target.value)}>
            <option value="owned">Owned</option>
            <option value="licensed">Licensed</option>
            <option value="public_domain">Public domain</option>
            <option value="rights_cleared">Rights cleared</option>
          </Select>
          <Textarea
            className="min-h-[240px]"
            value={chunkText}
            onChange={(e) => setChunkText(e.target.value)}
            placeholder="Paste one or more rights-cleared chunks separated by blank lines"
          />
          {status ? <p className="text-sm text-slate-600">{status}</p> : null}
          <Button onClick={ingest}>Ingest document</Button>
        </CardContent>
      </Card>

      <Card className="border border-white/70 bg-white/80">
        <CardHeader>
          <CardTitle>Document registry</CardTitle>
          <CardDescription>Evidence base currently approved for retrieval and citation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {docs.map((doc) => (
            <div key={doc.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="font-medium text-slate-900">{doc.title}</p>
              <p className="mt-1 text-sm text-slate-600">{doc.document_type} • {doc.source_license}</p>
              <p className="mt-2 text-xs text-slate-500">{doc.total_chunks} chunks • {new Date(doc.ingested_at).toLocaleString()}</p>
            </div>
          ))}
          {!docs.length ? <p className="text-sm text-slate-500">No documents have been ingested yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
