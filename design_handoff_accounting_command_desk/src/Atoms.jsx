// Shared atoms — reused from Novendor ops terminal kit, adapted for accounting surface
const { useState, useEffect, useRef, useMemo } = React;

function Dot({ color = 'var(--neon-cyan)', glow = true, size = 6 }) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color, boxShadow: glow ? `0 0 6px ${color}` : 'none', flex: 'none' }} />;
}

function Caps({ children, color = 'var(--fg-3)', size = 10, style }) {
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: size, letterSpacing: '.1em', textTransform: 'uppercase', color, whiteSpace: 'nowrap', ...style }}>{children}</span>;
}

function Badge({ tone = 'neutral', children, glow = false, size = 'md' }) {
  const tones = {
    live:    { fg: 'var(--neon-cyan)', bg: 'rgba(0,229,255,.1)',   bd: 'rgba(0,229,255,.3)' },
    up:      { fg: 'var(--sem-up)', bg: 'rgba(0,229,160,.1)',   bd: 'rgba(0,229,160,.3)' },
    down:    { fg: 'var(--sem-down)', bg: 'rgba(255,59,92,.1)',   bd: 'rgba(255,59,92,.3)' },
    error:   { fg: 'var(--bg-void)', bg: 'var(--sem-error)',              bd: 'var(--sem-error)' },
    warn:    { fg: 'var(--neon-amber)', bg: 'rgba(255,176,32,.1)',  bd: 'rgba(255,176,32,.35)' },
    manual:  { fg: 'var(--neon-amber)', bg: 'rgba(255,176,32,.06)', bd: 'rgba(255,176,32,.5)', dashed: true },
    stale:   { fg: 'var(--fg-3)', bg: 'transparent',      bd: 'var(--line-2)' },
    tag:     { fg: 'var(--neon-violet)', bg: 'rgba(176,124,255,.08)',bd: 'rgba(176,124,255,.3)' },
    route:   { fg: 'var(--neon-magenta)', bg: 'rgba(255,46,154,.08)', bd: 'rgba(255,46,154,.3)' },
    lime:    { fg: 'var(--neon-lime)', bg: 'rgba(158,255,0,.08)',  bd: 'rgba(158,255,0,.35)' },
    neutral: { fg: 'var(--fg-2)', bg: 'var(--bg-panel-2)', bd: 'var(--line-2)' },
  };
  const t = tones[tone] || tones.neutral;
  const px = size === 'sm' ? '2px 5px' : '3px 7px';
  const fs = size === 'sm' ? 9 : 10;
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: fs, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase',
      padding: px, borderRadius: 2, display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1,
      color: t.fg, background: t.bg,
      border: `1px ${t.dashed ? 'dashed' : 'solid'} ${t.bd}`,
      boxShadow: glow ? `0 0 10px ${t.fg}55` : 'none',
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function Button({ kind = 'secondary', children, onClick, icon, size = 'md', style, title }) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const sizes = {
    xs: { h: 22, px: 8,  fs: 10 },
    sm: { h: 24, px: 10, fs: 10 },
    md: { h: 28, px: 14, fs: 11 },
    lg: { h: 32, px: 18, fs: 12 },
  };
  const s = sizes[size];
  const kinds = {
    primary: {
      bg: hover ? 'var(--neon-cyan)' : 'var(--neon-cyan)', color: 'var(--bg-void)', border: 'var(--neon-cyan)',
      shadow: hover ? '0 0 0 1px rgba(0,229,255,.4),0 0 20px rgba(0,229,255,.55)' : '0 0 0 1px rgba(0,229,255,.25),0 0 14px rgba(0,229,255,.35)',
    },
    accent: {
      bg: hover ? 'rgba(0,229,255,.1)' : 'transparent', color: 'var(--neon-cyan)',
      border: 'var(--neon-cyan)',
      shadow: hover ? '0 0 12px rgba(0,229,255,.35)' : 'none',
    },
    magenta: {
      bg: hover ? 'rgba(255,46,154,.1)' : 'transparent', color: 'var(--neon-magenta)',
      border: 'var(--neon-magenta)',
      shadow: hover ? '0 0 12px rgba(255,46,154,.35)' : 'none',
    },
    secondary: {
      bg: hover ? 'var(--bg-row-hover)' : 'transparent', color: 'var(--fg-1)',
      border: hover ? 'var(--fg-3)' : 'var(--line-3)',
    },
    danger: {
      bg: hover ? 'rgba(255,59,92,.12)' : 'transparent', color: 'var(--sem-down)',
      border: 'var(--sem-down)', shadow: hover ? '0 0 12px rgba(255,59,92,.4)' : 'none',
    },
    ghost: {
      bg: hover ? 'var(--bg-row-hover)' : 'transparent',
      color: hover ? 'var(--fg-1)' : 'var(--fg-2)', border: 'transparent',
    },
  };
  const k = kinds[kind] || kinds.secondary;
  return (
    <button title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)} onMouseUp={() => setPress(false)}
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-mono)', fontSize: s.fs, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase',
        padding: `0 ${s.px}px`, height: s.h, lineHeight: 1, borderRadius: 3,
        background: k.bg, color: k.color, border: `1px solid ${k.border}`,
        boxShadow: k.shadow || 'none',
        display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        transition: 'all 80ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        transform: press ? 'translateY(1px)' : 'none',
        whiteSpace: 'nowrap',
        ...style,
      }}>
      {icon}{children}
    </button>
  );
}

