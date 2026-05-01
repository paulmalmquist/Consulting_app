import Link from 'next/link';
import { ArrowDownCircle } from 'lucide-react';

export function ShiftHero() {
  return (
    <div>
      <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />The Shift</p>
      <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24 }}>Operations are moving to a unified execution engine.</h1>
      <p className="nv-lede">
        Scattered SaaS workflows give way to governed automation — one controlled layer where states, rules, and evidence are written down.
      </p>
      <div style={{ marginTop: 24 }}>
        <Link
          href="#shift-map"
          className="nv-btn nv-btn-primary"
        >
          See the Shift Map
          <ArrowDownCircle size={16} aria-hidden="true" style={{ display: 'inline', marginLeft: 8 }} />
        </Link>
      </div>
    </div>
  );
}
