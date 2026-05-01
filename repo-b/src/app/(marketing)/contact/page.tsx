import { Suspense } from 'react';
import { ContactForm } from '@/components/marketing/content/ContactForm';
import { ContactPageContent } from '@/components/marketing/content/ContactPageContent';

function ContactPageFallback() {
  return (
    <div className="nv-page">
      <div>
        <h1 className="nv-h1" style={{ marginBottom: 24 }}>Book a <em>meeting</em>.</h1>
        <p className="nv-lede">
          You will receive a calendar invite with Google, Outlook, and ICS options after confirmation.
        </p>
      </div>
      <div className="nv-section">
        <ContactForm />
      </div>
    </div>
  );
}

export default function ContactPage() {
  return (
    <Suspense fallback={<ContactPageFallback />}>
      <ContactPageContent />
    </Suspense>
  );
}
