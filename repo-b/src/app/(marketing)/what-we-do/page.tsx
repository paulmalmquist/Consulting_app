'use client';

import React, { type ReactNode } from 'react';
import { NvButton } from '@/components/marketing/ui/NvButton';
import styles from './infographic.module.css';

const LEFT_COLORS  = ['#FFB020', '#9DD9C4', '#FF2E9A', '#B07CFF', '#FF7A1A'];
const RIGHT_COLORS = ['#00E5FF', '#5DADE2', '#B07CFF', '#FFD66B', '#4ADE80'];

const TINT: Record<string, string> = {
  '#FFB020': '#FFD27A', '#9DD9C4': '#C9F1DF', '#FF2E9A': '#FFB6D9',
  '#B07CFF': '#D6BFFF', '#FF7A1A': '#FFB073', '#7FF7F2': '#BFFCF8',
  '#00E5FF': '#9CF1FF', '#5DADE2': '#A6CFEC', '#FFD66B': '#FFE9A8',
  '#4ADE80': '#A8F0BC',
};

type Tone = 'cyan' | 'magenta';

const Pillar = ({ icon, k, tone, d }: { icon: ReactNode; k: string; tone: Tone; d: string }) => (
  <div>
    <div style={{ color: `var(--neon-${tone})`, marginBottom: 8 }}>{icon}</div>
    <div className="nv-label" style={{ color: `var(--neon-${tone})`, fontWeight: 700, letterSpacing: '0.14em' }}>{k}</div>
    <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 6, lineHeight: 1.4 }}>{d}</div>
  </div>
);

type ItemProps = { icon: ReactNode; title: string; sub: string; color?: string };

const SrcItem = ({ icon, title, sub, color = '#FFB020' }: ItemProps) => (
  <div style={{
    display: 'grid', gridTemplateColumns: '34px 1fr', gap: 10, padding: '8px 10px',
    border: '1px solid var(--line-2)', background: 'rgba(14,20,28,0.7)', alignItems: 'center',
    borderLeft: `2px solid ${color}`,
    boxShadow: `inset 8px 0 18px -8px ${color}55`,
  }}>
    <div style={{ color, display: 'grid', placeItems: 'center', filter: `drop-shadow(0 0 4px ${color}88)` }}>{icon}</div>
    <div>
      <div className="nv-label" style={{ color: 'var(--fg-1)', fontWeight: 700, letterSpacing: '0.12em' }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2, lineHeight: 1.3 }}>{sub}</div>
    </div>
  </div>
);

const DestItem = ({ icon, title, sub, color = '#00E5FF' }: ItemProps) => (
  <div style={{
    display: 'grid', gridTemplateColumns: '34px 1fr', gap: 10, padding: '8px 10px',
    border: '1px solid var(--line-2)', background: 'rgba(14,20,28,0.7)', alignItems: 'center',
    borderRight: `2px solid ${color}`,
    boxShadow: `inset -8px 0 18px -8px ${color}55`,
  }}>
    <div style={{ color, display: 'grid', placeItems: 'center', filter: `drop-shadow(0 0 4px ${color}88)` }}>{icon}</div>
    <div>
      <div className="nv-label" style={{ color: 'var(--fg-1)', fontWeight: 700, letterSpacing: '0.12em' }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2, lineHeight: 1.3 }}>{sub}</div>
    </div>
  </div>
);

const Step = ({ n, k, d, viz, arrow }: { n: string; k: string; d: string; viz: ReactNode; arrow?: boolean }) => (
  <div style={{ position: 'relative', padding: '0 6px' }}>
    {arrow && (
      <div style={{ position: 'absolute', left: -10, top: 56, color: 'var(--neon-cyan)', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, opacity: 0.7 }}>→</div>
    )}
    <div className="nv-label" style={{ color: 'var(--fg-3)' }}>{n}</div>
    <div style={{ height: 70, marginTop: 6, display: 'grid', placeItems: 'center' }}>{viz}</div>
    <div className="nv-label" style={{ color: 'var(--fg-1)', fontWeight: 700, marginTop: 8, letterSpacing: '0.14em' }}>{k}</div>
    <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 4, lineHeight: 1.4 }}>{d}</div>
  </div>
);

const Risk = ({ icon, k, d }: { icon: ReactNode; k: string; d: string }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr', gap: 10, alignItems: 'flex-start' }}>
    <div style={{ color: 'var(--neon-magenta)', marginTop: 2 }}>{icon}</div>
    <div>
      <div className="nv-label" style={{ color: 'var(--fg-1)', fontWeight: 700, letterSpacing: '0.12em' }}>{k}</div>
      <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 4, lineHeight: 1.4 }}>{d}</div>
    </div>
  </div>
);

