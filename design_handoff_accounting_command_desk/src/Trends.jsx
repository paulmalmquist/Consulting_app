// Bottom trends band: 3 shallow panels

function ExpenseByCategory() {
  const data = [
    { cat: 'Payroll',         amount: 148200, color: 'var(--neon-cyan)', pct: 46.5 },
    { cat: 'Software & SaaS', amount:  42100, color: 'var(--neon-violet)', pct: 13.2 },
    { cat: 'Contractors',     amount:  38400, color: 'var(--neon-magenta)', pct: 12.0 },
    { cat: 'Rent & Ops',      amount:  28900, color: 'var(--neon-amber)', pct:  9.1 },
    { cat: 'Travel',          amount:  19200, color: 'var(--neon-lime)', pct:  6.0 },
    { cat: 'Legal & Prof',    amount:  14200, color: 'var(--sem-up)', pct:  4.5 },
    { cat: 'Other',           amount:  27900, color: 'var(--fg-3)', pct: 8.7 },
  ];
  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* stacked bar */}
      <div style={{ display: 'flex', height: 10, background: 'var(--bg-inset)', border: '1px solid var(--line-2)' }}>
        {data.map((d, i) => (
          <div key={i} style={{ width: d.pct + '%', background: d.color, borderRight: i < data.length - 1 ? '1px solid var(--bg-void)' : 'none' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', columnGap: 16, rowGap: 3 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto auto', gap: 8, alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <span style={{ width: 8, height: 8, background: d.color, display: 'inline-block' }} />
            <span style={{ color: 'var(--fg-2)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{d.cat}</span>
            <span style={{ color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' }}>{fmtUSDK(d.amount)}</span>
            <span style={{ color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums', width: 44, textAlign: 'right' }}>{d.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolingTrend() {
  const months = ['Nov','Dec','Jan','Feb','Mar','Apr'];
  const vals = [28400, 31200, 33100, 36800, 38900, 42100];
  const max = Math.max(...vals);
  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>$42,100</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--neon-amber)' }}>▲ +8.24% MoM</span>
      </div>
      <div style={{ position: 'relative', height: 60, display: 'flex', gap: 4, alignItems: 'flex-end', padding: '0 4px' }}>
        {vals.map((v, i) => {
          const h = (v / max) * 52;
          const last = i === vals.length - 1;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{
                width: '100%', height: h,
                background: last ? 'var(--neon-violet)' : 'rgba(176,124,255,.35)',
                borderTop: `1px solid ${last ? '#E8D8FF' : 'rgba(176,124,255,.6)'}`,
                boxShadow: last ? '0 0 8px rgba(176,124,255,.5)' : 'none',
              }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: last ? 'var(--fg-1)' : 'var(--fg-4)', letterSpacing: '.08em' }}>{months[i]}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', paddingTop: 4, borderTop: '1px solid var(--line-1)' }}>
        <span>18 vendors · 4 new this Q</span>
        <span style={{ color: 'var(--neon-cyan)' }}>drill ›</span>
      </div>
    </div>
  );
}

function CashMovement() {
  const days = 30;
  const inflow  = [32,28,34,42,38,45,52,48,41,37,44,58,61,49,38,42,56,62,71,64,55,48,52,67,73,68,59,63,71,78];
  const outflow = [18,22,19,24,31,28,26,34,29,33,38,41,36,42,39,44,48,42,51,46,44,39,47,53,49,52,46,51,58,54];
  const max = Math.max(...inflow, ...outflow);
  const mk = (arr) => arr.map((v, i) => `${(i / (days - 1)) * 100},${100 - (v / max) * 88}`).join(' ');
  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '.1em' }}>NET · 30D</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--sem-up)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>+$163,408</div>
        </div>
        <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
          <span style={{ color: 'var(--sem-up)' }}>◉ IN  $482K</span>
          <span style={{ color: 'var(--neon-magenta)' }}>◉ OUT $319K</span>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 80, border: '1px solid var(--line-2)', background: 'var(--bg-inset)', position: 'relative' }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ display: 'block' }}>
          <defs>
            <linearGradient id="inGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#00E5A0" stopOpacity=".3" />
              <stop offset="1" stopColor="#00E5A0" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="outGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#FF2E9A" stopOpacity=".25" />
              <stop offset="1" stopColor="#FF2E9A" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25,50,75].map(y => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="var(--line-1)" strokeWidth="0.3" strokeDasharray="1 1" />)}
          <polygon fill="url(#inGrad)" points={`0,100 ${mk(inflow)} 100,100`} />
          <polyline fill="none" stroke="#00E5A0" strokeWidth="0.8" points={mk(inflow)} vectorEffect="non-scaling-stroke" />
          <polygon fill="url(#outGrad)" points={`0,100 ${mk(outflow)} 100,100`} />
          <polyline fill="none" stroke="#FF2E9A" strokeWidth="0.8" points={mk(outflow)} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '.06em' }}>
        <span>Mar 18</span><span>Apr 02</span><span>Apr 17</span>
      </div>
    </div>
  );
}

function TrendsBand() {
  const panels = [
    { title: 'EXPENSE BY CATEGORY', caption: '30D · $318,902', accent: 'var(--neon-cyan)',    body: <ExpenseByCategory /> },
    { title: 'TOOLING SPEND',       caption: 'software / saas · 6mo', accent: 'var(--neon-violet)',  body: <ToolingTrend /> },
    { title: 'CASH MOVEMENT',       caption: '30D · all accounts',   accent: 'var(--sem-up)',       body: <CashMovement /> },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0, borderTop: '1px solid var(--line-2)', background: 'var(--bg-panel)' }}>
      {panels.map((p, i) => (
        <div key={i} style={{ borderRight: i < 2 ? '1px solid var(--line-2)' : 'none', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${p.accent}, transparent)` }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 14px', borderBottom: '1px solid var(--line-2)', background: 'var(--bg-panel-2)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <Caps color={p.accent}>{p.title}</Caps>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>{p.caption}</span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '.08em', cursor: 'pointer' }}>EXPAND ›</span>
          </div>
          {p.body}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { TrendsBand });
