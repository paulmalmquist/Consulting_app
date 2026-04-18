// Detail drawer (right-edge slide-in for Needs Attention row)

function DetailDrawer({ item, onClose }) {
  if (!item) return null;
  const m = TYPE_META[item.type];
  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 380,
      background: 'var(--bg-panel)', borderLeft: '1px solid var(--line-3)',
      boxShadow: '-12px 0 32px rgba(0,0,0,.55)',
      display: 'flex', flexDirection: 'column', minHeight: 0,
      fontFamily: 'var(--font-mono)', fontSize: 11,
      animation: 'slideL 140ms cubic-bezier(0.2,0.8,0.2,1)',
      zIndex: 20,
    }}>
      <style>{`@keyframes slideL { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

      {/* Accent bar */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${m.color}, transparent)` }} />

      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-2)', background: 'var(--bg-panel-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Caps color={m.color}>{m.label} · {item.id}</Caps>
          <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--fg-3)', fontSize: 14, padding: '0 4px' }}>×</span>
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 16, color: 'var(--fg-1)', fontWeight: 500 }}>{item.action}</div>
        <div style={{ color: 'var(--fg-3)', marginTop: 4 }}>{item.party} · {item.date} · {item.time}</div>
      </div>

      {/* Amount */}
      <div style={{ padding: '14px', borderBottom: '1px solid var(--line-1)' }}>
        <Caps>AMOUNT</Caps>
        <div style={{ fontSize: 28, color: item.tone === 'error' ? 'var(--sem-down)' : 'var(--fg-1)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', marginTop: 2 }}>{fmtUSD(item.amount)}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fg-3)', marginTop: 4 }}>
          <span>state</span>
          <Badge tone={item.tone} size="sm" glow={item.glow}>{item.state}</Badge>
        </div>
      </div>

      {/* Linked */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-1)' }}>
        <Caps>LINKED TO</Caps>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--fg-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>client</span><span style={{ color: 'var(--fg-1)' }}>{item.client}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>entity</span><span style={{ color: 'var(--fg-1)' }}>Novendor LLC</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>counterparty</span><span style={{ color: 'var(--fg-1)' }}>{item.party}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>age in queue</span><span style={{ color: item.tone === 'error' ? 'var(--sem-down)' : 'var(--fg-1)' }}>{item.age}</span></div>
        </div>
      </div>

      {/* Trace */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-1)' }}>
        <Caps>TRACE</Caps>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, color: 'var(--fg-2)' }}>
          {item.type === 'overdue-invoice' ? <>
            <div>├─ issued · <span style={{ color: 'var(--fg-1)' }}>{item.date}</span></div>
            <div>├─ sent · <span style={{ color: 'var(--sem-up)' }}>delivered · viewed 3×</span></div>
            <div>├─ reminder · <span style={{ color: 'var(--neon-amber)' }}>auto · 3d ago</span></div>
            <div>└─ overdue · <span style={{ color: 'var(--sem-error)' }}>escalate to collections</span></div>
          </> : item.type === 'review-receipt' ? <>
            <div>├─ received · <span style={{ color: 'var(--fg-1)' }}>email · {item.date}</span></div>
            <div>├─ ocr · <span style={{ color: 'var(--sem-up)' }}>extracted · confidence {item.state.split(' ')[1] || '—'}</span></div>
            <div>├─ vendor · <span style={{ color: 'var(--fg-1)' }}>matched to {item.party}</span></div>
            <div>└─ awaiting · <span style={{ color: 'var(--neon-cyan)' }}>human review</span></div>
          </> : <>
            <div>├─ imported · <span style={{ color: 'var(--fg-1)' }}>{item.date}</span></div>
            <div>├─ categorized · <span style={{ color: 'var(--neon-amber)' }}>pending</span></div>
            <div>└─ matched · <span style={{ color: 'var(--fg-3)' }}>awaiting action</span></div>
          </>}
        </div>
      </div>

      {/* Suggestions */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-1)', flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Caps color="var(--neon-cyan)">AI SUGGESTED</Caps>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {item.type === 'categorize' ? (
            ['Software & SaaS', 'Legal & Professional', 'Office Supplies'].map((c, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 10px', border: `1px solid ${i===0?'var(--neon-cyan)':'var(--line-2)'}`,
                background: i===0 ? 'rgba(0,229,255,.04)' : 'var(--bg-inset)',
                color: i===0 ? 'var(--fg-1)' : 'var(--fg-2)',
                cursor: 'pointer', borderRadius: 3,
              }}>
                <span>{c}</span>
                <span style={{ color: i===0 ? 'var(--neon-cyan)' : 'var(--fg-3)' }}>{[94,62,18][i]}%</span>
              </div>
            ))
          ) : item.type === 'match-receipt' ? (
            [
              { d: 'Chase •4481 · AWS US EAST', a: item.amount, c: 97 },
              { d: 'Amex •1007 · AWS INC',       a: item.amount, c: 62 },
              { d: 'Chase •4481 · AMAZON AWS',   a: item.amount + 12, c: 41 },
            ].map((x, i) => (
              <div key={i} style={{
                padding: '7px 10px',
                border: `1px solid ${i===0?'var(--neon-cyan)':'var(--line-2)'}`,
                background: i===0 ? 'rgba(0,229,255,.04)' : 'var(--bg-inset)',
                cursor: 'pointer', borderRadius: 3,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--fg-1)' }}>{x.d}</span>
                  <span style={{ color: i===0 ? 'var(--neon-cyan)' : 'var(--fg-3)' }}>{x.c}%</span>
                </div>
                <div style={{ color: 'var(--fg-3)', marginTop: 2 }}>{fmtUSD(x.a)} · Apr 17</div>
              </div>
            ))
          ) : (
            <div style={{ color: 'var(--fg-3)', padding: '8px 0' }}>Suggestions loading · last ok 3s</div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line-2)', display: 'flex', gap: 6, flexWrap: 'wrap', background: 'var(--bg-panel-2)' }}>
        {item.type === 'overdue-invoice' && <>
          <Button kind="primary" size="sm">Send reminder</Button>
          <Button kind="danger" size="sm">Escalate</Button>
        </>}
        {item.type === 'review-receipt' && <>
          <Button kind="primary" size="sm">Accept parse</Button>
          <Button kind="secondary" size="sm">Edit fields</Button>
        </>}
        {item.type === 'match-receipt' && <>
          <Button kind="primary" size="sm">Accept top match</Button>
          <Button kind="secondary" size="sm">Manual</Button>
        </>}
        {item.type === 'categorize' && <>
          <Button kind="primary" size="sm">Accept</Button>
          <Button kind="secondary" size="sm">Split</Button>
        </>}
        {item.type === 'reimbursable' && <>
          <Button kind="primary" size="sm">Approve</Button>
          <Button kind="danger" size="sm">Reject</Button>
        </>}
        <Button kind="ghost" size="sm">Defer</Button>
        <div style={{ flex: 1 }} />
        <Button kind="ghost" size="sm">Open ›</Button>
      </div>
    </div>
  );
}

Object.assign(window, { DetailDrawer });
