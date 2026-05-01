'use client';

import { useSearchParams } from 'next/navigation';
import { INDUSTRY_VERTICAL_BY_SLUG } from '@content/industry-verticals';
import { ContactForm } from './ContactForm';

export function ContactPageContent() {
  const searchParams = useSearchParams();
  const industrySlug = searchParams.get('industry');
  const selectedIndustry =
    industrySlug && Object.prototype.hasOwnProperty.call(INDUSTRY_VERTICAL_BY_SLUG, industrySlug)
      ? INDUSTRY_VERTICAL_BY_SLUG[industrySlug as keyof typeof INDUSTRY_VERTICAL_BY_SLUG]
      : undefined;

  return (
    <div className="nv-page">
      <div>
        {selectedIndustry && (
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />{selectedIndustry.label}</p>
        )}
        <h1 className="nv-h1" style={{ marginTop: selectedIndustry ? 18 : 0, marginBottom: 24 }}>
          Book a meeting.
        </h1>
        <p className="nv-lede">
          You will receive a calendar invite with Google, Outlook, and ICS options after confirmation.
        </p>
      </div>
      <div className="nv-section">
        <ContactForm key={selectedIndustry?.slug ?? 'generic'} defaultIndustry={selectedIndustry?.contactLabel} />
      </div>
    </div>
  );
}
