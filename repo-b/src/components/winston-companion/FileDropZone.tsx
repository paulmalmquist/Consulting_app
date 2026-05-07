"use client";

import { useRef, useState } from "react";

type FileDropZoneProps = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function FileDropZone({ onFiles, disabled = false, compact = false }: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const dragCountRef = useRef(0);

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCountRef.current++;
    setDragging(true);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCountRef.current = 0;
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={[
        "rounded border transition-colors text-center select-none",
        compact
          ? "py-1 px-2 text-xs border-dashed"
          : "py-2 px-3 text-xs border-dashed",
        dragging
          ? "border-white/40 bg-white/10 text-white/80"
          : "border-white/10 text-white/30",
        disabled ? "opacity-40 pointer-events-none" : "cursor-default",
      ].join(" ")}
    >
      {compact
        ? "Drop more files here"
        : "Drop screenshots, Excel, PDF, Word, or CSV · or paste a screenshot into the message box"}
    </div>
  );
}
