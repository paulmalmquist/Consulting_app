// Needs Attention queue + view switcher + detail drawer

const QUEUE = [
  { id: 'Q-4821', type: 'review-receipt',  date: 'Apr 17', time: '14:12', amount:  142.80, party: 'Figma Inc',         client: 'Acme Corp · Design sprint', state: 'OCR 94%',      age: '12m',  action: 'Review parsed receipt', tone: 'info',   priority: 2 },
  { id: 'Q-4820', type: 'match-receipt',   date: 'Apr 17', time: '13:48', amount: 1248.00, party: 'AWS',               client: 'Internal',                  state: 'Needs match',   age: '36m',  action: 'Match receipt → txn',   tone: 'warn',   priority: 2 },
  { id: 'Q-4819', type: 'categorize',      date: 'Apr 17', time: '13:22', amount: 4200.00, party: 'LegalZoom',         client: 'Novendor LLC',              state: 'Uncategorized', age: '1h',   action: 'Categorize charge',     tone: 'warn',   priority: 3 },
  { id: 'Q-4818', type: 'overdue-invoice', date: 'Apr 10', time: '—',     amount:32400.00, party: 'Northwind Trading', client: 'Northwind · Q1 Retainer',   state: 'Overdue 7d',    age: '7d',   action: 'Follow up overdue',     tone: 'error', priority: 1, glow: true },
  { id: 'Q-4817', type: 'reimbursable',    date: 'Apr 16', time: '09:02', amount:  284.50, party: 's.chen',            client: 'United · PDX→JFK',          state: 'Pending approval', age: '1d', action: 'Mark reimbursable',     tone: 'tag',    priority: 3 },
  { id: 'Q-4816', type: 'review-receipt',  date: 'Apr 16', time: '18:44', amount:   62.10, party: 'Uber',              client: 'Acme Corp · Client visit',  state: 'OCR 71%',       age: '1d',   action: 'Review parsed receipt', tone: 'info',   priority: 3 },
  { id: 'Q-4815', type: 'match-receipt',   date: 'Apr 16', time: '12:20', amount: 2980.00, party: 'Datadog',           client: 'Internal',                  state: '3 likely matches', age: '1d', action: 'Match receipt → txn',   tone: 'warn',   priority: 2 },
  { id: 'Q-4814', type: 'overdue-invoice', date: 'Apr 03', time: '—',     amount:18200.00, party: 'Globex',            client: 'Globex · Onboarding',       state: 'Overdue 14d',   age: '14d',  action: 'Escalate collections',  tone: 'error', priority: 1, glow: true },
  { id: 'Q-4813', type: 'categorize',      date: 'Apr 15', time: '16:51', amount:  894.20, party: 'Best Buy',          client: 'Internal',                  state: 'Split needed',  age: '2d',   action: 'Split & categorize',    tone: 'warn',   priority: 2 },
  { id: 'Q-4812', type: 'reimbursable',    date: 'Apr 15', time: '11:14', amount:  412.00, party: 'm.ortega',          client: 'Hilton SF · Conf',          state: 'Pending approval', age: '2d', action: 'Mark reimbursable',     tone: 'tag',    priority: 3 },
  { id: 'Q-4811', type: 'review-receipt',  date: 'Apr 15', time: '08:33', amount:   28.40, party: 'Blue Bottle',       client: 'Acme Corp',                 state: 'OCR 88%',       age: '2d',   action: 'Review parsed receipt', tone: 'info',   priority: 3 },
  { id: 'Q-4810', type: 'match-receipt',   date: 'Apr 14', time: '19:40', amount: 7420.00, party: 'Ramp',              client: 'Internal',                  state: 'No match found',age: '3d',   action: 'Create manual match',   tone: 'warn',   priority: 2 },
  { id: 'Q-4809', type: 'categorize',      date: 'Apr 14', time: '15:09', amount: 1200.00, party: 'WeWork',            client: 'Novendor LLC',              state: 'Uncategorized', age: '3d',   action: 'Categorize charge',     tone: 'warn',   priority: 3 },
  { id: 'Q-4808', type: 'overdue-invoice', date: 'Apr 02', time: '—',     amount: 8400.00, party: 'Initech',           client: 'Initech · Audit',           state: 'Overdue 15d',   age: '15d',  action: 'Follow up overdue',     tone: 'error', priority: 1, glow: true },
];

