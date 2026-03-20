"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";

interface InvoiceUploaderProps {
  onUpload: (files: File[]) => Promise<void>;
  disabled?: boolean;
}

export function InvoiceUploader({ onUpload, disabled }: InvoiceUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || disabled) return;
    setUploading(true);
    try {
      await onUpload(Array.from(files));
    } finally {
      setUploading(false);
    }
  }, [onUpload, disabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        "rounded-xl border-2 border-dashed p-8 text-center transition-colors",
        dragOver ? "border-bm-accent bg-bm-accent/5" : "border-bm-border/40 bg-bm-surface/20",
        (uploading || disabled) && "opacity-50 pointer-events-none",
      )}
    >
      <p className="text-sm text-bm-muted2">
        {uploading ? "Uploading & processing..." : "Drag & drop invoice PDFs here"}
      </p>
      <label className="mt-3 inline-block cursor-pointer rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm font-medium text-bm-accent hover:bg-bm-accent/20">
        Browse Files
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
          disabled={disabled || uploading}
        />
      </label>
      <p className="mt-2 text-[10px] text-bm-muted2">PDF, PNG, or JPEG — OCR will extract invoice data automatically</p>
    </div>
  );
}
