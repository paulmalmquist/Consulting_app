"use client";

import { useCallback, useState, type RefObject } from "react";

/**
 * PDF export button for the Visual Resume workspace.
 *
 * Uses dynamic imports so html2canvas + jspdf stay out of the main bundle.
 * Captures whatever is currently rendered inside `contentRef` and places it
 * on a landscape A4 page with a branded header.
 */
export default function ResumeExportPdf({
  contentRef,
}: {
  contentRef: RefObject<HTMLDivElement | null>;
}) {
  const [busy, setBusy] = useState(false);

  const handleExport = useCallback(async () => {
    const node = contentRef.current;
    if (!node) return;

    setBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#0a0a0f",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;

      // Landscape A4 dimensions in mm
      const pageW = 297;
      const pageH = 210;
      const margin = 12;
      const headerH = 18;
      const contentAreaW = pageW - margin * 2;
      const contentAreaH = pageH - margin * 2 - headerH;

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // Header
      doc.setFillColor(10, 10, 15);
      doc.rect(0, 0, pageW, pageH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text("Paul Malmquist \u2014 AI & Data Systems Architect", margin, margin + 10);
      doc.setDrawColor(59, 130, 246);
      doc.setLineWidth(0.4);
      doc.line(margin, margin + headerH - 4, pageW - margin, margin + headerH - 4);

      // Scale captured image to fit the remaining content area
      const ratio = Math.min(contentAreaW / imgWidthPx, contentAreaH / imgHeightPx);
      const drawW = imgWidthPx * ratio;
      const drawH = imgHeightPx * ratio;
      const offsetX = margin + (contentAreaW - drawW) / 2;
      const offsetY = margin + headerH;

      doc.addImage(imgData, "PNG", offsetX, offsetY, drawW, drawH);

      doc.save("paul-malmquist-resume.pdf");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("PDF export failed", err);
    } finally {
      setBusy(false);
    }
  }, [contentRef]);

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-full border border-bm-border/40 bg-white/5 px-4 py-2 text-sm font-medium text-bm-muted transition hover:bg-white/10 hover:text-bm-text disabled:opacity-50"
    >
      {busy ? (
        <>
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-bm-muted border-t-transparent" />
          Generating...
        </>
      ) : (
        <>
          {/* Download icon (Lucide-style inline SVG to avoid extra import) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export PDF
        </>
      )}
    </button>
  );
}