const TYPE_META = {
  'review-receipt':  { label: 'REVIEW RECEIPT',  color: 'var(--neon-cyan)',    mark: '◉' },
  'match-receipt':   { label: 'MATCH TO TXN',    color: 'var(--neon-amber)',   mark: '⇋' },
  'categorize':      { label: 'CATEGORIZE',      color: 'var(--neon-amber)',   mark: '⊕' },
  'overdue-invoice': { label: 'OVERDUE INVOICE', color: 'var(--sem-error)',    mark: '!' },
  'reimbursable':    { label: 'REIMBURSABLE',    color: 'var(--neon-violet)',  mark: '◐' },
};

function ViewSwitcher({ view, onView, counts }) {
  const views = [
    { k: 'needs', label: 'Needs Attention', count: counts.needs, accent: 'var(--neon-amber)' },
    { k: 'txns',  label: 'Transactions',   count: counts.txns,  accent: 'var(--neon-cyan)' },
    { k: 'recs',  label: 'Receipts',       count: counts.recs,  accent: 'var(--neon-cyan)' },
    { k: 'invs',  label: 'Invoices',       count: counts.invs,  accent: 'var(--neon-cyan)' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--line-2)', background: 'var(--bg-panel-2)' }}>
      {views.map(v => {
        const isA = v.k === view;
        return (
          <div key={v.k} onClick={() => onView(v.k)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 18px', height: 36, cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
            color: isA ? 'var(--fg-1)' : 'var(--fg-3)',
            background: isA ? 'var(--bg-panel)' : 'transparent',
            borderRight: '1px solid var(--line-2)',
            borderBottom: isA ? `2px solid ${v.accent}` : '2px solid transparent',
            marginBottom: -1,
          }}>
            <span>{v.label}</span>
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 2,
              background: isA ? v.accent : 'var(--bg-inset)',
              color: isA ? 'var(--bg-void)' : 'var(--fg-3)',
              border: `1px solid ${isA ? v.accent : 'var(--line-2)'}`,
              fontWeight: 600,
            }}>{v.count}</span>
          </div>
        );
      })}
      <div style={{ flex: 1, borderBottom: '1px solid var(--line-2)', marginBottom: -1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '.08em' }}>
        <Caps>SORT</Caps>
        <span style={{ color: 'var(--fg-1)' }}>priority ▾</span>
        <span style={{ color: 'var(--line-3)' }}>│</span>
        <Caps>GROUP</Caps>
        <span style={{ color: 'var(--fg-1)' }}>none ▾</span>
      </div>
    </div>
  );
}