const SIGNAL_RING = (() => {
  const stops: string[] = [];
  stops.push('rgba(0,229,255,0.0) 0deg');
  const right = RIGHT_COLORS;
  const left = LEFT_COLORS;
  right.forEach((c, i) => {
    const a = 18 + i * 36;
    stops.push(`${c}cc ${a - 14}deg`);
    stops.push(`${c} ${a}deg`);
    stops.push(`${c}cc ${a + 14}deg`);
  });
  left.slice().reverse().forEach((c, i) => {
    const a = 198 + i * 36;
    stops.push(`${c}cc ${a - 14}deg`);
    stops.push(`${c} ${a}deg`);
    stops.push(`${c}cc ${a + 14}deg`);
  });
  stops.push('rgba(0,229,255,0.0) 360deg');
  return `conic-gradient(from 0deg, ${stops.join(', ')})`;
})();

const NVNode = () => (
  <div style={{ position: 'relative', width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
    <div style={{
      position: 'absolute', inset: '-22%',
      background:
        'radial-gradient(closest-side at 18% 28%, rgba(255,176,32,0.18), transparent 70%),' +
        'radial-gradient(closest-side at 22% 72%, rgba(255,46,154,0.14), transparent 70%),' +
        'radial-gradient(closest-side at 78% 28%, rgba(0,229,255,0.26), transparent 70%),' +
        'radial-gradient(closest-side at 82% 72%, rgba(176,124,255,0.20), transparent 70%),' +
        'radial-gradient(closest-side at 50% 50%, rgba(157,217,196,0.10), transparent 75%)',
      filter: 'blur(14px)',
      pointerEvents: 'none',
    }} />

    <div style={{
      position: 'absolute',
      width: 'calc(82% + 4px)', aspectRatio: '620/404',
      background: SIGNAL_RING,
      padding: 2,
      pointerEvents: 'none',
      WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
      WebkitMaskComposite: 'xor',
      maskComposite: 'exclude',
      filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.15))',
    }} />

    <div style={{
      position: 'absolute', width: '82%', aspectRatio: '620/404',
      boxShadow:
        '0 0 28px rgba(0,229,255,0.18),' +
        '0 0 50px rgba(176,124,255,0.10),' +
        '0 0 80px rgba(255,46,154,0.06)',
      pointerEvents: 'none',
    }} />

    <div style={{
      position: 'relative', width: '82%', aspectRatio: '620/404',
      border: '1px solid rgba(255,255,255,0.18)',
      boxShadow: 'inset 0 0 18px rgba(0,229,255,0.10)',
      background: 'transparent',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 4,
        border: '1px solid rgba(127,247,242,0.14)',
        pointerEvents: 'none', zIndex: 3,
      }} />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/marketing/nv_mark_transparent.png"
        alt="NV"
        style={{
          position: 'absolute',
          inset: 6,
          width: 'calc(100% - 12px)', height: 'calc(100% - 12px)',
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
      />

      {[
        { top: -1, left: -1, borderTop: '1.5px solid rgba(255,255,255,0.7)', borderLeft: '1.5px solid rgba(255,255,255,0.7)' },
        { top: -1, right: -1, borderTop: '1.5px solid rgba(255,255,255,0.7)', borderRight: '1.5px solid rgba(255,255,255,0.7)' },
        { bottom: -1, left: -1, borderBottom: '1.5px solid rgba(255,255,255,0.7)', borderLeft: '1.5px solid rgba(255,255,255,0.7)' },
        { bottom: -1, right: -1, borderBottom: '1.5px solid rgba(255,255,255,0.7)', borderRight: '1.5px solid rgba(255,255,255,0.7)' },
      ].map((s, i) => (
        <div key={'br' + i} style={{ position: 'absolute', width: 12, height: 12, zIndex: 3, ...s }} />
      ))}

      {[20, 35, 50, 65, 80].map((p, i) => (
        <React.Fragment key={'tk' + i}>
          <div style={{
            position: 'absolute', left: -4, top: `${p}%`,
            width: 6, height: 1, background: LEFT_COLORS[i],
            boxShadow: `0 0 6px ${LEFT_COLORS[i]}`, zIndex: 3,
          }} />
          <div style={{
            position: 'absolute', right: -4, top: `${p}%`,
            width: 6, height: 1, background: RIGHT_COLORS[i],
            boxShadow: `0 0 6px ${RIGHT_COLORS[i]}`, zIndex: 3,
          }} />
        </React.Fragment>
      ))}
    </div>
  </div>
);

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Path = { sx: number; sy: number; c1x: number; c1y: number; c2x: number; c2y: number; ex: number; ey: number; idx: number; col: string };

const SparkFlow = () => {
  const W = 1000, H = 650;
  const cx = 500, cy = 315;
  const sqHalf = 108;
  const tickSpread = 36;

  const rand = mulberry32(8675309);
  const r = (a: number, b: number) => a + rand() * (b - a);
  const ri = (a: number, b: number) => Math.floor(r(a, b + 1));

  const leftYs = [125, 215, 305, 395, 485];
  const rightYs = [125, 215, 305, 395, 485];

  const leftPaths: Path[] = leftYs.map((y, i) => {
    const sx = 230, sy = y;
    const ex = cx - sqHalf - 4;
    const ey = cy + (i - 2) * tickSpread;
    const c1x = sx + 130, c1y = sy + (i - 2) * 4;
    const c2x = ex - 110, c2y = ey - (i - 2) * 6;
    return { sx, sy, c1x, c1y, c2x, c2y, ex, ey, idx: i, col: LEFT_COLORS[i] };
  });
  const rightPaths: Path[] = rightYs.map((y, i) => {
    const sx = cx + sqHalf + 4;
    const sy = cy + (i - 2) * tickSpread;
    const ex = 770, ey = y;
    const c1x = sx + 110, c1y = sy + (i - 2) * 4;
    const c2x = ex - 130, c2y = ey - (i - 2) * 6;
    return { sx, sy, c1x, c1y, c2x, c2y, ex, ey, idx: i, col: RIGHT_COLORS[i] };
  });
  const bezier = (p: Path, t: number) => ({
    x: (1 - t) ** 3 * p.sx + 3 * (1 - t) ** 2 * t * p.c1x + 3 * (1 - t) * t ** 2 * p.c2x + t ** 3 * p.ex,
    y: (1 - t) ** 3 * p.sy + 3 * (1 - t) ** 2 * t * p.c1y + 3 * (1 - t) * t ** 2 * p.c2y + t ** 3 * p.ey,
  });

  const scanlines = Array.from({ length: 42 }, () => {
    const x = r(360, 640);
    const h = r(60, 420);
    const y = r(50, 570 - h);
    const op = r(0.05, 0.22);
    const violet = rand() < 0.35;
    return { x, y, h, op, violet };
  });

  const warmClusters = [
    { x: [250, 360], y: [155, 230], n: 80,  density: 'sparse' },
    { x: [285, 430], y: [230, 315], n: 220, density: 'dense' },
    { x: [240, 415], y: [315, 410], n: 160, density: 'medium' },
    { x: [135, 260], y: [250, 360], n: 55,  density: 'faint' },
    { x: [360, 470], y: [190, 420], n: 200, density: 'tight' },
    { x: [120, 200], y: [120, 500], n: 40,  density: 'edge' },
  ];
  const warmDust: { x: number; y: number; size: number; op: number; col: string; bright: boolean; glowCol?: string }[] = [];
  warmClusters.forEach(cl => {
    for (let i = 0; i < cl.n; i++) {
      const x = r(cl.x[0], cl.x[1]);
      const y = r(cl.y[0], cl.y[1]);
      let nearest = leftPaths[0]; let nd = 1e9;
      for (const p of leftPaths) {
        const d = Math.abs(y - ((p.sy + p.ey) / 2 + (p.c1y + p.c2y - p.sy - p.ey) / 4));
        if (d < nd) { nd = d; nearest = p; }
      }
      const t = Math.max(0.05, Math.min(0.95, (x - nearest.sx) / (nearest.ex - nearest.sx)));
      const onPath = bezier(nearest, t);
      const pull = cl.density === 'dense' ? 0.55 : cl.density === 'tight' ? 0.7 : cl.density === 'medium' ? 0.35 : 0.15;
      const yy = y * (1 - pull) + onPath.y * pull + r(-14, 14);
      const tintCol = TINT[nearest.col] || nearest.col;
      const palette = [nearest.col, nearest.col, nearest.col, tintCol, tintCol, '#FFD27A'];
      const col = palette[ri(0, palette.length - 1)];
      const isBright = rand() < 0.06;
      const size = isBright ? r(2.0, 3.0) : r(0.5, 2.0);
      const op = isBright ? r(0.7, 0.95) : r(0.12, 0.65);
      warmDust.push({ x, y: yy, size, op, col, bright: isBright, glowCol: nearest.col });
    }
  });

  const warmStreaks = Array.from({ length: 42 }, () => {
    const x = r(160, 440);
    const y = r(150, 430);
    const len = r(4, 18);
    const angle = r(-0.25, 0.25);
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    const sw = r(0.5, 1.2);
    const op = r(0.18, 0.6);
    let nearest = leftPaths[0]; let nd = 1e9;
    for (const p of leftPaths) {
      const t = Math.max(0.05, Math.min(0.95, (x - p.sx) / (p.ex - p.sx)));
      const py = bezier(p, t).y;
      const d = Math.abs(y - py);
      if (d < nd) { nd = d; nearest = p; }
    }
    const col = rand() < 0.3 ? (TINT[nearest.col] || nearest.col) : nearest.col;
    const glow = x > 360;
    return { x, y, x2, y2, sw, op, col, glow };
  });

  const coolClusters = [
    { x: [540, 630], y: [185, 390], n: 200, density: 'dense' },
    { x: [630, 760], y: [140, 250], n: 130, density: 'aligned' },
    { x: [630, 780], y: [300, 430], n: 130, density: 'aligned' },
    { x: [780, 900], y: [150, 400], n: 70,  density: 'sparse' },
  ];
  const coolDust: { x: number; y: number; size: number; op: number; col: string; bright: boolean }[] = [];
  coolClusters.forEach(cl => {
    for (let i = 0; i < cl.n; i++) {
      const x = r(cl.x[0], cl.x[1]);
      const y = r(cl.y[0], cl.y[1]);
      let nearest = rightPaths[0]; let nd = 1e9;
      for (const p of rightPaths) {
        const my = (p.sy + p.ey) / 2;
        const d = Math.abs(y - my);
        if (d < nd) { nd = d; nearest = p; }
      }
      const t = Math.max(0.05, Math.min(0.95, (x - nearest.sx) / (nearest.ex - nearest.sx)));
      const onPath = bezier(nearest, t);
      const pull = cl.density === 'dense' ? 0.6 : cl.density === 'aligned' ? 0.75 : 0.3;
      const yy = y * (1 - pull) + onPath.y * pull + r(-8, 8);
      const tintCol = TINT[nearest.col] || nearest.col;
      const palette = [nearest.col, nearest.col, tintCol, '#BFFCF8', '#7FB8C8'];
      const col = palette[ri(0, palette.length - 1)];
      const isBright = rand() < 0.05;
      const size = isBright ? r(1.6, 2.4) : r(0.4, 1.6);
      const op = isBright ? r(0.65, 0.9) : r(0.10, 0.55);
      coolDust.push({ x, y: yy, size, op, col, bright: isBright });
    }
  });

  const centerDust = Array.from({ length: 110 }, () => {
    let x: number, y: number;
    const side = ri(0, 3);
    const span = sqHalf + 60;
    if (side === 0) { x = cx + r(-span, -sqHalf - 4); y = cy + r(-span, span); }
    else if (side === 1) { x = cx + r(sqHalf + 4, span); y = cy + r(-span, span); }
    else if (side === 2) { x = cx + r(-span, span); y = cy + r(-span, -sqHalf - 4); }
    else { x = cx + r(-span, span); y = cy + r(sqHalf + 4, span); }
    const onRight = x > cx;
    const col = onRight
      ? (rand() < 0.5 ? '#7FF7F2' : '#00E5FF')
      : (rand() < 0.5 ? '#FFB020' : '#B07CFF');
    const size = r(0.35, 1.2);
    const op = r(0.08, 0.35);
    return { x, y, size, op, col };
  });

  const leftEndpoints = leftPaths.map(p => ({ x: p.sx - 4, y: p.sy, col: p.col }));
  const rightEndpoints = rightPaths.map(p => ({ x: p.ex + 4, y: p.ey, col: p.col }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
         style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <defs>
        {leftPaths.map((p, i) => (
          <linearGradient key={'lpg' + i} id={`lpg${i}`} x1={p.sx} y1={p.sy} x2={p.ex} y2={p.ey} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={p.col} stopOpacity="0.0" />
            <stop offset="20%" stopColor={p.col} stopOpacity="0.85" />
            <stop offset="100%" stopColor={p.col} stopOpacity="0.95" />
          </linearGradient>
        ))}
        {rightPaths.map((p, i) => (
          <linearGradient key={'rpg' + i} id={`rpg${i}`} x1={p.sx} y1={p.sy} x2={p.ex} y2={p.ey} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={p.col} stopOpacity="0.95" />
            <stop offset="80%" stopColor={p.col} stopOpacity="0.7" />
            <stop offset="100%" stopColor={p.col} stopOpacity="0.0" />
          </linearGradient>
        ))}
        {Array.from(new Set([...LEFT_COLORS, ...RIGHT_COLORS])).map((c, i) => (
          <radialGradient key={'rg' + i} id={`rg-${c.replace('#', '')}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={TINT[c] || c} stopOpacity="1" />
            <stop offset="50%" stopColor={c} stopOpacity="0.7" />
            <stop offset="100%" stopColor={c} stopOpacity="0" />
          </radialGradient>
        ))}
        <radialGradient id="warmGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFD27A" stopOpacity="1" />
          <stop offset="50%" stopColor="#FFB020" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#FFB020" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="coolGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#BFFCF8" stopOpacity="1" />
          <stop offset="50%" stopColor="#7FF7F2" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#7FF7F2" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="platformCyan" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7FF7F2" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#7FF7F2" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="platformViolet" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#B07CFF" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#B07CFF" stopOpacity="0" />
        </radialGradient>
        <filter id="streakGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>

      <g opacity="0.9">
        {scanlines.map((s, i) => (
          <line key={'sc' + i} x1={s.x} y1={s.y} x2={s.x} y2={s.y + s.h}
                stroke={s.violet ? '#B07CFF' : '#7FF7F2'} strokeOpacity={s.op}
                strokeWidth={r(0.3, 0.7)} />
        ))}
      </g>

      <g>
        <ellipse cx={cx} cy={540} rx="180" ry="36" fill="url(#platformViolet)" />
        <ellipse cx={cx} cy={552} rx="220" ry="22" fill="url(#platformCyan)" />
        {[0, 1, 2, 3].map(i => (
          <ellipse key={'pe' + i} cx={cx} cy={520 + i * 14} rx={140 - i * 18} ry={6 - i * 0.8}
                   fill="none" stroke={i % 2 ? '#7FF7F2' : '#B07CFF'} strokeOpacity={0.22 - i * 0.04} strokeWidth="0.6" />
        ))}
        {[-30, -10, 10, 30].map((dx, i) => (
          <line key={'lt' + i} x1={cx + dx} y1={cy + sqHalf - 4} x2={cx + dx} y2={540}
                stroke="#7FF7F2" strokeOpacity={0.18} strokeWidth="0.5" />
        ))}
      </g>

      <g>
        {warmDust.map((d, i) => (
          d.bright
            ? <circle key={'wd' + i} cx={d.x} cy={d.y} r={d.size + 1.5} fill={`url(#rg-${(d.glowCol || '#FFB020').replace('#', '')})`} opacity={d.op} />
            : <circle key={'wd' + i} cx={d.x} cy={d.y} r={d.size} fill={d.col} opacity={d.op} />
        ))}
      </g>

      <g>
        {warmStreaks.map((s, i) => (
          <line key={'ws' + i} x1={s.x} y1={s.y} x2={s.x2} y2={s.y2}
                stroke={s.col} strokeOpacity={s.op} strokeWidth={s.sw}
                strokeLinecap="round"
                filter={s.glow ? 'url(#streakGlow)' : undefined} />
        ))}
      </g>

      <g>
        {coolDust.map((d, i) => (
          d.bright
            ? <circle key={'cd' + i} cx={d.x} cy={d.y} r={d.size + 1.2} fill="url(#coolGlow)" opacity={d.op} />
            : <circle key={'cd' + i} cx={d.x} cy={d.y} r={d.size} fill={d.col} opacity={d.op} />
        ))}
      </g>

      <g>
        {centerDust.map((d, i) => (
          <circle key={'ch' + i} cx={d.x} cy={d.y} r={d.size} fill={d.col} opacity={d.op} />
        ))}
      </g>

      <g>
        {leftPaths.map((p, i) => (
          <g key={'lp' + i}>
            <path d={`M ${p.sx} ${p.sy} C ${p.c1x} ${p.c1y}, ${p.c2x} ${p.c2y}, ${p.ex} ${p.ey}`}
                  stroke={`url(#lpg${i})`}
                  strokeWidth={i === 2 ? 1.4 : 1.0}
                  fill="none" opacity={0.9} />
            <path d={`M ${p.sx + (p.ex - p.sx) * 0.55} ${(1 - 0.55) ** 3 * p.sy + 3 * (1 - 0.55) ** 2 * 0.55 * p.c1y + 3 * (1 - 0.55) * 0.55 ** 2 * p.c2y + 0.55 ** 3 * p.ey} L ${p.ex} ${p.ey}`}
                  stroke={p.col} strokeOpacity="0.45" strokeWidth="2.4" fill="none" filter="url(#streakGlow)" />
            {[0.25, 0.5, 0.72, 0.9].map((t, ti) => {
              const b = bezier(p, t);
              return <circle key={ti} cx={b.x} cy={b.y} r={1.2 + ti * 0.3} fill={`url(#rg-${p.col.replace('#', '')})`} opacity={0.85} />;
            })}
          </g>
        ))}
        {leftEndpoints.map((e, i) => (
          <g key={'le' + i}>
            <circle cx={e.x} cy={e.y} r="3.8" fill={`url(#rg-${e.col.replace('#', '')})`} opacity="0.95" />
            <circle cx={e.x} cy={e.y} r="1.5" fill={TINT[e.col] || e.col} />
          </g>
        ))}
      </g>

      <g>
        {rightPaths.map((p, i) => (
          <g key={'rp' + i}>
            <path d={`M ${p.sx} ${p.sy} C ${p.c1x} ${p.c1y}, ${p.c2x} ${p.c2y}, ${p.ex} ${p.ey}`}
                  stroke={`url(#rpg${i})`}
                  strokeWidth={i === 2 ? 1.4 : 1.0}
                  fill="none" opacity={0.95} />
            <path d={`M ${p.sx} ${p.sy} L ${p.sx + (p.ex - p.sx) * 0.25} ${(1 - 0.25) ** 3 * p.sy + 3 * (1 - 0.25) ** 2 * 0.25 * p.c1y + 3 * (1 - 0.25) * 0.25 ** 2 * p.c2y + 0.25 ** 3 * p.ey}`}
                  stroke={p.col} strokeOpacity="0.45" strokeWidth="2.4" fill="none" filter="url(#streakGlow)" />
            {[0.15, 0.4, 0.65, 0.85].map((t, ti) => {
              const b = bezier(p, t);
              return <circle key={ti} cx={b.x} cy={b.y} r={1.2 + ti * 0.25} fill={`url(#rg-${p.col.replace('#', '')})`} opacity={0.85} />;
            })}
          </g>
        ))}
        {rightEndpoints.map((e, i) => (
          <g key={'re' + i}>
            <circle cx={e.x} cy={e.y} r="3.8" fill={`url(#rg-${e.col.replace('#', '')})`} opacity="0.95" />
            <circle cx={e.x} cy={e.y} r="1.5" fill={TINT[e.col] || e.col} />
          </g>
        ))}
      </g>
    </svg>
  );
};

const strokeAttrs = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Svg = ({ size = 22, children }: { size?: number; children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...strokeAttrs}>{children}</svg>
);

const EyeIcon = () => <Svg><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
const ShieldIcon = () => <Svg><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></Svg>;
const NodesIcon = () => <Svg><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M7.6 7.4l3 9M16.4 7.4l-3 9" /></Svg>;
const ChartUpIcon = () => <Svg><path d="M3 20h18" /><path d="M5 16l4-4 3 3 6-7" /><path d="M14 8h4v4" /></Svg>;
const GearIcon = () => <Svg><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></Svg>;
const DollarIcon = () => <Svg><path d="M12 3v18" /><path d="M16 7H10a3 3 0 000 6h4a3 3 0 010 6H8" /></Svg>;
const ChatIcon = () => <Svg><path d="M4 5h16v11H8l-4 4V5z" /><path d="M8 9h8M8 12h5" /></Svg>;
const DocIcon = () => <Svg><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 13h8M9 16h6" /></Svg>;
const PinIcon = () => <Svg><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" /><circle cx="12" cy="9" r="2.5" /></Svg>;
const BadgeCheckIcon = () => <Svg><path d="M12 2l2.5 2 3.5-.3.7 3.4L21 9l-1.6 3.1.6 3.5L17 17l-1.7 3.1-3.3-.6-3 1.5-2.4-2.5L3 17.5l.5-3.5L2 11l2.4-2.6L4 5l3.4-.5L9.6 2 12 2z" /><path d="M9 12l2 2 4-4" /></Svg>;
const DownloadIcon = () => <Svg><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 21h16" /></Svg>;
const UserCircleIcon = () => <Svg><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M5.5 19c1.4-2.4 3.8-4 6.5-4s5.1 1.6 6.5 4" /></Svg>;
const ListIcon = () => <Svg><path d="M5 4h14v16H5z" /><path d="M9 8h7M9 12h7M9 16h5" /></Svg>;
const BarsIcon = () => <Svg><path d="M5 21V11" /><path d="M11 21V5" /><path d="M17 21v-7" /><path d="M3 21h18" /></Svg>;
const LockIcon = () => <Svg><rect x="5" y="11" width="14" height="9" rx="1" /><path d="M8 11V8a4 4 0 018 0v3" /></Svg>;
const WarnIcon = () => <Svg><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18v.5" /></Svg>;
const LayersIcon = () => <Svg><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /><path d="M3 17l9 5 9-5" /></Svg>;
const EyeOffIcon = () => <Svg><path d="M3 3l18 18" /><path d="M10.6 6.2A10 10 0 0112 6c6.5 0 10 7 10 7a18 18 0 01-3.5 4.4M6 7.5C3.5 9.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.3 4.3-.8" /><path d="M9.5 9.5a3 3 0 004 4" /></Svg>;
const XCircleIcon = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></Svg>;

const RadarViz = () => (
  <svg viewBox="0 0 80 60" width="76" height="60">
    <circle cx="40" cy="30" r="22" fill="none" stroke="rgba(255,176,32,0.35)" />
    <circle cx="40" cy="30" r="14" fill="none" stroke="rgba(255,176,32,0.45)" />
    <circle cx="40" cy="30" r="6" fill="none" stroke="rgba(255,176,32,0.6)" />
    <line x1="40" y1="8" x2="40" y2="52" stroke="rgba(255,176,32,0.25)" />
    <line x1="18" y1="30" x2="62" y2="30" stroke="rgba(255,176,32,0.25)" />
    <path d="M40 30 L60 18 A24 24 0 0 0 50 8 Z" fill="rgba(255,176,32,0.25)" />
    <circle cx="28" cy="22" r="1.6" fill="#FFB020" />
    <circle cx="52" cy="40" r="1.6" fill="#FFB020" />
    <circle cx="46" cy="20" r="1.6" fill="#FFB020" />
  </svg>
);
const StackViz = () => (
  <svg viewBox="0 0 80 60" width="76" height="60">
    {[0, 1, 2].map(i => (
      <g key={i} transform={`translate(0 ${i * 10})`}>
        <path d={`M40 ${10 + i * 4} L62 ${20 + i * 4} L40 ${30 + i * 4} L18 ${20 + i * 4} Z`}
              fill="rgba(0,229,255,0.08)" stroke="rgba(0,229,255,0.55)" />
      </g>
    ))}
  </svg>
);
const CubesViz = () => (
  <svg viewBox="0 0 80 60" width="76" height="60">
    {([[20, 18, '#FF2E9A'], [42, 12, '#00E5FF'], [34, 30, '#B07CFF']] as const).map(([x, y, c], i) => (
      <g key={i} transform={`translate(${x} ${y})`}>
        <path d="M0 0 L14 -6 L28 0 L14 6 Z" fill="rgba(0,0,0,0.4)" stroke={c} />
        <path d="M0 0 L0 14 L14 20 L14 6 Z" fill={`${c}33`} stroke={c} />
        <path d="M28 0 L28 14 L14 20 L14 6 Z" fill={`${c}55`} stroke={c} />
      </g>
    ))}
  </svg>
);
const ShieldViz = () => (
  <svg viewBox="0 0 80 60" width="76" height="60">
    <path d="M40 6 L62 14 V32 C62 44 50 52 40 54 C30 52 18 44 18 32 V14 Z"
          fill="rgba(0,229,255,0.08)" stroke="#00E5FF" strokeWidth="1.4" />
    <path d="M30 30 L38 38 L52 22" fill="none" stroke="#00E5FF" strokeWidth="1.6" />
  </svg>
);
const TemplateViz = () => (
  <svg viewBox="0 0 80 60" width="76" height="60">
    {[0, 1, 2].map(i => (
      <rect key={i} x={14 + i * 8} y={10 + i * 6} width="44" height="30" rx="2"
            fill="rgba(176,124,255,0.10)" stroke="rgba(176,124,255,0.7)" />
    ))}
    <path d="M30 32 L38 40 L54 24" fill="none" stroke="#B07CFF" />
  </svg>
);
const GrowthViz = () => (
  <svg viewBox="0 0 80 60" width="76" height="60">
    {[10, 18, 26, 34, 42, 50].map((x, i) => (
      <rect key={i} x={x} y={50 - (i * 4 + 10)} width="6" height={i * 4 + 10}
            fill="rgba(0,229,255,0.18)" stroke="#00E5FF" />
    ))}
    <path d="M10 40 L60 8" stroke="#00E5FF" strokeWidth="1.4" fill="none" />
    <path d="M52 8 L60 8 L60 16" stroke="#00E5FF" fill="none" />
  </svg>
);

const Infographic = () => (
  <div className="nv-art" style={{ width: 1400, height: 1000, position: 'relative', overflow: 'hidden', padding: '40px 48px' }}>
    <div style={{
      position: 'absolute', inset: 0,
      background:
        'radial-gradient(700px 300px at 18% 8%, rgba(176,124,255,0.08), transparent 60%),' +
        'radial-gradient(700px 300px at 82% 8%, rgba(0,229,255,0.07), transparent 60%),' +
        'radial-gradient(900px 360px at 50% 38%, rgba(176,124,255,0.06), transparent 65%)',
      pointerEvents: 'none',
    }} />

    <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.5fr', gap: 28, position: 'relative', zIndex: 2 }}>
      <div>
        <h1 style={{
          margin: 0, fontFamily: 'Manrope, "DM Sans", system-ui, sans-serif', fontWeight: 700,
          fontSize: 40, lineHeight: 1.08, letterSpacing: '-0.025em',
          textTransform: 'none',
          color: 'var(--fg-1)',
        }}>
          <span style={{ color: '#B07CFF' }}>AI</span> is happening.<br />
          Control the{' '}
          <span style={{ color: '#FF1F3D' }}>risk</span>.<br />
          Capture the{' '}
          <span style={{ color: '#9DD9C4' }}>advantage</span>.
        </h1>
        <p style={{
          fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 14, lineHeight: 1.55,
          color: 'var(--fg-2)', marginTop: 18, maxWidth: 420,
        }}>
          Novendor discovers how AI is being used across your business, turns scattered activity into governed workflows, and scales what works — safely — across your organization.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 28 }}>
          <Pillar icon={<EyeIcon />} k="SEE" tone="cyan" d="Uncover AI usage across teams and tools." />
          <Pillar icon={<ShieldIcon />} k="GOVERN" tone="cyan" d="Apply controls, data rules, and human oversight." />
          <Pillar icon={<NodesIcon />} k="STANDARDIZE" tone="magenta" d="Turn proven patterns into approved workflows." />
          <Pillar icon={<ChartUpIcon />} k="SCALE" tone="cyan" d="Reuse what works. Measure impact. Drive value." />
        </div>
      </div>

      <div style={{ position: 'relative', height: 480 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', position: 'absolute', top: 0, left: 0, right: 0, padding: '0 8px' }}>
          <div>
            <div className="nv-label" style={{ color: 'var(--neon-amber)', letterSpacing: '0.16em', fontWeight: 700 }}>UNSEEN. UNGOVERNED.</div>
            <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', color: 'var(--fg-2)', fontSize: 13, marginTop: 4 }}>AI sprawl creates risk.</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="nv-label" style={{ color: 'var(--neon-cyan)', letterSpacing: '0.16em', fontWeight: 700 }}>VISIBLE. GOVERNED.</div>
            <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', color: 'var(--fg-2)', fontSize: 13, marginTop: 4 }}>AI becomes an advantage.</div>
          </div>
        </div>

        <SparkFlow />

        <div style={{
          position: 'absolute', left: '50%', top: 232, transform: 'translate(-50%, -50%)',
          width: 180, height: 180, zIndex: 3,
        }}>
          <NVNode />
        </div>

        <div style={{ position: 'absolute', left: 0, top: 60, display: 'grid', gap: 14, width: 220, zIndex: 4 }}>
          <SrcItem icon={<GearIcon />}   title="OPERATIONS"  sub="Claude chats & file uploads"     color={LEFT_COLORS[0]} />
          <SrcItem icon={<DollarIcon />} title="FINANCE"     sub="Analysis & report drafts"        color={LEFT_COLORS[1]} />
          <SrcItem icon={<ChatIcon />}   title="SALES"       sub="Proposals & customer responses"  color={LEFT_COLORS[2]} />
          <SrcItem icon={<DocIcon />}    title="LEGAL"       sub="Contract & document reviews"     color={LEFT_COLORS[3]} />
          <SrcItem icon={<PinIcon />}    title="FIELD TEAMS" sub="Reports & site updates"          color={LEFT_COLORS[4]} />
        </div>

        <div style={{ position: 'absolute', right: 0, top: 60, display: 'grid', gap: 14, width: 240, zIndex: 4 }}>
          <DestItem icon={<BadgeCheckIcon />} title="APPROVED WORKFLOWS" sub="Owned. Versioned. Reusable."              color={RIGHT_COLORS[0]} />
          <DestItem icon={<DownloadIcon />}   title="DATA CONTROLS"      sub="Sources verified. Access enforced."       color={RIGHT_COLORS[1]} />
          <DestItem icon={<UserCircleIcon />} title="HUMAN OVERSIGHT"    sub="Review, approve, and audit."              color={RIGHT_COLORS[2]} />
          <DestItem icon={<ListIcon />}       title="AUDIT TRAIL"        sub="Every action. Every time."                color={RIGHT_COLORS[3]} />
          <DestItem icon={<BarsIcon />}       title="MEASURABLE IMPACT"  sub="Time saved. Risk reduced. Value created." color={RIGHT_COLORS[4]} />
        </div>
      </div>
    </div>

    <div style={{ marginTop: 24, position: 'relative', zIndex: 2 }}>
      <div className="nv-label" style={{ color: 'var(--fg-3)', textAlign: 'center', letterSpacing: '0.18em', marginBottom: 14 }}>
        FROM AI ACTIVITY TO BUSINESS ASSETS
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, alignItems: 'start' }}>
        <Step n="01" k="DISCOVER"      d="Find AI usage across people, teams, and tools." viz={<RadarViz />} />
        <Step n="02" k="INVENTORY"     d="Capture workflows, prompts, data sources, and outputs." viz={<StackViz />} arrow />
        <Step n="03" k="CLASSIFY"      d="Assess risk, data sensitivity, and business impact." viz={<CubesViz />} arrow />
        <Step n="04" k="GOVERN"        d="Apply controls, approvals, and operating rules." viz={<ShieldViz />} arrow />
        <Step n="05" k="STANDARDIZE"   d="Create approved workflows and shared templates." viz={<TemplateViz />} arrow />
        <Step n="06" k="SCALE & IMPROVE" d="Drive adoption, measure outcomes, and continuously optimize." viz={<GrowthViz />} arrow />
      </div>
    </div>

    <div className="nv-panel" style={{ marginTop: 20, padding: '14px 18px', position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr 1fr 1fr', gap: 20, alignItems: 'center' }}>
      <div>
        <div className="nv-label" style={{ color: 'var(--fg-1)', letterSpacing: '0.16em', fontWeight: 700 }}>THE RISK OF UNGOVERNED AI</div>
        <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 6, lineHeight: 1.45 }}>Without visibility and control, AI sprawl creates operational, financial, and reputational <span style={{ color: 'var(--neon-magenta)' }}>risk</span>.</div>
      </div>
      <Risk icon={<LockIcon />}    k="DATA EXPOSURE"   d="Sensitive data shared without knowing." />
      <Risk icon={<WarnIcon />}    k="DECISION RISK"   d="Answers used without review or context." />
      <Risk icon={<LayersIcon />}  k="DUPLICATION"     d="Teams repeat work and reinvent solutions." />
      <Risk icon={<EyeOffIcon />}  k="NO AUDIT TRAIL"  d="No record of what happened or why." />
      <Risk icon={<XCircleIcon />} k="MISSED VALUE"    d="Good patterns never shared or scaled." />
    </div>
  </div>
);

export default function WhatWeDoPage() {
  return (
    <div className={styles.shell}>
      <div className={styles.scaler}>
        <div className={styles.canvas}>
          <Infographic />
        </div>
      </div>
      <div className={styles.cta}>
        <NvButton variant="primary" href="/contact">See where AI is blocked in your workflow</NvButton>
      </div>
    </div>
  );
}
