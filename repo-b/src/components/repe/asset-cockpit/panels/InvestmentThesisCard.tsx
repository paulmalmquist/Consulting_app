"use client";

import SectionHeader from "../shared/SectionHeader";
import { BRIEFING_COLORS, BRIEFING_CONTAINER } from "../shared/briefing-colors";
import { getMockInvestmentThesis } from "../mock-data";

export default function InvestmentThesisCard() {
  const { thesis, key_drivers } = getMockInvestmentThesis();

  return (
    <div
      className={BRIEFING_CONTAINER}
      style={{ borderLeft: `4px solid ${BRIEFING_COLORS.capital}` }}
    >
      <SectionHeader eyebrow="INVESTMENT THESIS" title="Acquisition Strategy" />

      <p className="mt-4 text-sm leading-relaxed text-bm-text">{thesis}</p>

      <div className="mt-5">
        <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
          Key Value-Add Drivers
        </p>
        <ul className="mt-2 space-y-1.5">
          {key_drivers.map((d) => (
            <li key={d} className="flex items-start gap-2 text-sm text-bm-text">
              <span
                className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: BRIEFING_COLORS.capital }}
              />
              {d}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