function NeedsAttentionTable({ rows, selectedId, onSelect }) {
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, minWidth: 0, background: 'var(--bg-base)' }}>
      {/* header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '22px 130px 68px 90px 1fr 1fr 130px 180px 60px',
        padding: '6px 14px', borderBottom: '1px solid var(--line-2)', background: 'var(--bg-panel-2)',
        color: 'var(--fg-3)', letterSpacing: '.08em', fontSize: 10, textTransform: 'uppercase',
        position: 'sticky', top: 0, zIndex: 2,
      }}>
        <div></div>
        <div>TYPE</div>
        <div>DATE</div>
        <div style={{ textAlign: 'right' }}>AMOUNT</div>
        <div>COUNTERPARTY</div>
        <div>CLIENT / ENGAGEMENT</div>
        <div>STATE</div>
        <div>NEXT ACTION</div>
        <div style={{ textAlign: 'right' }}>AGE</div>
      </div>
      {rows.map((o) => {
        const active = selectedId === o.id;
        const m = TYPE_META[o.type];
        return (
          <div key={o.id} onClick={() => onSelect(o.id)} style={{
            display: 'grid', gridTemplateColumns: '22px 130px 68px 90px 1fr 1fr 130px 180px 60px',
            padding: '7px 14px', borderBottom: '1px solid var(--line-1)',
            background: active ? 'var(--bg-row-active)' : 'transparent',
            borderLeft: active ? '2px solid var(--neon-cyan)' : o.glow ? '2px solid var(--sem-error)' : '2px solid transparent',
            color: 'var(--fg-1)',
            cursor: 'pointer',
            boxShadow: o.glow && !active ? 'inset 0 0 0 1px rgba(255,31,61,.06)' : 'none',
            transition: 'background 80ms',
          }}
          onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-row-hover)'; }}
          onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ color: m.color, fontSize: 13, textShadow: o.glow ? '0 0 8px rgba(255,31,61,.6)' : 'none' }}>{m.mark}</div>
            <div style={{ color: m.color, letterSpacing: '.08em', fontSize: 10, textTransform: 'uppercase', alignSelf: 'center' }}>{m.label}</div>
            <div style={{ color: 'var(--fg-3)' }}>{o.date}</div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: o.tone === 'error' ? 'var(--sem-down)' : 'var(--fg-1)' }}>{fmtUSD(o.amount)}</div>
            <div style={{ color: 'var(--fg-1)' }}>{o.party}</div>
            <div style={{ color: 'var(--fg-2)' }}>{o.client}</div>
            <div><Badge tone={o.tone} size="sm" glow={o.glow}>{o.state}</Badge></div>
            <div style={{ color: 'var(--fg-2)' }}>{o.action} <span style={{ color: 'var(--neon-cyan)' }}>›</span></div>
            <div style={{ textAlign: 'right', color: o.tone === 'error' ? 'var(--sem-down)' : 'var(--fg-3)' }}>{o.age}</div>
          </div>
        );
      })}
    </div>
  );
}

// Transactions view (alt dataset)
const TXNS = [
  { id: 'T-88231', date: 'Apr 17 · 14:12', account: 'Chase •4481', desc: 'FIGMA.COM · SF CA',          amount: -142.80, cat: 'Software',        match: 'receipt ✓', state: 'categorized' },
  { id: 'T-88229', date: 'Apr 17 · 13:48', account: 'Chase •4481', desc: 'AWS US EAST',                amount: -1248.00,cat: '—',               match: 'unmatched', state: 'unreviewed' },
  { id: 'T-88227', date: 'Apr 17 · 11:02', account: 'Stripe',      desc: 'ACME CORP · INV-2041',       amount: 18400.00,cat: 'Revenue',         match: 'invoice ✓', state: 'reconciled' },
  { id: 'T-88224', date: 'Apr 17 · 09:30', account: 'Chase •4481', desc: 'LEGALZOOM.COM',              amount: -4200.00,cat: '—',               match: 'unmatched', state: 'unreviewed' },
  { id: 'T-88221', date: 'Apr 16 · 18:44', account: 'Amex •1007',  desc: 'UBER   TRIP 4821',           amount: -62.10,  cat: 'Travel',          match: 'receipt ✓', state: 'categorized' },
  { id: 'T-88219', date: 'Apr 16 · 12:20', account: 'Chase •4481', desc: 'DATADOG INC',                amount: -2980.00,cat: 'Software',        match: '3 likely',  state: 'unreviewed' },
  { id: 'T-88217', date: 'Apr 16 · 08:12', account: 'Stripe',      desc: 'GLOBEX LTD · INV-2038',      amount: 12000.00,cat: 'Revenue',         match: 'invoice ✓', state: 'reconciled' },
  { id: 'T-88215', date: 'Apr 15 · 16:51', account: 'Amex •1007',  desc: 'BEST BUY #0214',             amount: -894.20, cat: '—',               match: 'split?',    state: 'unreviewed' },
  { id: 'T-88213', date: 'Apr 15 · 10:00', account: 'Chase •4481', desc: 'GUSTO PAYROLL',              amount: -48210.00,cat: 'Payroll',        match: 'auto',      state: 'categorized' },
  { id: 'T-88210', date: 'Apr 14 · 19:40', account: 'Chase •4481', desc: 'RAMP.COM',                   amount: -7420.00,cat: '—',               match: 'unmatched', state: 'unreviewed' },
];

function TransactionsTable({ onSelect, selectedId }) {
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, minWidth: 0, background: 'var(--bg-base)' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '90px 150px 120px 1fr 110px 130px 100px 110px',
        padding: '6px 14px', borderBottom: '1px solid var(--line-2)', background: 'var(--bg-panel-2)',
        color: 'var(--fg-3)', letterSpacing: '.08em', fontSize: 10, textTransform: 'uppercase',
      }}>
        <div>ID</div><div>DATE · TIME</div><div>ACCOUNT</div><div>DESCRIPTION</div>
        <div style={{ textAlign: 'right' }}>AMOUNT</div><div>CATEGORY</div><div>MATCH</div><div>STATE</div>
      </div>
      {TXNS.map((t) => {
        const active = selectedId === t.id;
        const stateTone = t.state === 'reconciled' ? 'up' : t.state === 'categorized' ? 'live' : 'warn';
        return (
          <div key={t.id} onClick={() => onSelect && onSelect(t.id)} style={{
            display: 'grid', gridTemplateColumns: '90px 150px 120px 1fr 110px 130px 100px 110px',
            padding: '7px 14px', borderBottom: '1px solid var(--line-1)',
            background: active ? 'var(--bg-row-active)' : 'transparent',
            borderLeft: active ? '2px solid var(--neon-cyan)' : '2px solid transparent',
            cursor: 'pointer',
          }}>
            <div style={{ color: 'var(--fg-3)' }}>{t.id}</div>
            <div style={{ color: 'var(--fg-2)' }}>{t.date}</div>
            <div style={{ color: 'var(--fg-2)' }}>{t.account}</div>
            <div style={{ color: 'var(--fg-1)' }}>{t.desc}</div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: t.amount > 0 ? 'var(--sem-up)' : 'var(--fg-1)' }}>
              {t.amount > 0 ? '+' : ''}{fmtUSD(t.amount)}
            </div>
            <div style={{ color: t.cat === '—' ? 'var(--fg-4)' : 'var(--neon-violet)' }}>{t.cat}</div>
            <div style={{ color: t.match === 'unmatched' ? 'var(--neon-amber)' : t.match.includes('✓') ? 'var(--sem-up)' : 'var(--neon-amber)' }}>{t.match}</div>
            <div><Badge tone={stateTone} size="sm">{t.state}</Badge></div>
          </div>
        );
      })}
    </div>
  );
}

// Receipts view
const RECEIPTS = [
  { id: 'R-9213', date: 'Apr 17 · 14:12', vendor: 'Figma Inc',    amount: 142.80, source: 'email · drop',  conf: 94, state: 'review' },
  { id: 'R-9212', date: 'Apr 17 · 09:22', vendor: 'Notion Labs',  amount: 96.00,  source: 'gmail fwd',     conf: 97, state: 'auto-matched' },
  { id: 'R-9211', date: 'Apr 16 · 18:44', vendor: 'Uber',         amount: 62.10,  source: 'ios share',     conf: 71, state: 'review' },
  { id: 'R-9210', date: 'Apr 16 · 12:20', vendor: 'Datadog',      amount: 2980.00,source: 'email · drop',  conf: 88, state: 'matched' },
  { id: 'R-9209', date: 'Apr 16 · 11:40', vendor: 'OpenAI',       amount: 240.00, source: 'email · drop',  conf: 99, state: 'auto-matched' },
  { id: 'R-9208', date: 'Apr 15 · 16:51', vendor: 'Best Buy',     amount: 894.20, source: 'upload',        conf: 62, state: 'review' },
  { id: 'R-9207', date: 'Apr 15 · 11:14', vendor: 'Hilton SF',    amount: 412.00, source: 'ios share',     conf: 91, state: 'review' },
  { id: 'R-9206', date: 'Apr 15 · 08:33', vendor: 'Blue Bottle',  amount: 28.40,  source: 'ios share',     conf: 88, state: 'matched' },
  { id: 'R-9205', date: 'Apr 14 · 19:40', vendor: 'Ramp',         amount: 7420.00,source: 'ramp api',      conf: 100,state: 'auto-matched' },
];

function ReceiptsTable({ onSelect, selectedId }) {
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, minWidth: 0, background: 'var(--bg-base)' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '90px 160px 1fr 120px 150px 90px 140px',
        padding: '6px 14px', borderBottom: '1px solid var(--line-2)', background: 'var(--bg-panel-2)',
        color: 'var(--fg-3)', letterSpacing: '.08em', fontSize: 10, textTransform: 'uppercase',
      }}>
        <div>ID</div><div>RECEIVED</div><div>VENDOR</div>
        <div style={{ textAlign: 'right' }}>TOTAL</div><div>SOURCE</div><div>CONF</div><div>STATE</div>
      </div>
      {RECEIPTS.map((r) => {
        const active = selectedId === r.id;
        const confColor = r.conf >= 95 ? 'var(--sem-up)' : r.conf >= 80 ? 'var(--neon-cyan)' : 'var(--neon-amber)';
        const tone = r.state === 'review' ? 'warn' : r.state === 'matched' ? 'live' : 'up';
        return (
          <div key={r.id} onClick={() => onSelect && onSelect(r.id)} style={{
            display: 'grid', gridTemplateColumns: '90px 160px 1fr 120px 150px 90px 140px',
            padding: '7px 14px', borderBottom: '1px solid var(--line-1)',
            background: active ? 'var(--bg-row-active)' : 'transparent',
            cursor: 'pointer',
          }}>
            <div style={{ color: 'var(--fg-3)' }}>{r.id}</div>
            <div style={{ color: 'var(--fg-2)' }}>{r.date}</div>
            <div style={{ color: 'var(--fg-1)' }}>{r.vendor}</div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(r.amount)}</div>
            <div style={{ color: 'var(--fg-2)' }}>{r.source}</div>
            <div style={{ color: confColor, fontVariantNumeric: 'tabular-nums' }}>{r.conf}%</div>
            <div><Badge tone={tone} size="sm">{r.state}</Badge></div>
          </div>
        );
      })}
    </div>
  );
}

// Invoices view
const INVOICES = [
  { id: 'INV-2041', client: 'Acme Corp',         issued: 'Apr 05', due: 'May 05', amount: 18400.00, paid: 18400.00, state: 'paid',      age: 'paid · Apr 17' },
  { id: 'INV-2040', client: 'Globex Ltd',        issued: 'Apr 01', due: 'May 01', amount: 12000.00, paid: 12000.00, state: 'paid',      age: 'paid · Apr 16' },
  { id: 'INV-2039', client: 'Initech',           issued: 'Apr 02', due: 'Apr 17', amount:  8400.00, paid:     0.00, state: 'overdue',   age: '0d' },
  { id: 'INV-2038', client: 'Northwind Trading', issued: 'Mar 10', due: 'Apr 10', amount: 32400.00, paid:     0.00, state: 'overdue',   age: '7d', glow: true },
  { id: 'INV-2037', client: 'Globex Ltd',        issued: 'Mar 20', due: 'Apr 03', amount: 18200.00, paid:     0.00, state: 'overdue',   age: '14d', glow: true },
  { id: 'INV-2036', client: 'Acme Corp',         issued: 'Apr 10', due: 'May 10', amount: 24000.00, paid:     0.00, state: 'sent',      age: 'due 23d' },
  { id: 'INV-2035', client: 'Umbrella Co',       issued: 'Apr 12', due: 'May 12', amount:  9200.00, paid:     0.00, state: 'sent',      age: 'due 25d' },
  { id: 'INV-2034', client: 'Stark Ind',         issued: 'Apr 15', due: 'May 15', amount: 42000.00, paid:     0.00, state: 'draft',     age: '—' },
];

function InvoicesTable({ onSelect, selectedId }) {
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, minWidth: 0, background: 'var(--bg-base)' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '90px 1fr 90px 90px 120px 120px 100px 120px',
        padding: '6px 14px', borderBottom: '1px solid var(--line-2)', background: 'var(--bg-panel-2)',
        color: 'var(--fg-3)', letterSpacing: '.08em', fontSize: 10, textTransform: 'uppercase',
      }}>
        <div>ID</div><div>CLIENT</div><div>ISSUED</div><div>DUE</div>
        <div style={{ textAlign: 'right' }}>AMOUNT</div><div style={{ textAlign: 'right' }}>OUTSTANDING</div><div>STATE</div><div>AGE</div>
      </div>
      {INVOICES.map((i) => {
        const active = selectedId === i.id;
        const out = i.amount - i.paid;
        const tone = i.state === 'paid' ? 'up' : i.state === 'overdue' ? 'error' : i.state === 'sent' ? 'live' : 'stale';
        return (
          <div key={i.id} onClick={() => onSelect && onSelect(i.id)} style={{
            display: 'grid', gridTemplateColumns: '90px 1fr 90px 90px 120px 120px 100px 120px',
            padding: '7px 14px', borderBottom: '1px solid var(--line-1)',
            background: active ? 'var(--bg-row-active)' : 'transparent',
            borderLeft: i.glow ? '2px solid var(--sem-error)' : '2px solid transparent',
            boxShadow: i.glow ? 'inset 0 0 0 1px rgba(255,31,61,.06)' : 'none',
            cursor: 'pointer',
          }}>
            <div style={{ color: 'var(--fg-3)' }}>{i.id}</div>
            <div style={{ color: 'var(--fg-1)' }}>{i.client}</div>
            <div style={{ color: 'var(--fg-2)' }}>{i.issued}</div>
            <div style={{ color: i.state === 'overdue' ? 'var(--sem-down)' : 'var(--fg-2)' }}>{i.due}</div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(i.amount)}</div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: out > 0 ? 'var(--neon-amber)' : 'var(--fg-3)' }}>
              {out > 0 ? fmtUSD(out) : '—'}
            </div>
            <div><Badge tone={tone} size="sm" glow={i.glow}>{i.state}</Badge></div>
            <div style={{ color: i.glow ? 'var(--sem-down)' : 'var(--fg-2)' }}>{i.age}</div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { QUEUE, TYPE_META, ViewSwitcher, NeedsAttentionTable, TransactionsTable, ReceiptsTable, InvoicesTable });
