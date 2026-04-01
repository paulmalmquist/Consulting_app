"use client";

import { useCallback } from "react";
import type { SkillDefinition } from "./skillsData";

/** Skill icon SVGs — minimal monochrome logos at consistent 28×28 visual weight. */
function SkillLogo({ skillId, size = 28 }: { skillId: string; size?: number }) {
  const s = size;
  const common = { width: s, height: s, viewBox: "0 0 28 28", fill: "none", xmlns: "http://www.w3.org/2000/svg" };

  switch (skillId) {
    case "python":
      return (
        <svg {...common}>
          <path d="M14 3C9.03 3 9.5 5.2 9.5 5.2l.005 2.28H14.2v.69H7.37S4 7.78 4 14.03s2.94 6.04 2.94 6.04h1.75v-2.91s-.09-2.94 2.89-2.94h4.98s2.8.05 2.8-2.71V7.12S19.77 3 14 3zm-2.77 2.38a.9.9 0 110 1.8.9.9 0 010-1.8z" fill="currentColor" opacity=".85"/>
          <path d="M14 25c4.97 0 4.5-2.2 4.5-2.2l-.005-2.28H13.8v-.69h6.83S24 20.22 24 13.97s-2.94-6.04-2.94-6.04h-1.75v2.91s.09 2.94-2.89 2.94h-4.98s-2.8-.05-2.8 2.71v4.39S8.23 25 14 25zm2.77-2.38a.9.9 0 110-1.8.9.9 0 010 1.8z" fill="currentColor" opacity=".65"/>
        </svg>
      );
    case "pyspark":
      return (
        <svg {...common}>
          <path d="M14 4l-8 5v10l8 5 8-5V9l-8-5zm0 2.3L19.7 9 14 11.7 8.3 9 14 6.3zM7.5 10.3l5.5 3v7.3l-5.5-3.3v-7zm13 0v7l-5.5 3.3v-7.3l5.5-3z" fill="currentColor" opacity=".8"/>
          <circle cx="14" cy="14" r="2.5" fill="currentColor" opacity=".5"/>
        </svg>
      );
    case "sql":
      return (
        <svg {...common}>
          <ellipse cx="14" cy="8" rx="8" ry="3.5" fill="currentColor" opacity=".3"/>
          <path d="M6 8v12c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5V8" stroke="currentColor" strokeWidth="1.5" fill="none" opacity=".7"/>
          <ellipse cx="14" cy="8" rx="8" ry="3.5" stroke="currentColor" strokeWidth="1.5" fill="none" opacity=".7"/>
          <path d="M6 13.5c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5" stroke="currentColor" strokeWidth="1" opacity=".35"/>
          <path d="M6 18.5c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5" stroke="currentColor" strokeWidth="1" opacity=".35"/>
        </svg>
      );
    case "databricks":
      return (
        <svg {...common}>
          <path d="M14 3L3 9l11 6 11-6-11-6z" fill="currentColor" opacity=".8"/>
          <path d="M3 14l11 6 11-6" stroke="currentColor" strokeWidth="1.5" fill="none" opacity=".5"/>
          <path d="M3 19l11 6 11-6" stroke="currentColor" strokeWidth="1.5" fill="none" opacity=".35"/>
        </svg>
      );
    case "azure":
      return (
        <svg {...common}>
          <path d="M7.5 5h5.2L8.3 23H3L7.5 5z" fill="currentColor" opacity=".6"/>
          <path d="M15.7 9.2L12 23h13l-5.3-8.8-4 5-4-10z" fill="currentColor" opacity=".85"/>
        </svg>
      );
    case "power_bi":
      return (
        <svg {...common}>
          <rect x="5" y="14" width="4" height="10" rx="1" fill="currentColor" opacity=".5"/>
          <rect x="12" y="9" width="4" height="15" rx="1" fill="currentColor" opacity=".7"/>
          <rect x="19" y="4" width="4" height="20" rx="1" fill="currentColor" opacity=".9"/>
        </svg>
      );
    case "tableau":
      return (
        <svg {...common}>
          <path d="M14 3v5M14 20v5M3 14h5M20 14h5" stroke="currentColor" strokeWidth="2.5" opacity=".8"/>
          <path d="M7 7l3 3M18 18l3 3M7 21l3-3M18 10l3-3" stroke="currentColor" strokeWidth="1.5" opacity=".45"/>
          <circle cx="14" cy="14" r="2" fill="currentColor" opacity=".7"/>
        </svg>
      );
    case "tabular_editor":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity=".5"/>
          <path d="M4 10h20M12 10v14" stroke="currentColor" strokeWidth="1.2" opacity=".5"/>
          <path d="M8 14h2M8 18h2M15 14h6M15 18h4" stroke="currentColor" strokeWidth="1.5" opacity=".7"/>
        </svg>
      );
    case "snowflake":
      return (
        <svg {...common}>
          <path d="M14 3v22M5 8.8l18 10.4M5 19.2l18-10.4" stroke="currentColor" strokeWidth="1.8" opacity=".7"/>
          <circle cx="14" cy="3" r="1.5" fill="currentColor" opacity=".5"/>
          <circle cx="14" cy="25" r="1.5" fill="currentColor" opacity=".5"/>
          <circle cx="5" cy="8.8" r="1.5" fill="currentColor" opacity=".5"/>
          <circle cx="23" cy="19.2" r="1.5" fill="currentColor" opacity=".5"/>
          <circle cx="5" cy="19.2" r="1.5" fill="currentColor" opacity=".5"/>
          <circle cx="23" cy="8.8" r="1.5" fill="currentColor" opacity=".5"/>
        </svg>
      );
    case "openai":
      return (
        <svg {...common}>
          <path d="M21.5 12.6a5.1 5.1 0 00-.44-4.2 5.16 5.16 0 00-5.56-2.52 5.12 5.12 0 00-3.86-1.72 5.17 5.17 0 00-4.94 3.6 5.1 5.1 0 00-3.42 2.48 5.17 5.17 0 00.64 6.06A5.1 5.1 0 004.36 20.5a5.16 5.16 0 005.56 2.52 5.12 5.12 0 003.86 1.72 5.17 5.17 0 004.94-3.6 5.1 5.1 0 003.42-2.48 5.17 5.17 0 00-.64-6.06z" stroke="currentColor" strokeWidth="1.3" fill="none" opacity=".75"/>
        </svg>
      );
    case "langchain":
      return (
        <svg {...common}>
          <path d="M8 6h12v4H8z" fill="currentColor" opacity=".4" rx="1"/>
          <path d="M8 12h12v4H8z" fill="currentColor" opacity=".6" rx="1"/>
          <path d="M8 18h12v4H8z" fill="currentColor" opacity=".8" rx="1"/>
          <path d="M14 10v2M10 16v2M18 16v2" stroke="currentColor" strokeWidth="1.5" opacity=".6"/>
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="6" y="6" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity=".5"/>
        </svg>
      );
  }
}

