// KPI strip: 6 compact terminal panels

function KPIStrip({ active, onSelect }) {
  const tiles = [
    { k: 'cash-in',     label: 'CASH IN · 30D',         value: '$482,310',  delta: '+12.4%',  deltaColor: 'var(--sem-up)', src: 'stripe · chase · 14s', accent: 'var(--neon-cyan)', spark: [12,14,16,15,18,17,20,22,24,23,26,28,30,32], sparkColor: 'var(--neon-cyan)' },
    { k: 'cash-out',    label: 'CASH OUT · 30D',        value: '$318,902',  delta: '+4.80%',  deltaColor: 'var(--neon-amber)', src: 'payroll · ap · 2m',    accent: 'var(--neon-magenta)', spark: [18,17,20,19,22,24,26,25,28,30,29,32,34,36], sparkColor: 'var(--neon-magenta)' },
    { k: 'unpaid',      label: 'UNPAID INVOICES',       value: '$184,210',  delta: '12 open', deltaColor: 'var(--neon-amber)', src: 'ar · live',            accent: 'var(--neon-amber)', spark: [22,24,22,26,28,30,32,30,34,36,38,40,38,41], sparkColor: 'var(--neon-amber)' },
    { k: 'receipts',    label: 'UNREVIEWED RECEIPTS',   value: '23',        delta: '+8 today',deltaColor: 'var(--neon-cyan)', src: 'ocr queue · 5s',       accent: 'var(--neon-cyan)', spark: [4,6,5,8,10,9,12,14,16,15,18,20,22,23], sparkColor: 'var(--neon-cyan)' },
    { k: 'unrecon',     label: 'UNRECONCILED TXNS',     value: '41',        delta: '+3',      deltaColor: 'var(--neon-amber)', src: 'plaid · 1m',           accent: 'var(--neon-amber)', spark: [34,36,35,38,40,42,41,44,43,42,40,41,42,41], sparkColor: 'var(--neon-amber)' },
    { k: 'reimburse',   label: 'REIMBURSABLE PENDING',  value: '$12,840',   delta: '8 staff', deltaColor: 'var(--neon-violet)', src: 'expensify · 9m',       accent: 'var(--neon-violet)', spark: [6,8,7,10,9,12,14,13,16,15,14,13,12,12], sparkColor: 'var(--neon-violet)' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--line-2)' }}>
      {tiles.map((t) => {
        const isActive = active === t.k;
        return (
          <div key={t.k} onClick={() => onSelect(t.k)} style={{
            background: isActive ? 'var(--bg-panel-2)' : 'var(--bg-panel)',
            border: `1px solid ${isActive ? t.accent : 'var(--line-2)'}`,
            padding: '10px 12px 8px', position: 'relative', cursor: 'pointer',
            transition: 'all 80ms',
            boxShadow: isActive ? `0 0 0 1px ${t.accent}33, inset 0 0 40px rgba(0,0,0,.3)` : 'none',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${t.accent}, transparent)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Caps color={isActive ? t.accent : 'var(--fg-3)'}>{t.label}</Caps>
              {isActive && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: t.accent, letterSpacing: '.1em' }}>● FILTERED</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', marginTop: 2, whiteSpace: 'nowrap', lineHeight: 1.1 }}>{t.value}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, whiteSpace: 'nowrap', marginTop: 2 }}>
              <span style={{ color: t.deltaColor }}>{t.delta}</span>
              <span style={{ color: 'var(--fg-4)' }}>{t.src}</span>
            </div>
            <div style={{ marginTop: 4, opacity: 0.8 }}><Sparkline points={t.spark} color={t.sparkColor} height={18} strokeWidth={1} /></div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { KPIStrip });
