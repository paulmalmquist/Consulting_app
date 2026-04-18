// Right-rail intelligence modules: Receipt intake, Reconciliation, Revenue watch

const INTAKE = [
  { id: 'R-9213', vendor: 'Figma Inc',    amount: 142.80, when: '12m',   conf: 94, source: 'email' },
  { id: 'R-9212', vendor: 'Notion Labs',  amount:  96.00, when: '28m',   conf: 97, source: 'gmail' },
  { id: 'R-9211', vendor: 'Uber',         amount:  62.10, when: '1h',    conf: 71, source: 'ios',   flag: true },
  { id: 'R-9210', vendor: 'Datadog',      amount:2980.00, when: '2h',    conf: 88, source: 'email' },
  { id: 'R-9209', vendor: 'OpenAI',       amount: 240.00, when: '3h',    conf: 99, source: 'email' },
  { id: 'R-9208', vendor: 'Best Buy',     amount: 894.20, when: '1d',    conf: 62, source: 'upload',flag: true },
  { id: 'R-9207', vendor: 'Hilton SF',    amount: 412.00, when: '1d',    conf: 91, source: 'ios' },
];

function ReceiptIntake() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {INTAKE.map((r, i) => {
        const confColor = r.conf >= 95 ? 'var(--sem-up)' : r.conf >= 80 ? 'var(--neon-cyan)' : 'var(--neon-amber)';
        const kind = { email: 'EML', gmail: 'GML', ios: 'iOS', upload: 'UPL', ramp: 'API' }[r.source] || 'FIL';
        return (
          <div key={r.id} style={{
            display: 'grid', gridTemplateColumns: '32px 1fr auto',
            gap: 10, padding: '8px 12px',
            borderBottom: i < INTAKE.length - 1 ? '1px solid var(--line-1)' : 'none',
            alignItems: 'center',
            cursor: 'pointer',
            background: r.flag ? 'rgba(255,176,32,.03)' : 'transparent',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-row-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = r.flag ? 'rgba(255,176,32,.03)' : 'transparent'}
          >
            {/* file icon */}
            <div style={{
              width: 30, height: 36,
              border: `1px solid ${r.flag ? 'var(--neon-amber)' : 'var(--line-3)'}`,
              background: 'var(--bg-inset)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 8, color: r.flag ? 'var(--neon-amber)' : 'var(--fg-3)',
              letterSpacing: '.06em',
              position: 'relative',
            }}>
              <span style={{ position: 'absolute', top: 2, right: 2, width: 0, height: 0, borderTop: '4px solid var(--line-3)', borderLeft: '4px solid transparent' }} />
              {kind}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-1)', fontWeight: 500, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{r.vendor}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(r.amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', marginTop: 2 }}>
                <span>{r.source} · {r.when} ago</span>
                <span style={{ color: confColor }}>{r.conf}%{r.flag ? ' · review' : ''}</span>
              </div>
            </div>
            <span style={{ color: 'var(--fg-4)', fontSize: 11 }}>›</span>
          </div>
        );
      })}
    </div>
  );
}

// Reconciliation matching panel — triage board
const UNMATCHED = [
  { id: 'T-88229', desc: 'AWS US EAST',   amount: 1248.00, date: 'Apr 17', likely: [{ r: 'R-9210', v: 'AWS Invoice 8421', c: 97 }, { r: 'R-9203', v: 'AWS Apr', c: 62 }] },
  { id: 'T-88224', desc: 'LEGALZOOM.COM', amount: 4200.00, date: 'Apr 17', likely: [] },
  { id: 'T-88210', desc: 'RAMP.COM',      amount: 7420.00, date: 'Apr 14', likely: [{ r: 'R-9205', v: 'Ramp Apr', c: 100 }] },
];
const SPLITS = [
  { id: 'T-88215', desc: 'BEST BUY #0214', amount: 894.20, note: '2 receipts · suggest split 68/32' },
];

function ReconcilePanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 12px 4px', borderBottom: '1px solid var(--line-1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Caps color="var(--neon-amber)">UNMATCHED · 3</Caps>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-3)', letterSpacing: '.08em' }}>$12,868 total</span>
        </div>
      </div>
      {UNMATCHED.map((t, i) => (
        <div key={t.id} style={{
          padding: '8px 12px',
          borderBottom: i < UNMATCHED.length - 1 ? '1px solid var(--line-1)' : '1px solid var(--line-2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <span style={{ color: 'var(--fg-1)' }}>{t.desc}</span>
            <span style={{ color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(t.amount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', marginTop: 2 }}>
            <span>{t.id} · {t.date}</span>
            <span>{t.likely.length > 0 ? `${t.likely.length} likely` : 'no match'}</span>
          </div>
          {t.likely.length > 0 ? (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {t.likely.slice(0, 2).map((l, j) => (
                <div key={j} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  padding: '4px 6px',
                  background: 'var(--bg-inset)',
                  border: `1px solid ${j === 0 ? 'var(--neon-cyan)' : 'var(--line-2)'}`,
                  color: j === 0 ? 'var(--fg-1)' : 'var(--fg-2)',
                  borderRadius: 2, cursor: 'pointer',
                }}>
                  <span>↪ {l.v}</span>
                  <span style={{ color: j === 0 ? 'var(--neon-cyan)' : 'var(--fg-3)' }}>{l.c}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
              <Button kind="accent" size="xs">Find match</Button>
              <Button kind="ghost" size="xs">Create entry</Button>
            </div>
          )}
        </div>
      ))}
      <div style={{ padding: '8px 12px 4px', borderBottom: '1px solid var(--line-1)' }}>
        <Caps color="var(--neon-amber)">SPLIT NEEDED · 1</Caps>
      </div>
      {SPLITS.map((s) => (
        <div key={s.id} style={{ padding: '8px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <span style={{ color: 'var(--fg-1)' }}>{s.desc}</span>
            <span style={{ color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(s.amount)}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', marginTop: 2 }}>{s.note}</div>
          <div style={{ marginTop: 6 }}><Button kind="accent" size="xs">Propose split</Button></div>
        </div>
      ))}
    </div>
  );
}

// Revenue watch
const OVERDUE = [
  { id: 'INV-2038', client: 'Northwind Trading', amount: 32400.00, days: 7 },
  { id: 'INV-2037', client: 'Globex Ltd',        amount: 18200.00, days: 14 },
  { id: 'INV-2039', client: 'Initech',           amount:  8400.00, days: 0 },
];
const UPCOMING = [
  { id: 'INV-2036', client: 'Acme Corp',   amount: 24000.00, due: 'May 10', days: 23 },
  { id: 'INV-2035', client: 'Umbrella Co', amount:  9200.00, due: 'May 12', days: 25 },
];
const PAYMENTS = [
  { id: 'INV-2041', client: 'Acme Corp',   amount: 18400.00, when: '3h' },
  { id: 'INV-2040', client: 'Globex Ltd',  amount: 12000.00, when: '1d' },
];

function RevenueWatch() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 12px 4px', borderBottom: '1px solid var(--line-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Caps color="var(--sem-error)">OVERDUE · 3</Caps>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--sem-down)', textShadow: '0 0 6px rgba(255,31,61,.5)' }}>$59,000</span>
      </div>
      {OVERDUE.map((o, i) => (
        <div key={o.id} style={{
          display: 'grid', gridTemplateColumns: '1fr auto',
          padding: '6px 12px',
          borderBottom: i < OVERDUE.length - 1 ? '1px solid var(--line-1)' : '1px solid var(--line-2)',
          borderLeft: o.days > 0 ? '2px solid var(--sem-error)' : '2px solid transparent',
          background: o.days > 0 ? 'rgba(255,31,61,.03)' : 'transparent',
          cursor: 'pointer',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-1)' }}>{o.client}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: o.days > 0 ? 'var(--sem-down)' : 'var(--neon-amber)', marginTop: 1 }}>
              {o.id} · {o.days > 0 ? `overdue ${o.days}d` : 'due today'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(o.amount)}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--neon-cyan)', letterSpacing: '.08em' }}>REMIND ›</div>
          </div>
        </div>
      ))}

      <div style={{ padding: '8px 12px 4px', borderBottom: '1px solid var(--line-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Caps color="var(--neon-amber)">UPCOMING · 2</Caps>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-3)', letterSpacing: '.08em' }}>$33,200</span>
      </div>
      {UPCOMING.map((u, i) => (
        <div key={u.id} style={{
          display: 'grid', gridTemplateColumns: '1fr auto',
          padding: '6px 12px',
          borderBottom: i < UPCOMING.length - 1 ? '1px solid var(--line-1)' : '1px solid var(--line-2)',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-1)' }}>{u.client}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', marginTop: 1 }}>{u.id} · due {u.due} · {u.days}d</div>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums', alignSelf: 'center' }}>{fmtUSD(u.amount)}</div>
        </div>
      ))}

      <div style={{ padding: '8px 12px 4px', borderBottom: '1px solid var(--line-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Caps color="var(--sem-up)">RECENT PAYMENTS · 2</Caps>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--sem-up)', letterSpacing: '.08em' }}>+ $30,400</span>
      </div>
      {PAYMENTS.map((p, i) => (
        <div key={p.id} style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr auto',
          gap: 8, padding: '6px 12px',
          borderBottom: i < PAYMENTS.length - 1 ? '1px solid var(--line-1)' : 'none',
          alignItems: 'center',
        }}>
          <Dot color="#00E5A0" size={5} />
          <div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-1)' }}>{p.client}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', marginTop: 1 }}>{p.id} · paid {p.when} ago</div>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sem-up)', fontVariantNumeric: 'tabular-nums' }}>+{fmtUSD(p.amount)}</div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { ReceiptIntake, ReconcilePanel, RevenueWatch });
