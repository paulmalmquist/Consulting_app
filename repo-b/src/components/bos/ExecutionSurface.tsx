"use client";

import { useState, useRef } from "react";
import {
  runExecution,
  initUpload,
  completeUpload,
  computeSha256,
  RunResult,
} from "@/lib/bos-api";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";

interface InputField {
  name: string;
  type: string; // text | number | textarea | file
  label: string;
}

export default function ExecutionSurface({
  businessId,
  departmentId,
  capabilityId,
  metadataJson,
}: {
  businessId: string;
  departmentId: string;
  capabilityId: string;
  metadataJson: Record<string, unknown>;
}) {
  const inputs = (metadataJson.inputs as InputField[]) || [];
  const hasSchema = inputs.length > 0;

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [fileInputs, setFileInputs] = useState<Record<string, File>>({});
  const [jsonInput, setJsonInput] = useState("{}");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function handleFileUpload(fieldName: string, file: File): Promise<string> {
    setUploadStatus(`Uploading ${file.name}...`);

    // 1. Init upload
    const initRes = await initUpload({
      business_id: businessId,
      department_id: departmentId,
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      title: file.name,
    });

    // 2. Upload to signed URL
    await fetch(initRes.signed_upload_url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });

    // 3. Compute hash and complete
    const sha = await computeSha256(file);
    await completeUpload({
      document_id: initRes.document_id,
      version_id: initRes.version_id,
      sha256: sha,
      byte_size: file.size,
    });

    setUploadStatus("");
    return initRes.document_id;
  }

  async function handleRun() {
    setRunning(true);
    setError("");
    setResult(null);

    try {
      const inputsJson: Record<string, unknown> = {};

      if (hasSchema) {
        // Collect form values
        for (const field of inputs) {
          if (field.type === "file") {
            const file = fileInputs[field.name];
            if (file) {
              const docId = await handleFileUpload(field.name, file);
              inputsJson[field.name] = docId;
            }
          } else {
            inputsJson[field.name] = formValues[field.name] || "";
          }
        }
      } else {
        try {
          Object.assign(inputsJson, JSON.parse(jsonInput));
        } catch {
          setError("Invalid JSON input");
          setRunning(false);
          return;
        }
      }

      const res = await runExecution({
        business_id: businessId,
        department_id: departmentId,
        capability_id: capabilityId,
        inputs_json: inputsJson,
      });

      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Input form */}
      <Card>
        <CardContent className="space-y-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Inputs
          </CardTitle>

        {hasSchema ? (
          inputs.map((field) => (
            <div key={field.name}>
              <label className="block text-sm text-bm-muted mb-1">{field.label}</label>
              {field.type === "file" ? (
                <div>
                  <input
                    ref={(el) => { fileRefs.current[field.name] = el; }}
                    type="file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setFileInputs((prev) => ({ ...prev, [field.name]: f }));
                    }}
                    className="w-full text-sm text-bm-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-bm-border/70 file:bg-bm-surface/60 file:text-bm-text hover:file:bg-bm-surface2/60"
                  />
                  {fileInputs[field.name] && (
                    <p className="text-xs text-bm-muted2 mt-1">
                      {fileInputs[field.name].name} ({(fileInputs[field.name].size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>
              ) : field.type === "textarea" ? (
                <Textarea
                  rows={3}
                  value={formValues[field.name] || ""}
                  onChange={(e) =>
                    setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                  }
                  className="resize-y"
                />
              ) : (
                <Input
                  type={field.type === "number" ? "number" : "text"}
                  value={formValues[field.name] || ""}
                  onChange={(e) =>
                    setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                  }
                />
              )}
            </div>
          ))
        ) : (
          <div>
            <label className="block text-sm text-bm-muted mb-1">Input JSON</label>
            <Textarea
              rows={5}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="font-mono resize-y"
            />
          </div>
        )}

        {uploadStatus && (
          <p className="text-xs text-bm-accent">{uploadStatus}</p>
        )}

        <Button
          onClick={handleRun}
          disabled={running}
          className="w-full"
        >
          {running ? "Running..." : "Run"}
        </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="bg-bm-danger/15 border border-bm-danger/30 text-bm-text px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <Card>
          <CardContent className="space-y-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Result
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-bm-muted2">Run ID:</span>
            <span className="text-sm font-mono">{result.run_id}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-bm-muted2">Status:</span>
            <Badge variant={result.status === "completed" ? "success" : "warning"}>
              {result.status}
            </Badge>
          </div>
          <div>
            <span className="text-xs font-mono text-bm-muted2 block mb-1">Outputs:</span>
            <pre className="text-xs bg-bm-bg/20 border border-bm-border/60 rounded-lg p-3 overflow-x-auto">
              {JSON.stringify(result.outputs_json, null, 2)}
            </pre>
          </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
