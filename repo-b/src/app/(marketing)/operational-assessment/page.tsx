import { SignalMap } from '@/components/marketing/operational-assessment/SignalMap';
import { OperationalQuestionnaire } from '@/components/marketing/assessment/OperationalQuestionnaire';
import { NvButton } from '@/components/marketing/ui/NvButton';
import styles from './scan-console.module.css';

const STEPS = [
  'Tool sprawl',
  'Handoff clarity',
  'Approval process',
  'Data fragmentation',
  'Exception handling',
  'Evidence trail',
  'Automation maturity',
  'Control readiness',
];

const METRICS: { label: string; value: number; amber?: boolean }[] = [
  { label: 'Tool sprawl',          value: 72 },
  { label: 'Handoff clarity',      value: 56 },
  { label: 'Approval clarity',     value: 64, amber: true },
  { label: 'Evidence trail',       value: 31 },
  { label: 'Automation readiness', value: 58 },
];

export default function OperationalAssessmentPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.copy}>
          <div className={styles.eyebrow}>Operational Assessment</div>
          <div className={styles.rule} />
          <h1 className={styles.headline}>
            You can&apos;t fix what you can&apos;t see.
            <span className={styles.headlineSpan}>We make it visible.</span>
          </h1>
          <p className={styles.lede}>
            Novendor maps how work actually moves through your business, exposes friction,
            and shows where control breaks and value leaks.
          </p>
          <div className={styles.ctaRow}>
            <NvButton variant="primary" href="#assessment">Start assessment</NvButton>
            <span className={styles.timeNote}>~ 3 minutes</span>
          </div>
          <div className={styles.trace}>
            <strong>Actions leave a trace</strong><br />
            Workflow ownership, approval clarity, evidence gaps, and automation readiness
            are scored into one operating profile.
          </div>
        </div>

        <SignalMap />
      </section>

      {/* ── Assessment console ───────────────────────────────────── */}
      <div className={styles.consoleLabel}>Actions leave a trace</div>

      <section className={styles.console} id="assessment">
        {/* Progress rail — decorative chrome */}
        <aside className={styles.rail}>
          <div className={styles.panelTitle}>
            Assessment progress{' '}
            <span style={{ float: 'right', color: 'rgb(var(--nv-text-muted))' }}>
              Step 1 of 8
            </span>
          </div>
          <div className={styles.progressBar}><span /></div>
          <ul className={styles.stepList}>
            {STEPS.map((s, i) => (
              <li key={s} className={i === 0 ? styles.stepActive : styles.step}>
                {s}
              </li>
            ))}
          </ul>
          <div className={styles.privateNote}>
            Your answers are never stored.<br />
            <strong>Anonymous · private · secure</strong>
          </div>
        </aside>

        {/* Question panel — live assessment questionnaire */}
        <div className={styles.questionPanel}>
          <OperationalQuestionnaire variant="public" embedded />
        </div>

        {/* Live friction profile — static display */}
        <aside className={styles.profile}>
          <div className={styles.profileHead}>
            <div className={styles.panelTitle} style={{ color: 'rgb(var(--nv-accent-teal))' }}>
              Live friction profile
            </div>
          </div>
          <div className={styles.scoreGrid}>
            <div>
              <div className={styles.panelTitle}>Current friction score</div>
              <div className={styles.scoreNum}>68 <span>/ 100</span></div>
            </div>
            <div>
              <div className={styles.riskLabel}>Moderate risk</div>
              <p className={styles.riskText}>
                Material friction detected. Focus on the top 2–3 breakpoints.
              </p>
            </div>
          </div>
          {METRICS.map(m => (
            <div key={m.label} className={styles.metricRow}>
              <span>{m.label}</span>
              <div className={m.amber ? styles.barAmber : styles.bar}>
                <span style={{ width: `${m.value}%` }} />
              </div>
              <b className={styles.metricValue}>{m.value}</b>
            </div>
          ))}
          <p className={styles.fine}>Score updates in real time as you answer</p>
        </aside>
      </section>

      {/* ── Proof strip ──────────────────────────────────────────── */}
      <div className={styles.proofStrip}>
        <div className={styles.proofLogos}>
          <strong>Diagnose. Prioritize. Prove.</strong>
          <span>Control under pressure.</span>
        </div>
        <div className={styles.proofQuote}>
          Assessment output: workflow map · friction score · control plan
        </div>
        <div className={styles.proofDetail}>
          <strong>Novendor</strong><br />
          Operational intelligence for teams that move fast and need evidence to back it up.
        </div>
      </div>
    </>
  );
}
