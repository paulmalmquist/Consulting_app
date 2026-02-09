"use client";

import { useState, useRef } from "react";
import {
  runExecution,
  initUpload,
  completeUpload,
  computeSha256,
  RunResult,
} from "@/lib/bos-api";

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
      <div className="border border-slate-700 rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase">Inputs</h3>

        {hasSchema ? (
          inputs.map((field) => (
            <div key={field.name}>
              <label className="block text-sm text-slate-400 mb-1">{field.label}</label>
              {field.type === "file" ? (
                <div>
                  <input
                    ref={(el) => { fileRefs.current[field.name] = el; }}
                    type="file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setFileInputs((prev) => ({ ...prev, [field.name]: f }));
                    }}
                    className="w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700"
                  />
                  {fileInputs[field.name] && (
                    <p className="text-xs text-slate-500 mt-1">
                      {fileInputs[field.name].name} ({(fileInputs[field.name].size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>
              ) : field.type === "textarea" ? (
                <textarea
                  rows={3}
                  value={formValues[field.name] || ""}
                  onChange={(e) =>
                    setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
                />
              ) : (
                <input
                  type={field.type === "number" ? "number" : "text"}
                  value={formValues[field.name] || ""}
                  onChange={(e) =>
                    setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              )}
            </div>
          ))
        ) : (
          <div>
            <label className="block text-sm text-slate-400 mb-1">Input JSON</label>
            <textarea
              rows={5}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
            />
          </div>
        )}

        {uploadStatus && (
          <p className="text-xs text-sky-400">{uploadStatus}</p>
        )}

        <button
          onClick={handleRun}
          disabled={running}
          className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          {running ? "Running..." : "Run"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-800 text-red-200 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="border border-slate-700 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-400 uppercase">Result</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-500">Run ID:</span>
            <span className="text-sm font-mono">{result.run_id}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-500">Status:</span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                result.status === "completed"
                  ? "bg-emerald-900 text-emerald-300"
                  : "bg-yellow-900 text-yellow-300"
              }`}
            >
              {result.status}
            </span>
          </div>
          <div>
            <span className="text-xs font-mono text-slate-500 block mb-1">Outputs:</span>
            <pre className="text-xs bg-slate-900 rounded-lg p-3 overflow-x-auto">
              {JSON.stringify(result.outputs_json, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