function Field({ value, onChange, placeholder, prefix, suffix, style, mono = true, height = 28 }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: 'var(--bg-inset)',
      border: `1px solid ${focus ? 'var(--neon-cyan)' : 'var(--line-2)'}`,
      borderRadius: 3,
      height,
      boxShadow: focus ? '0 0 0 1px rgba(0,229,255,.3),0 0 12px rgba(0,229,255,.2)' : 'none',
      transition: 'all 80ms',
      ...style,
    }}>
      {prefix && <span style={{ padding: '0 8px', color: 'var(--neon-magenta)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{prefix}</span>}
      <input
        value={value ?? ''} onChange={onChange} placeholder={placeholder}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          flex: 1, background: 'transparent', border: 0, outline: 'none',
          color: 'var(--fg-1)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize: 11, padding: '0 10px', paddingLeft: prefix ? 0 : 10,
          height: '100%',
        }}
      />
      {suffix && <span style={{ padding: '0 8px', color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em' }}>{suffix}</span>}
    </div>
  );
}

// Dropdown-like pill for compact filter row
function FilterPill({ label, value, icon, onClick, active }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      fontFamily: 'var(--font-mono)', fontSize: 11,
      padding: '0 10px', height: 26, borderRadius: 3,
      border: `1px solid ${active ? 'var(--neon-cyan)' : hover ? 'var(--line-3)' : 'var(--line-2)'}`,
      background: active ? 'rgba(0,229,255,.06)' : hover ? 'var(--bg-row-hover)' : 'var(--bg-inset)',
      color: active ? 'var(--neon-cyan)' : 'var(--fg-1)',
      cursor: 'pointer',
      transition: 'all 80ms',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ color: active ? 'var(--neon-cyan)' : 'var(--fg-3)', letterSpacing: '.08em', fontSize: 10, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ color: active ? 'var(--neon-cyan)' : 'var(--fg-1)' }}>{value}</span>
      <span style={{ color: 'var(--fg-4)', fontSize: 8 }}>▾</span>
    </div>
  );
}

function Sparkline({ points, color = 'var(--neon-cyan)', fill = true, height = 32, strokeWidth = 1.2 }) {
  const w = 200, h = height;
  const max = Math.max(...points), min = Math.min(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`);
  const gid = `sg-${color.replace(/[^a-z0-9]/gi, '')}-${height}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <polygon fill={`url(#${gid})`} points={`${coords.join(' ')} ${w},${h} 0,${h}`} />}
      <polyline fill="none" stroke={color} strokeWidth={strokeWidth} points={coords.join(' ')} />
      <circle cx={w} cy={h - ((points[points.length - 1] - min) / range) * (h - 4) - 2} r="2" fill={color} />
    </svg>
  );
}

function ScanlineFrame({ children, style }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', ...style }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
        background: 'repeating-linear-gradient(0deg,transparent 0 3px,rgba(0,229,255,.025) 3px 4px)',
      }} />
      {children}
    </div>
  );
}

function useLiveClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

function LiveClock() {
  const t = useLiveClock();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--fg-1)', letterSpacing: '.04em' }}>
      {t.getUTCFullYear()}-{pad(t.getUTCMonth()+1)}-{pad(t.getUTCDate())} · {pad(t.getUTCHours())}:{pad(t.getUTCMinutes())}:{pad(t.getUTCSeconds())} UTC
    </span>
  );
}

function fmtUSD(n, decimals = 2) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtUSDK(n) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return fmtUSD(n, 0);
}

Object.assign(window, { Dot, Caps, Badge, Button, Field, FilterPill, Sparkline, ScanlineFrame, LiveClock, useLiveClock, fmtUSD, fmtUSDK });
