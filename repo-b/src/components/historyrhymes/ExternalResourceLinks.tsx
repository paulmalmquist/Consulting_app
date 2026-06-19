"use client";

import { ExternalLink } from "lucide-react";
import type { ExternalResourceLink } from "@/lib/historyrhymes/mlDemo";
import { CopyButton } from "./mlUi";

/** Renders cloud detail links; disabled links show the reason + a copyable id. */
export function ExternalResourceLinks({ links }: { links: ExternalResourceLink[] }) {
  if (!links || links.length === 0) {
    return <div className="text-[11px] text-neutral-500">No external resources.</div>;
  }
  return (
    <ul className="space-y-1.5">
      {links.map((link, i) => (
        <li key={i} className="flex items-center justify-between gap-3 text-xs">
          <div className="min-w-0">
            {link.href ? (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
              >
                <ExternalLink size={11} />
                {link.label}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1 text-neutral-500" title={link.unavailableReason}>
                <ExternalLink size={11} />
                {link.label}
                <span className="text-[10px] text-amber-300/80">· {link.unavailableReason}</span>
              </span>
            )}
            {link.copyValue ? (
              <div className="text-[10px] text-neutral-600 truncate font-mono">{link.copyValue}</div>
            ) : null}
          </div>
          {link.copyValue ? <CopyButton text={link.copyValue} label="Copy id" /> : null}
        </li>
      ))}
    </ul>
  );
}
