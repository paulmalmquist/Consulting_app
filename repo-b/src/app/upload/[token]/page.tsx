"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  getDocCompletionPortal,
  uploadDocCompletionPortal,
  DcPortalFile,
  DcPortalDoc,
} from "@/lib/bos-api";

const DOC_STATUS_ICON: Record<string, { icon: string; color: string }> = {
  accepted: { icon: "\u2713", color: "text-green-500" },
  waived: { icon: "\u2713", color: "text-green-500" },
  uploaded: { icon: "\u25CF", color: "text-yellow-500" },
  required: { icon: "\u25CB", color: "text-red-500" },
  requested: { icon: "\u25CB", color: "text-orange-500" },
  rejected: { icon: "\u2717", color: "text-red-400" },
};

export default function BorrowerUploadPortalPage() {
  const params = useParams();
  const token = params.token as string;
  const [portal, setPortal] = useState<DcPortalFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadSuccess, setUploadSuccess] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function loadPortal() {
    setLoading(true);
    setError(null);
    try {
      const data = await getDocCompletionPortal(token);
      if ((data as Record<string, unknown>).error === "token_expired") {
        setError("This upload link has expired. Please contact your loan officer for a new link.");
        setPortal(null);
      } else {
        setPortal(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your document request.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPortal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleUpload(req: DcPortalDoc, file: File) {
    setUploading((prev) => ({ ...prev, [req.requirement_id]: true }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("requirement_id", req.requirement_id);
      await uploadDocCompletionPortal(token, formData);
      setUploadSuccess((prev) => ({ ...prev, [req.requirement_id]: true }));
      void loadPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading((prev) => ({ ...prev, [req.requirement_id]: false }));
    }
  }

  const allDone = portal?.requirements.every((r) => r.status === "accepted" || r.status === "waived" || r.status === "uploaded");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error && !portal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Document Upload</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!portal) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-lg mx-auto">
          {portal.lender_name && <p className="text-xs text-gray-400 uppercase tracking-wide">{portal.lender_name}</p>}
          <h1 className="text-xl font-semibold text-gray-800">Document Upload</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Greeting */}
        <div>
          <p className="text-gray-700">
            Hi <span className="font-medium">{portal.borrower_first_name}</span>, please upload the following documents for your <span className="font-medium">{portal.loan_type}</span> application.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* All Done Banner */}
        {allDone && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
            <p className="text-green-700 font-medium">All documents received! Thank you.</p>
            <p className="text-green-600 text-sm mt-1">We&apos;ll be in touch shortly.</p>
          </div>
        )}

        {/* Document Cards */}
        {portal.requirements.map((req) => {
          const si = DOC_STATUS_ICON[req.status] || { icon: "\u25CB", color: "text-gray-400" };
          const isComplete = req.status === "accepted" || req.status === "waived";
          const isPending = req.status === "uploaded";
          const isUploading = uploading[req.requirement_id];
          const justUploaded = uploadSuccess[req.requirement_id];

          return (
            <div key={req.requirement_id} className={`rounded-lg border bg-white p-4 ${isComplete ? "border-green-200" : isPending ? "border-yellow-200" : "border-gray-200"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${si.color}`}>{si.icon}</span>
                  <span className="font-medium text-gray-800">{req.display_name}</span>
                </div>
                <span className={`text-xs capitalize ${isComplete ? "text-green-600" : isPending ? "text-yellow-600" : "text-gray-500"}`}>
                  {req.status.replace(/_/g, " ")}
                </span>
              </div>

              {!isComplete && !isPending && !justUploaded && (
                <div className="mt-3">
                  <input
                    ref={(el) => { fileInputRefs.current[req.requirement_id] = el; }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.heic"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(req, f);
                    }}
                  />
                  <button
                    onClick={() => fileInputRefs.current[req.requirement_id]?.click()}
                    disabled={isUploading}
                    className="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 disabled:opacity-50"
                  >
                    {isUploading ? "Uploading..." : "Tap to upload file"}
                  </button>
                </div>
              )}

              {justUploaded && !isComplete && (
                <p className="mt-2 text-sm text-green-600">Uploaded successfully!</p>
              )}
            </div>
          );
        })}

        {/* Footer */}
        <p className="text-xs text-gray-400 text-center pt-4">
          Accepted formats: PDF, JPG, PNG. Max file size: 10MB.
        </p>
      </div>
    </div>
  );
}
