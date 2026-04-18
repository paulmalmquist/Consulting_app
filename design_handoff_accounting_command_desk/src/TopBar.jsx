// Top control bar: title + descriptor on left, primary actions on right; compact filter row below.

function TopControlBar({ onAction }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '0 16px', height: 52,
      background: 'var(--bg-void)', borderBottom: '1px solid var(--line-2)',
    }}>
      {/* Logo + product */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
        <img src="./assets/novendor_logo.png" style={{ width: 24, height: 24, objectFit: 'contain' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--fg-1)', lineHeight: 1 }}>NOVENDOR</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-3)', letterSpacing: '.12em', textTransform: 'uppercase' }}>ACCOUNTING</span>
        </div>
      </div>

      <div style={{ width: 1, height: 28, background: 'var(--line-2)' }} />

      {/* Title + descriptor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--fg-1)', lineHeight: 1 }}>Command Desk</span>
          <Dot color="#00E5A0" size={5} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '.08em' }}>LIVE · books synced 14s ago</span>
        </div>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-3)' }}>
          what needs action now · 47 items across 3 entities · last close — Q1 2026
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Global meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot color="#00E5A0" size={5} /> <span style={{ color: 'var(--fg-1)' }}>3,482</span> synced</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot color="#FFB020" size={5} /> <span style={{ color: 'var(--neon-amber)' }}>47</span> needs action</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot color="#FF1F3D" size={5} /> <span style={{ color: 'var(--sem-error)' }}>3</span> overdue</span>
        <span style={{ color: 'var(--line-3)' }}>│</span>
        <LiveClock />
        <span style={{ color: 'var(--line-3)' }}>│</span>
        <span style={{ padding: '2px 6px', border: '1px solid #FF2E9A', color: 'var(--neon-magenta)', letterSpacing: '.1em' }}>PROD</span>
        <span style={{ color: 'var(--fg-2)' }}>m.rivera</span>
      </div>

      <div style={{ width: 1, height: 28, background: 'var(--line-2)' }} />

      {/* Primary actions */}
      <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
        <Button kind="secondary" size="sm" onClick={() => onAction && onAction('import')}>Import txns</Button>
        <Button kind="secondary" size="sm" onClick={() => onAction && onAction('invoice')}>+ Invoice</Button>
        <Button kind="secondary" size="sm" onClick={() => onAction && onAction('expense')}>+ Expense</Button>
        <Button kind="primary" size="sm" onClick={() => onAction && onAction('upload')}>↑ Upload receipt</Button>
      </div>
    </div>
  );
}

function FilterStrip({ unresolvedOnly, onToggleUnresolved, query, onQuery }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 16px', height: 42,
      background: 'var(--bg-base)', borderBottom: '1px solid var(--line-2)',
    }}>
      <Caps>FILTERS</Caps>
      <span style={{ color: 'var(--line-3)', fontFamily: 'var(--font-mono)' }}>│</span>

      <FilterPill label="range" value="Apr 1 — Apr 17" active />
      <FilterPill label="entity" value="Novendor LLC" />
      <FilterPill label="client" value="all" />
      <FilterPill label="status" value="open" />
      <FilterPill label="assignee" value="m.rivera" />

      {/* unresolved-only toggle */}
      <div onClick={onToggleUnresolved} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '0 10px', height: 26, borderRadius: 3, cursor: 'pointer',
        fontFamily: 'var(--font-mono)', fontSize: 11,
        border: `1px solid ${unresolvedOnly ? 'var(--neon-amber)' : 'var(--line-2)'}`,
        background: unresolvedOnly ? 'rgba(255,176,32,.08)' : 'var(--bg-inset)',
        color: unresolvedOnly ? 'var(--neon-amber)' : 'var(--fg-2)',
        transition: 'all 80ms',
      }}>
        <span style={{
          width: 11, height: 11, borderRadius: 2,
          border: `1px solid ${unresolvedOnly ? 'var(--neon-amber)' : 'var(--line-3)'}`,
          background: unresolvedOnly ? 'var(--neon-amber)' : 'transparent',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--bg-void)', fontSize: 9, fontWeight: 700,
        }}>{unresolvedOnly ? '✓' : ''}</span>
        <span style={{ letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 10 }}>Unresolved only</span>
      </div>

      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 10px', borderRadius: 2,
        border: '1px dashed var(--line-3)', color: 'var(--fg-3)', cursor: 'pointer',
      }}>+ add filter</span>

      <div style={{ flex: 1 }} />

      <Field
        value={query} onChange={(e) => onQuery(e.target.value)}
        prefix=">" suffix="⌘K" style={{ width: 280 }} height={26}
        placeholder="vendor, amount, memo, invoice #"
      />
    </div>
  );
}

Object.assign(window, { TopControlBar, FilterStrip });
