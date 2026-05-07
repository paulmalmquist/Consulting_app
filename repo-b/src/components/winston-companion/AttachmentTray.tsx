"use client";

import type { CopilotAttachment } from "@/components/copilot/types";
import { AttachmentCard } from "./AttachmentCard";

type AttachmentTrayProps = {
  attachments: CopilotAttachment[];
  onRemove: (id: string) => void;
};

export function AttachmentTray({ attachments, onRemove }: AttachmentTrayProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-3 pb-1">
      {attachments.map((attachment) => (
        <AttachmentCard
          key={attachment.id}
          attachment={attachment}
          onRemove={() => onRemove(attachment.id)}
        />
      ))}
    </div>
  );
}