export { SkillLogo };

interface SkillDetailViewProps {
  skill: SkillDefinition;
  onBack: () => void;
  /** Highlighted from timeline selection */
  isHighlighted?: boolean;
}

export default function SkillDetailView({ skill, onBack, isHighlighted }: SkillDetailViewProps) {
  const handleBack = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      onBack();
    },
    [onBack],
  );

  return (
    <div
      className={`animate-in fade-in slide-in-from-right-2 duration-200 rounded-xl border px-4 py-4 transition-colors ${
        isHighlighted
          ? "border-sky-400/30 bg-sky-400/5"
          : "border-bm-border/30 bg-bm-surface/20"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-bm-border/30 bg-white/5 text-bm-muted transition hover:bg-white/10 hover:text-bm-text"
          aria-label="Back to skills"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="flex items-center gap-2.5">
          <div className="text-bm-text" style={{ color: skill.color }}>
            <SkillLogo skillId={skill.id} size={24} />
          </div>
          <h3 className="text-sm font-semibold tracking-wide text-bm-text">
            {skill.name}
          </h3>
        </div>
        {isHighlighted && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sky-400" title="Linked from timeline" />
        )}
      </div>

      {/* Bullets — [action] + [system built] + [outcome] */}
      <ul className="mt-3 space-y-2">
        {skill.bullets.map((bullet) => (
          <li
            key={bullet.text}
            className="flex items-start gap-2 text-[12.5px] leading-[1.4] text-bm-muted"
          >
            <span
              className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: skill.color, opacity: 0.6 }}
            />
            <span>{bullet.text}</span>
          </li>
        ))}
      </ul>

      {/* Capability tags */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {skill.capabilityTags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-bm-border/25 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-bm-muted2"
          >
            {tag.replace(/_/g, " ")}
          </span>
        ))}
      </div>
    </div>
  );
}
