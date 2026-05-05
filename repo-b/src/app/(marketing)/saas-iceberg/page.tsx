import Link from 'next/link';
import styles from './saas-iceberg.module.css';

const selfAssessment = [
  'We rely on chat to make decisions.',
  'No one owns final answers.',
  'We search Slack before asking people.',
  'Tickets exist because ownership does not.',
  'Escalations happen after avoidable ambiguity.',
  'Our process lives in heroics, not systems.',
  'We rebuild reports to trust the numbers.',
];

const reframeItems = [
  {
    title: 'Vendors monetize avoidance',
    pct: '82%',
    note: 'Licenses scale with unresolved ambiguity. Confusion is sticky. Clarity is leverage.',
    outcome: 'Lower cost of change. Faster outcomes.',
    color: 'from-violet-300/60 to-cyan-300/60',
  },
  {
    title: 'Internal systems force clarity',
    pct: '58%',
    note: 'Rules become explicit. Ownership becomes defensible. Ambiguity disappears.',
    outcome: 'Fewer exceptions. More predictable ops.',
    color: 'from-cyan-300/60 to-violet-300/60',
  },
  {
    title: 'Ownership lowers total cost',
    pct: '34%',
    note: 'Fewer tools. Fewer escalations. Better memory. Stronger outcomes.',
    outcome: 'Lower cost. Higher trust. Real operational leverage.',
    color: 'from-violet-300/60 to-cyan-300/60',
  },
];

export default function SaaSIcebergPage() {
  return (
    <div className={styles.page}>

      {/* Cinematic hero — art is the visible composition */}
      <div className={`${styles.stage} saas-iceberg-stage`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`${styles.art} saas-iceberg-art`}
          src="/assets/marketing/saas-iceberg-art.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        {/* Screen-reader-only semantic text */}
        <div className={styles.srOnly}>
          <p>The SaaS Iceberg</p>
          <h1>What you&apos;re really paying for.</h1>
          <p>Most SaaS pricing is justified below the waterline.</p>
          <p>Above water: features and UI. Below water: ownership and control.</p>
        </div>
      </div>

      {/* Mobile fallback — stage hidden on small screens */}
      <div className={styles.mobileFallback}>
        <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />The SaaS Iceberg</p>
        <h1 className="nv-h1" style={{ marginTop: 16, marginBottom: 12 }}>
          What you&apos;re <em>really</em> paying for.
        </h1>
        <p className="nv-lede">Most SaaS pricing is justified below the waterline.</p>
        <div className="flex flex-wrap gap-3" style={{ marginTop: 20 }}>
          <span className="nv-pill nv-pill-teal">Above water · features &amp; UI</span>
          <span
            className="nv-pill"
            style={{
              color: 'rgb(var(--nv-accent-copper))',
              borderColor: 'rgb(var(--nv-accent-copper) / 0.35)',
              background: 'rgb(var(--nv-accent-copper) / 0.08)',
            }}
          >
            Below water · ownership &amp; control
          </span>
        </div>
      </div>

      {/* Diagnostic checklist */}
      <section className={styles.diagnostic}>
        <div style={{ marginBottom: 24 }}>
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Diagnostic intake</p>
          <h2 className="nv-h2" style={{ marginTop: 8, marginBottom: 8 }}>Where are you compensating?</h2>
          <p className="nv-body" style={{ margin: 0 }}>Mentally check every statement that feels true.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {selfAssessment.map((statement) => (
            <li
              key={statement}
              className="rounded-[var(--nv-radius-md)] border border-[rgb(var(--nv-hair-soft)/0.10)] bg-[rgb(var(--nv-bg)/0.8)] p-4 text-sm text-[rgb(var(--nv-text-primary))]"
            >
              <span className="mr-2 text-[rgb(var(--nv-accent-teal))]">☐</span>
              {statement}
            </li>
          ))}
        </ul>
        <p
          className="text-xs uppercase tracking-[0.18em]"
          style={{ marginTop: 16, color: 'rgb(var(--nv-accent-teal) / 0.6)' }}
        >
          Checked statements become reframe signals →
        </p>
      </section>

      {/* Reframe cards */}
      <section className={styles.reframe}>
        <div style={{ marginBottom: 24 }}>
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />The reframe: ownership creates leverage</p>
          <h2 className="nv-h2" style={{ marginTop: 8, marginBottom: 4 }}>These are not software problems.</h2>
          <p className="nv-lede" style={{ color: 'rgb(var(--nv-accent-teal))' }}>They are ownership problems.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {reframeItems.map((item) => (
            <div key={item.title} className="nv-card" style={{ padding: 20 }}>
              <p className="nv-h3" style={{ marginBottom: 12 }}>{item.title}</p>
              <div className="h-1.5 rounded-[2px] bg-[rgb(var(--nv-surface-raised))]">
                <div
                  className={`h-1.5 rounded-[2px] bg-gradient-to-r ${item.color}`}
                  style={{ width: item.pct }}
                />
              </div>
              <p className="nv-body" style={{ marginTop: 14, marginBottom: 8 }}>{item.note}</p>
              <p
                className="text-xs uppercase tracking-[0.14em]"
                style={{ color: 'rgb(var(--nv-accent-teal) / 0.7)' }}
              >
                Outcome: {item.outcome}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className={styles.cta}>
        <div className="nv-card" style={{ padding: '24px 28px' }}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="nv-h3">See what you&apos;re outsourcing.</h2>
              <p className="nv-body" style={{ margin: 0 }}>
                Map the submerged cost before your next renewal cycle.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/operational-assessment" className="nv-btn nv-btn-primary">
                See What You&apos;re Outsourcing
              </Link>
              <Link href="/contact" className="nv-btn nv-btn-secondary">
                Build What You Actually Need
              </Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
